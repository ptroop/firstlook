import test from 'node:test';
import assert from 'node:assert/strict';

import { readJsonBody } from './http.ts';

test('treats an empty successful response as null', async () => {
  assert.equal(await readJsonBody(new Response(null, { status: 200 })), null);
});

test('parses a non-empty JSON response', async () => {
  assert.deepEqual(await readJsonBody(new Response('{"id":7}', { status: 200 })), { id: 7 });
});
