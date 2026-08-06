// Web Push (RFC 8030 + RFC 8291) implemented on Web Crypto so the edge
// function can send VAPID-authenticated, aes128gcm-encrypted push messages
// without an external dependency.
//
// VAPID: ES256 JWT over {aud: push endpoint origin, exp, sub}.
// Payload: aes128gcm per RFC 8291 using ECDH P-256 + HKDF + AES-128-GCM.

export interface PushSubscriptionRecord {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string } | null;
}

export interface VapidConfig {
  subject: string; // mailto: or https: contact
  publicKey: string; // base64url uncompressed P-256 public key (65 bytes)
  privateKey: string; // base64url P-256 private key (32 bytes)
}

export interface PushSendResult {
  ok: boolean;
  status: number;
  gone?: boolean; // 404/410 → remove the subscription
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importP256PublicKey(bytes: Uint8Array): Promise<CryptoKey> {
  // Uncompressed point: 0x04 || X (32) || Y (32). Validate before slicing so
  // a corrupted subscription key fails here (and is caught by sendPushMessage)
  // instead of producing a confusing import error deep in the derivation.
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error('Subscription public key must be a 65-byte uncompressed P-256 point');
  }
  const x = bytes.slice(1, 33);
  const y = bytes.slice(33, 65);
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: bytesToBase64Url(x), y: bytesToBase64Url(y), ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
}

async function importVapidPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

async function importVapidPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function createVapidJwt(vapid: VapidConfig, audience: string, now: Date = new Date()): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = { aud: audience, exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60, sub: vapid.subject };
  const encodedHeader = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedClaims = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const privateBytes = base64UrlToBytes(vapid.privateKey);
  const publicBytes = base64UrlToBytes(vapid.publicKey);
  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const d = bytesToBase64Url(privateBytes.slice(0, 32));
  const key = await importVapidPrivateKey({ kty: 'EC', crv: 'P-256', x, y, d, ext: true });
  // WebCrypto ECDSA returns the raw 64-byte R || S form, which is exactly
  // what JWS ES256 (RFC 7518 section 3.4) and VAPID (RFC 8292) require.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

export async function verifyVapidJwt(jwt: string, publicKey: JsonWebKey): Promise<boolean> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  const key = await importVapidPublicKey(publicKey);
  // Same format as above: WebCrypto verifies raw 64-byte R || S directly.
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// RFC 5869 split into its two phases so RFC 8291's derivation can apply the
// exact salt/info layout it specifies. HKDF-Extract(salt, IKM) is HMAC(salt,
// IKM); HKDF-Expand(PRK, info) is T(n) = HMAC(PRK, T(n-1) || info || n).
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const chunks: Uint8Array[] = [];
  let previous = new Uint8Array(0);
  let counter = 1;
  let produced = 0;
  while (produced < length) {
    const block = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(previous, info, new Uint8Array([counter]))));
    chunks.push(block);
    previous = block;
    produced += block.length;
    counter += 1;
  }
  return concat(...chunks).slice(0, length);
}

export interface EncryptedPayload {
  ciphertext: Uint8Array; // full aes128gcm record body
  salt: Uint8Array;
  serverPublicKey: Uint8Array;
}

