import assert from 'node:assert/strict';
import test from 'node:test';
import { createECDH, createHmac, createDecipheriv } from 'node:crypto';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  createVapidJwt,
  encryptAes128Gcm,
  sendPushMessage,
  verifyVapidJwt,
  type VapidConfig,
} from './web-push.ts';

async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string; jwkPublic: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwkPublic = await crypto.subtle.exportKey('jwk', keyPair.publicKey) as JsonWebKey;
  const jwkPrivate = await crypto.subtle.exportKey('jwk', keyPair.privateKey) as JsonWebKey;
  const x = base64UrlToBytes(jwkPublic.x!);
  const y = base64UrlToBytes(jwkPublic.y!);
  const publicKey = bytesToBase64Url(new Uint8Array([4, ...x, ...y]));
  const privateKey = bytesToBase64Url(base64UrlToBytes(jwkPrivate.d!));
  return { publicKey, privateKey, jwkPublic };
}

async function generateSubscriptionKeys(): Promise<{ p256dh: string; auth: string; clientPrivateD: string; clientPublicBytes: Uint8Array }> {
  // Node's WebCrypto rejects empty usages at generateKey; deriveBits is the
  // usage the client public key is consumed with during ECDH key agreement.
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const jwkPublic = await crypto.subtle.exportKey('jwk', keyPair.publicKey) as JsonWebKey;
  const jwkPrivate = await crypto.subtle.exportKey('jwk', keyPair.privateKey) as JsonWebKey;
  const x = base64UrlToBytes(jwkPublic.x!);
  const y = base64UrlToBytes(jwkPublic.y!);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    p256dh: bytesToBase64Url(new Uint8Array([4, ...x, ...y])),
    auth: bytesToBase64Url(auth),
    clientPrivateD: jwkPrivate.d!,
    clientPublicBytes: new Uint8Array([4, ...x, ...y]),
  };
}

// Independent RFC 8291 reference decryptor built directly on node:crypto.
// It implements HKDF from first principles and uses Node's ECDH/AES, so it
// cannot silently share a derivation bug with the WebCrypto encryptor. It
// uses the empty additional data mandated by RFC 8188 section 2.
function referenceDecrypt(
  clientPrivateD: string,
  clientPublicBytes: Uint8Array,
  authSecretBytes: Uint8Array,
  record: Uint8Array,
): string {
  // aes128gcm record: salt(16) || rs(4) || idlen(1) || serverPublic(idlen) || ciphertext+tag.
  const salt = record.slice(0, 16);
  const idLength = record[20];
  const serverPublic = record.slice(21, 21 + idLength);
  const tag = record.slice(record.length - 16);
  const ciphertext = record.slice(21 + idLength, record.length - 16);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(clientPrivateD, 'base64url'));
  const ecdhSecret = ecdh.computeSecret(serverPublic);

  const hkdfExtract = (hkdfSalt: Buffer, ikm: Buffer) => createHmac('sha256', hkdfSalt).update(ikm).digest();
  const hkdfExpand = (prk: Buffer, info: Buffer, length: number) => {
    let result = Buffer.alloc(0);
    let previous = Buffer.alloc(0);
    let counter = 1;
    while (result.length < length) {
      const block = createHmac('sha256', prk).update(Buffer.concat([previous, info, Buffer.from([counter])])).digest();
      result = Buffer.concat([result, block]);
      previous = block;
      counter += 1;
    }
    return result.subarray(0, length);
  };

  const info = Buffer.from('WebPush: info\0');
  const aes128gcmInfo = Buffer.from('Content-Encoding: aes128gcm\0');
  const nonceInfo = Buffer.from('Content-Encoding: nonce\0');
  const keyInfo = Buffer.concat([info, Buffer.from(clientPublicBytes), Buffer.from(serverPublic)]);

  // RFC 8291 section 3.3, then RFC 8188 sections 2.2/2.3. The AEAD
  // additional data is a zero-length octet sequence (RFC 8188 section 2).
  const prkKey = hkdfExtract(Buffer.from(authSecretBytes), ecdhSecret);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const prk = hkdfExtract(Buffer.from(salt), ikm);
  const cek = hkdfExpand(prk, aes128gcmInfo, 16);
  const nonce = hkdfExpand(prk, nonceInfo, 12);

  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAAD(Buffer.alloc(0));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  // RFC 8188 padding: strip the trailing 0x02 delimiter.
  return decrypted.subarray(0, decrypted.length - 1).toString('utf8');
}

