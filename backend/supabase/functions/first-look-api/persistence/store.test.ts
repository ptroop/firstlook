import assert from 'node:assert/strict';
import test from 'node:test';

import { createSourceAwareStore, type RestClient } from './store.ts';

function fakeClient() {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const client: RestClient = {
    async request(path, options = {}) {
      const method = options.method ?? 'GET';
      const body = options.body ? JSON.parse(String(options.body)) : null;
      calls.push({ path, method, body });
      if (path === '/rest/v1/source_scan_runs' && method === 'POST') return [{ id: 41 }];
      if (path.startsWith('/rest/v1/job_sources') && method === 'POST') return [{ id: 91 }];
      if (path.startsWith('/rest/v1/source_inventory?') && method === 'GET') return [];
      return [];
    },
  };
  return { client, calls };
}

const inventory = {
  connectorId: 'citi-official-india',
  sourceExternalId: '123',
  company: 'Citi',
  title: 'Analyst',
  location: 'Mumbai, India',
  category: null,
  department: null,
  detailUrl: 'https://jobs.citi.com/job/x/287/123',
  listingMetadataHash: 'meta-123',
  rawMetadata: {},
};

test('upserts every lightweight inventory row without creating job sources', async () => {
  const { client, calls } = fakeClient();
  const store = createSourceAwareStore(client);
  await store.upsertInventory(41, [
    { listing: inventory, decision: { status: 'hydrate', reasons: ['generic_title'] } },
    { listing: { ...inventory, sourceExternalId: '124', title: 'Software Engineer' }, decision: { status: 'defer', reasons: ['strong_non_finance_category'] } },
  ], '2026-08-03T00:00:00.000Z');

  const upsert = calls.find((call) => call.path.startsWith('/rest/v1/source_inventory'));
  assert.equal(upsert?.method, 'POST');
  assert.equal((upsert?.body as unknown[]).length, 2);
  assert.equal(calls.some((call) => call.path.startsWith('/rest/v1/job_sources')), false);
});

test('persists a hydrated source observation with bounded raw metadata', async () => {
  const { client, calls } = fakeClient();
  const store = createSourceAwareStore(client);
  const id = await store.persistObservation(41, {
    connectorId: 'citi-official-india',
    sourceType: 'official_career',
    sourceName: 'Citi Careers',
    sourceExternalId: '123',
    company: 'Citi',
    employerJobId: '123',
    listingUrl: inventory.detailUrl,
    detailUrl: inventory.detailUrl,
    applyUrl: 'https://jobs.citi.com/apply/123',
    isOfficial: true,
    title: 'Analyst',
    location: 'Mumbai, India',
    description: 'Finance role',
    jobCategory: 'Finance',
    postedAt: null,
    listingMetadataHash: 'meta-123',
    contentHash: 'content-123',
    rawMetadata: { text: 'x'.repeat(40_000) },
  }, '2026-08-03T00:00:00.000Z');

  assert.equal(id, 91);
  const body = calls.at(-1)?.body as Record<string, unknown>;
  assert.ok(calls.at(-1)?.path.startsWith('/rest/v1/job_sources?on_conflict='));
  assert.ok(JSON.stringify(body.raw_metadata).length <= 32_768);
  assert.equal(body.hydration_status, 'complete');
});

test('uses the complete-reconciliation RPC only when explicitly finalized', async () => {
  const { client, calls } = fakeClient();
  const store = createSourceAwareStore(client);
  await store.finalizeCompleteReconciliation('citi-official-india', 41);

  assert.deepEqual(calls.at(-1), {
    path: '/rest/v1/rpc/finalize_complete_reconciliation',
    method: 'POST',
    body: { p_connector_id: 'citi-official-india', p_run_id: 41 },
  });
});