export async function encryptAes128Gcm(
  clientPublicKeyBytes: Uint8Array,
  authSecretBytes: Uint8Array,
  payload: Uint8Array,
  saltBytes: Uint8Array | null = null,
  serverKeyPair: CryptoKeyPair | null = null,
): Promise<EncryptedPayload> {
  const clientKey = await importP256PublicKey(clientPublicKeyBytes);
  // serverKeyPair is optional and only used by tests that must reproduce a
  // fixed ciphertext (e.g. the RFC 8291 Appendix A vector).
  const serverKeys = serverKeyPair ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const serverJwk = await crypto.subtle.exportKey('jwk', serverKeys.publicKey);
  const serverPublic = concat(
    new Uint8Array([4]),
    base64UrlToBytes(serverJwk.x!),
    base64UrlToBytes(serverJwk.y!),
  );
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeys.privateKey, 256);
  const sharedSecret = new Uint8Array(sharedBits);
  const salt = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 section 3.3: key_info for the IKM derivation is
  // "WebPush: info" || 0x00 || ua_public || as_public. Earlier drafts used
  // "Content-Encoding: auth" here; the final RFC replaced it, so using that
  // label breaks interop with browsers.
  const info = new TextEncoder().encode('WebPush: info\u0000');
  const aes128gcmInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\u0000');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\u0000');
  const keyInfo = concat(info, clientPublicKeyBytes, serverPublic);
  // RFC 8188 section 2: the additional data for each AEAD invocation is a
  // zero-length octet sequence (http_ece, used by the web-push library and
  // validated against FCM/Chrome, never sets an AAD either).
  const aad = new Uint8Array(0);

  // RFC 8291 section 3.3:
  //   PRK_key = HKDF-Extract(salt = auth_secret, IKM = ecdh_secret)
  //   IKM     = HKDF-Expand(PRK_key, key_info, 32)
  //   PRK     = HKDF-Extract(salt = record_salt, IKM = IKM)
  //   CEK     = HKDF-Expand(PRK, 'Content-Encoding: aes128gcm\0', 16)
  //   NONCE   = HKDF-Expand(PRK, 'Content-Encoding: nonce\0', 12)
  const prkKey = await hkdfExtract(authSecretBytes, sharedSecret);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, aes128gcmInfo, 16);
  const nonce = await hkdfExpand(prk, nonceInfo, 12);

  // RFC 8188 section 2: the plaintext of the (only) record is followed by a
  // single 0x02 padding-delimiter octet; the last record may be smaller than
  // rs, so no zero padding is required. http_ece (canonical web-push
  // implementation) does exactly this with its default pad=0.
  const paddedPayload = concat(payload, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, aesKey, paddedPayload);

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idLength = new Uint8Array([65]);
  const record = concat(salt, rs, idLength, serverPublic, new Uint8Array(cipher));
  return { ciphertext: record, salt, serverPublicKey: serverPublic };
}

export async function sendPushMessage(
  subscription: PushSubscriptionRecord,
  payload: string | null,
  vapid: VapidConfig,
  deps: { fetcher?: typeof fetch; now?: () => Date } = {},
): Promise<PushSendResult> {
  const fetcher = deps.fetcher ?? fetch;
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { ok: false, status: 0, gone: false };
  }
  const audience = endpointOrigin(subscription.endpoint);
  if (!audience) return { ok: false, status: 0, gone: false };

  // Everything below can fail per-target (bad stored key, malformed VAPID
  // config, network error). Treat every failure the same way: a non-fatal
  // "not delivered" so one bad subscription cannot reject the whole drain
  // batch via sendWithConcurrency's Promise.all.
  try {
    const body: Uint8Array | null = payload === null ? null : (await encryptAes128Gcm(
      base64UrlToBytes(subscription.keys.p256dh),
      base64UrlToBytes(subscription.keys.auth),
      new TextEncoder().encode(payload),
    )).ciphertext;

    const jwt = await createVapidJwt(vapid, audience, deps.now?.());
    const headers: Record<string, string> = {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      TTL: '86400',
      'Content-Type': 'application/octet-stream',
    };
    if (body) {
      headers['Content-Encoding'] = 'aes128gcm';
    }

    const response = await fetcher(subscription.endpoint, {
      method: 'POST',
      headers,
      body: body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer : undefined,
    });
    const gone = response.status === 404 || response.status === 410;
    return { ok: response.ok, status: response.status, gone };
  } catch (_error) {
    return { ok: false, status: 0, gone: false };
  }
}

function endpointOrigin(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    return url.origin;
  } catch {
    return null;
  }
}

export { base64UrlToBytes, bytesToBase64Url };