test('creates an ES256 VAPID JWT that verifies with the public key', async () => {
  const keys = await generateVapidKeys();
  const vapid: VapidConfig = { subject: 'mailto:owner@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
  const jwt = await createVapidJwt(vapid, 'https://fcm.googleapis.com', new Date('2026-08-06T00:00:00Z'));
  const [header, claims, signature] = jwt.split('.');
  assert.equal(JSON.parse(atob(header)).alg, 'ES256');
  const decodedClaims = JSON.parse(atob(claims));
  assert.equal(decodedClaims.aud, 'https://fcm.googleapis.com');
  assert.equal(decodedClaims.sub, 'mailto:owner@example.com');
  assert.ok(decodedClaims.exp > 1_754_000_000);
  // JWS ES256 requires the raw 64-byte R || S form. WebCrypto ECDSA already
  // returns that format (it does not DER-encode), and VAPID (RFC 8292) uses
  // it directly.
  assert.equal(base64UrlToBytes(signature).length, 64, 'signature must be raw 64-byte R||S');
  assert.equal(await verifyVapidJwt(jwt, keys.jwkPublic), true);
  assert.equal(await verifyVapidJwt(`${jwt.slice(0, -2)}AA`, keys.jwkPublic), false);
});

test('reproduces the RFC 8291 Appendix A test vector byte-for-byte', async () => {
  // Fixed vectors from RFC 8291 Appendix A (also cross-checked against the
  // canonical http_ece library used by web-push: identical intermediate
  // values and identical record). The same inputs must always produce the
  // same record, proving the key derivation, padding and record layout
  // interoperate with every RFC 8291 implementation.
  const uaPublic = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
  const uaPrivate = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
  const asPublic = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const asPrivate = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
  const authSecret = 'BTBZMqHH6r4Tts7J_aSIgg';
  const salt = 'DGv6ra1nlYgDCS1FRnbzlw';
  const plaintext = 'When I grow up, I want to be a watermelon';
  // The record is 86 header bytes + 42 padded plaintext + 16 tag = 144
  // bytes (the "Content-Length: 145" in the RFC prose is an off-by-one).
  const expectedRecord = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

  const asPublicBytes = base64UrlToBytes(asPublic);
  const jwkPublic = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(asPublicBytes.slice(1, 33)),
    y: bytesToBase64Url(asPublicBytes.slice(33, 65)),
  } as JsonWebKey;
  const serverKeyPair = {
    publicKey: await crypto.subtle.importKey('jwk', jwkPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    privateKey: await crypto.subtle.importKey('jwk', { ...jwkPublic, d: asPrivate }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
  };

  const { ciphertext } = await encryptAes128Gcm(
    base64UrlToBytes(uaPublic),
    base64UrlToBytes(authSecret),
    new TextEncoder().encode(plaintext),
    base64UrlToBytes(salt),
    serverKeyPair,
  );
  assert.equal(bytesToBase64Url(ciphertext), expectedRecord);

  // The independent reference decryptor must recover the same plaintext.
  const decrypted = referenceDecrypt(uaPrivate, base64UrlToBytes(uaPublic), base64UrlToBytes(authSecret), ciphertext);
  assert.equal(decrypted, plaintext);
});

test('aes128gcm payload round-trips and carries the RFC 8291 header', async () => {
  const keys = await generateSubscriptionKeys();
  const clientPublic = base64UrlToBytes(keys.p256dh);
  const auth = base64UrlToBytes(keys.auth);
  const payload = new TextEncoder().encode(JSON.stringify({ title: 'Test role' }));
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

  const { ciphertext, salt: usedSalt, serverPublicKey } = await encryptAes128Gcm(clientPublic, auth, payload, salt);

  // Record layout: salt(16) || rs(4) || idlen(1) || serverPublic(65) || ciphertext.
  assert.deepEqual([...ciphertext.slice(0, 16)], [...salt]);
  assert.equal(new DataView(ciphertext.slice(16, 20).buffer).getUint32(0, false), 4096);
  assert.equal(ciphertext[20], 65);
  assert.deepEqual([...ciphertext.slice(21, 86)], [...serverPublicKey]);
  assert.ok(ciphertext.length === 86 + payload.length + 1 + 16);
  assert.deepEqual([...usedSalt], [...salt]);

  // Independent reference decrypt must recover the exact payload.
  const plaintext = referenceDecrypt(keys.clientPrivateD, keys.clientPublicBytes, auth, ciphertext);
  assert.equal(plaintext, new TextDecoder().decode(payload));
});

test('sendPushMessage posts encrypted payload with VAPID authorization', async () => {
  const keys = await generateVapidKeys();
  const subKeys = await generateSubscriptionKeys();
  const vapid: VapidConfig = { subject: 'mailto:owner@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
  const endpoint = 'https://fcm.googleapis.com/push/test';

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('ok', { status: 201 });
  }) as typeof fetch;

  const result = await sendPushMessage({ endpoint, keys: subKeys }, 'hello', vapid, { fetcher });

  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, endpoint);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.match(headers.Authorization, /^vapid t=[^,]+, k=/);
  assert.equal(headers['Content-Encoding'], 'aes128gcm');
  assert.ok(calls[0].init.body);
});

test('sendPushMessage reports 404/410 as gone so the worker can prune the subscription', async () => {
  const keys = await generateVapidKeys();
  const subKeys = await generateSubscriptionKeys();
  const vapid: VapidConfig = { subject: 'mailto:owner@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
  const fetcher = (async () => new Response('gone', { status: 410 })) as typeof fetch;
  const result = await sendPushMessage({ endpoint: 'https://push.example.com/x', keys: subKeys }, 'hello', vapid, { fetcher });
  assert.equal(result.ok, false);
  assert.equal(result.gone, true);
});

test('sendPushMessage treats a malformed stored subscription as a non-fatal miss', async () => {
  const keys = await generateVapidKeys();
  const vapid: VapidConfig = { subject: 'mailto:owner@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
  // Corrupted p256dh (wrong length) would throw during encryption; it must
  // come back as a non-fatal { ok: false } so one bad subscription cannot
  // reject the whole worker drain batch.
  const result = await sendPushMessage(
    { endpoint: 'https://push.example.com/x', keys: { p256dh: 'AAECAwQ=', auth: 'AAAAAAAAAAAAAAAAAAAAAA' } },
    'hello',
    vapid,
    { fetcher: (async () => new Response('should never be called', { status: 201 })) as typeof fetch },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.equal(result.gone, false);
});

test('sendPushMessage returns ok for a payload-free (shake-hand) message', async () => {
  const keys = await generateVapidKeys();
  const subKeys = await generateSubscriptionKeys();
  const vapid: VapidConfig = { subject: 'mailto:owner@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
  // A 204 response must not carry a body (the fetch spec rejects that).
  const fetcher = (async () => new Response(null, { status: 204 })) as typeof fetch;
  const result = await sendPushMessage({ endpoint: 'https://push.example.com/x', keys: subKeys }, null, vapid, { fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.status, 204);
});
