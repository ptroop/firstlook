import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanDomain,
  cleanName,
  decodeJwtSubject,
  lookupContactEmail,
  normalizeVerification,
} from './contact-lookup.ts';

function hunterResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      email: 'jane.doe@example-bank.com',
      first_name: 'Jane',
      last_name: 'Doe',
      score: 98,
      verification: { status: 'valid', date: '2026-08-07' },
      sources: [{ uri: 'https://linkedin.com/in/janedoe' }],
      ...overrides,
    },
  };
}

test('returns a normalized result on a Hunter Email Finder hit', async () => {
  const fetcher = async () => new Response(JSON.stringify(hunterResponse()), { status: 200 });
  const result = await lookupContactEmail(
    { firstName: 'Jane', lastName: 'Doe', domain: 'example-bank.com' },
    { apiKey: 'test-key', fetcher, now: () => new Date('2026-08-07T10:00:00Z') },
  );
  assert.equal(result?.email, 'jane.doe@example-bank.com');
  assert.equal(result?.confidence, 98);
  assert.equal(result?.verification, 'valid');
  assert.equal(result?.source, 'https://linkedin.com/in/janedoe');
  assert.equal(result?.observedAt, '2026-08-07T10:00:00.000Z');
});

test('maps Hunter verification statuses conservatively', () => {
  assert.equal(normalizeVerification('valid'), 'valid');
  assert.equal(normalizeVerification('accept_all'), 'accept_all');
  assert.equal(normalizeVerification('webmail'), 'webmail');
  assert.equal(normalizeVerification('disposable'), 'disposable');
  assert.equal(normalizeVerification('invalid'), 'invalid');
  assert.equal(normalizeVerification(''), 'unknown');
  assert.equal(normalizeVerification('SOMETHING_NEW'), 'unknown');
});

test('returns null instead of guessing when Hunter has no email', async () => {
  const fetcher = async () => new Response(JSON.stringify({ data: { email: '', score: 0 } }), { status: 200 });
  const result = await lookupContactEmail(
    { firstName: 'Jane', lastName: 'Doe', domain: 'example-bank.com' },
    { apiKey: 'test-key', fetcher },
  );
  assert.equal(result, null);
});

test('propagates upstream failures so the handler can reply 502', async () => {
  const fetcher = async () => new Response('{}', { status: 500 });
  await assert.rejects(
    lookupContactEmail(
      { firstName: 'Jane', lastName: 'Doe', domain: 'example-bank.com' },
      { apiKey: 'test-key', fetcher },
    ),
  );
});

test('strips noise from names and rejects invalid domains', () => {
  assert.equal(cleanName('  Jane "Jay" O\'Connor-Doe  '), "Jane Jay O'Connor-Doe");
  assert.equal(cleanName('<script>alert(1)</script>'), 'scriptalertscript');
  assert.equal(cleanDomain('Example-Bank.com'), 'example-bank.com');
  assert.equal(cleanDomain('https://example-bank.com'), '');
  assert.equal(cleanDomain('not a domain'), '');
  assert.equal(cleanDomain('a..b'), '');
});

test('decodes the subject from a validated Supabase JWT', () => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'user-123', aud: 'authenticated' }));
  const token = `${header}.${payload}.signature`;
  assert.equal(decodeJwtSubject(`Bearer ${token}`), 'user-123');
  assert.equal(decodeJwtSubject(''), '');
  assert.equal(decodeJwtSubject('Bearer garbage.not-json.sig'), '');
  assert.equal(decodeJwtSubject('Bearer only-two-parts'), '');
});

test('never trusts a payload without a sub claim', () => {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ aud: 'authenticated' }));
  assert.equal(decodeJwtSubject(`${header}.${payload}.sig`), '');
});
