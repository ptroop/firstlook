import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectProvider,
  isDisposable,
  isRoleAccount,
  looksLikeEmail,
  parseMxAnswers,
  verifyEmail,
} from './email-verify.ts';

function mxResponse(hosts: string[]) {
  // Mirrors the real Google/Cloudflare DoH shape: MX answers put the
  // preference and host together in the `data` field.
  return async () => new Response(JSON.stringify({
    Status: 0,
    Answer: hosts.map((exchange, index) => ({ name: 'example.com', type: 15, TTL: 300, data: `10 ${exchange}.`, index })),
  }), { status: 200 });
}

test('flags malformed and oversized addresses as invalid format', () => {
  assert.equal(looksLikeEmail('jane@bank'), false);
  assert.equal(looksLikeEmail('jane.doe@bank .com'), false);
  assert.equal(looksLikeEmail('@bank.com'), false);
  assert.equal(looksLikeEmail('jane@bank.'), false);
  assert.equal(looksLikeEmail('ja ne@bank.com'), false);
  assert.equal(looksLikeEmail('jane.doe@bank.com'), true);
});

test('detects role accounts and disposable domains', () => {
  assert.equal(isRoleAccount('hr'), true);
  assert.equal(isRoleAccount('careers.team'), true);
  assert.equal(isRoleAccount('jane.doe'), false);
  assert.equal(isDisposable('mailinator.com'), true);
  assert.equal(isDisposable('10minutemail.com'), true);
  assert.equal(isDisposable('bank.com'), false);
});

test('returns role_account and disposable verdicts before any network call', async () => {
  const fetcher = async () => { throw new Error('must not be called'); };
  const role = await verifyEmail('careers@bank.com', { fetcher, now: () => new Date('2026-08-07T10:00:00Z') });
  assert.equal(role.status, 'role_account');
  const disposable = await verifyEmail('jane@mailinator.com', { fetcher, now: () => new Date('2026-08-07T10:00:00Z') });
  assert.equal(disposable.status, 'disposable');
});

test('accepts mail when MX records exist and detects the provider', async () => {
  const verdict = await verifyEmail('jane.doe@bank.com', {
    fetcher: mxResponse(['alt1.aspmx.l.google.com', 'aspmx.l.google.com']),
    now: () => new Date('2026-08-07T10:00:00Z'),
  });
  assert.equal(verdict.status, 'accepts_mail');
  assert.equal(verdict.provider, 'Google Workspace');
  assert.equal(verdict.checkedAt, '2026-08-07T10:00:00.000Z');
  assert.ok(verdict.mxHosts.some((host) => host.includes('google.com')));
});

test('reports domains without MX records as not accepting mail', async () => {
  const verdict = await verifyEmail('jane.doe@norecord.example', {
    fetcher: async () => new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 }),
    now: () => new Date('2026-08-07T10:00:00Z'),
  });
  assert.equal(verdict.status, 'domain_no_mx');
});

test('falls back to the second DoH provider and stays unknown on total failure', async () => {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    if (url.includes('dns.google')) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, exchange: 'mx.zoho.com' }] }), { status: 200 });
  };
  const verdict = await verifyEmail('jane.doe@zoho.example', { fetcher });
  assert.equal(verdict.status, 'accepts_mail');
  assert.ok(calls.length >= 2, 'fell back to Cloudflare');

  const failing = await verifyEmail('jane.doe@down.example', {
    fetcher: async () => { throw new Error('network down'); },
  });
  assert.equal(failing.status, 'unknown');
});

test('does not misread a SERVFAIL response as no-MX when the fallback has the answer', async () => {
  const fetcher = async (url: string) => {
    if (url.includes('dns.google')) return new Response(JSON.stringify({ Status: 2, Answer: [] }), { status: 200 });
    return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, exchange: 'mx.example.com' }] }), { status: 200 });
  };
  const verdict = await verifyEmail('jane.doe@example.com', { fetcher });
  assert.equal(verdict.status, 'accepts_mail');
});

test('treats an authoritative NXDOMAIN as no-MX without consulting the fallback', async () => {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
  };
  const verdict = await verifyEmail('jane.doe@missing.example', { fetcher });
  assert.equal(verdict.status, 'domain_no_mx');
  assert.equal(calls.length, 1, 'authoritative answer should not need the fallback');
});

test('parses MX answers from the real DoH shape (data field) and the exchange field', () => {
  const realShape = parseMxAnswers({ Answer: [
    { type: 16, data: 'ignored' },
    { type: 15, data: '5 gmail-smtp-in.l.google.com.' },
    { type: 15, data: '10 alt1.gmail-smtp-in.l.google.com.' },
  ] });
  assert.deepEqual(realShape, ['gmail-smtp-in.l.google.com', 'alt1.gmail-smtp-in.l.google.com']);
  const exchangeShape = parseMxAnswers({ Answer: [{ type: 15, exchange: 'aspmx.l.google.com.' }] });
  assert.deepEqual(exchangeShape, ['aspmx.l.google.com']);
  assert.equal(detectProvider(['mail.protection.outlook.com']), 'Microsoft 365');
  assert.equal(detectProvider(['mx.zoho.com']), 'Zoho');
  assert.equal(detectProvider(['mx.customhost.net']), '');
});
