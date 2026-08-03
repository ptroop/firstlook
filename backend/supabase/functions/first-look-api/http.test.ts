import test from 'node:test';
import assert from 'node:assert/strict';

import { parseScanRequest, readJsonBody, safePublicError } from './http.ts';

test('treats an empty successful response as null', async () => {
  assert.equal(await readJsonBody(new Response(null, { status: 200 })), null);
});

test('parses a non-empty JSON response', async () => {
  assert.deepEqual(await readJsonBody(new Response('{"id":7}', { status: 200 })), { id: 7 });
});

test('accepts only bounded known scan request shapes', () => {
  assert.deepEqual(parseScanRequest(new URL('https://example.test/scan?group=citi-watch&run_type=watch')), {
    group: 'citi-watch', runType: 'watch',
  });
  assert.throws(() => parseScanRequest(new URL('https://example.test/scan?group=../../all&run_type=watch')), /invalid group/i);
  assert.throws(() => parseScanRequest(new URL('https://example.test/scan?group=citi-watch&run_type=everything')), /invalid run type/i);
});

test('public errors never expose stack traces or secret-looking details', () => {
  const publicError = safePublicError(new Error('Bearer secret-value-at-upstream\n at internal.ts:42'));
  assert.deepEqual(publicError, { error: 'Internal error' });
});
