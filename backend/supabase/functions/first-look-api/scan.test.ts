import test from 'node:test';
import assert from 'node:assert/strict';

import { runScan, runSourceAwareScan } from './scan.ts';

const matchingJob = {
  id: 'moodys_13927',
  employerJobId: '13927',
  company: "Moody's",
  sourceUrl: 'https://careers.moodys.com/en/job/example',
  applyUrl: 'https://career8.successfactors.com/apply',
  title: 'Senior Financial Data Analyst',
  location: 'Bengaluru, India',
  description: 'Credit analysis',
  experienceText: '0-2 years',
  jobCategory: 'Credit Analysis & Research',
  postedAt: '2026-07-29T00:00:00.000Z'
};

function diagnostic(status: 'success' | 'partial' | 'failed' | 'unsupported', company = "Moody's") {
  return {
    company,
    status,
    discoveredCount: status === 'unsupported' ? 0 : 1,
    fetchedCount: status === 'success' ? 1 : 0,
    matchingCount: status === 'success' ? 1 : 0,
    excluded: {},
    errorMessage: status === 'success' ? null : `${status} source`,
    startedAt: '2026-08-03T00:00:00.000Z',
    finishedAt: '2026-08-03T00:00:01.000Z'
  };
}

function store() {
  const calls = { upserts: [] as string[], deactivations: [] as Array<{ company: string; ids: string[] }>, diagnostics: [] as string[], finish: [] as unknown[] };
  return {
    calls,
    startRun: async () => 7,
    upsertJob: async (job: typeof matchingJob) => { calls.upserts.push(job.id); },
    deactivateMissingForSource: async (company: string, ids: string[]) => { calls.deactivations.push({ company, ids }); },
    recordSourceResult: async (_runId: number | null, result: { company: string }) => { calls.diagnostics.push(result.company); },
    finishRun: async (_runId: number | null, summary: unknown) => { calls.finish.push(summary); }
  };
}

test('upserts and source-scopes deactivation after a successful connector', async () => {
  const fakeStore = store();
  const summary = await runScan([{
    company: "Moody's",
    run: async () => ({ jobs: [matchingJob], diagnostic: diagnostic('success') })
  }], fakeStore);

  assert.deepEqual(fakeStore.calls.upserts, ['moodys_13927']);
  assert.deepEqual(fakeStore.calls.deactivations, [{ company: "Moody's", ids: ['moodys_13927'] }]);
  assert.deepEqual(fakeStore.calls.diagnostics, ["Moody's"]);
  assert.equal(summary.jobsFound, 1);
});

test('never deactivates jobs after partial or failed connectors', async () => {
  for (const status of ['partial', 'failed'] as const) {
    const fakeStore = store();
    await runScan([{ company: "Moody's", run: async () => ({ jobs: [], diagnostic: diagnostic(status) }) }], fakeStore);
    assert.deepEqual(fakeStore.calls.deactivations, [], status);
  }
});

test('reports unsupported sources without treating them as fetch failures', async () => {
  const fakeStore = store();
  const summary = await runScan([{
    company: 'Goldman Sachs',
    run: async () => ({ jobs: [], diagnostic: diagnostic('unsupported', 'Goldman Sachs') })
  }], fakeStore);

  assert.equal(summary.errorCount, 0);
  assert.equal(summary.unsupportedCount, 1);
  assert.equal(summary.diagnostics[0]?.status, 'unsupported');
  assert.deepEqual(fakeStore.calls.deactivations, []);
});

const inventoryListing = {
  connectorId: 'citi-official-india',
  sourceExternalId: '123',
  company: 'Citi',
  title: 'Analyst',
  location: 'Mumbai, India',
  category: 'Finance',
  department: 'Risk Management',
  detailUrl: 'https://jobs.citi.com/job/mumbai/analyst/287/123',
  listingMetadataHash: 'meta-123',
  rawMetadata: {},
};

const observation = {
  connectorId: 'citi-official-india',
  sourceType: 'official_career' as const,
  sourceName: 'Citi Careers',
  sourceExternalId: '123',
  company: 'Citi',
  employerJobId: '123',
  listingUrl: inventoryListing.detailUrl,
  detailUrl: inventoryListing.detailUrl,
  applyUrl: 'https://jobs.citi.com/apply/123',
  isOfficial: true,
  title: 'Analyst',
  location: 'Mumbai, India',
  description: 'Credit risk and financial model analysis.',
  experienceText: '0-2 years',
  jobCategory: 'Risk Management',
  postedAt: '2026-08-01T00:00:00.000Z',
  listingMetadataHash: 'meta-123',
  contentHash: 'content-123',
  rawMetadata: {},
};

function sourceConnector(options: { status?: 'complete' | 'partial'; listings?: typeof inventoryListing[] } = {}) {
  const listings = options.listings ?? [inventoryListing];
  return {
    connectorId: 'citi-official-india',
    connectorVersion: 'citi-v1',
    company: 'Citi',
    scanGroup: 'citi-reconcile',
    enumerate: async () => ({
      listings,
      diagnostic: {
        status: options.status ?? 'complete',
        reportedTotal: listings.length,
        pagesExpected: 1,
        pagesFetched: options.status === 'partial' ? 0 : 1,
        errorSummaries: options.status === 'partial' ? ['page failed'] : [],
      },
    }),
    hydrate: async (listing: typeof inventoryListing) => ({
      ...observation,
      sourceExternalId: listing.sourceExternalId,
      employerJobId: listing.sourceExternalId,
      title: listing.title,
      detailUrl: listing.detailUrl,
      listingUrl: listing.detailUrl,
    }),
  };
}

function sourceStore(due = [inventoryListing]) {
  const calls: string[] = [];
  const diagnostics: any[] = [];
  return {
    calls,
    diagnostics,
    startRun: async () => { calls.push('start'); return 41; },
    upsertInventory: async (_runId: number, rows: any[]) => {
      calls.push(`inventory:${rows.map((row) => row.listing.sourceExternalId).join(',')}`);
    },
    dueCandidates: async () => due,
    persistObservation: async () => { calls.push('observation'); return 91; },
    findCanonicalCandidates: async () => [],
    upsertCanonicalJob: async () => { calls.push('canonical'); },
    linkObservation: async () => { calls.push('link'); },
    saveClassification: async () => { calls.push('classification'); },
    finishRun: async (_runId: number, diagnostic: any) => { diagnostics.push(diagnostic); calls.push('finish'); },
    finalizeCompleteReconciliation: async () => { calls.push('finalize'); },
  };
}

test('persists inventory then observation before classification and finalizes a complete reconciliation', async () => {
  const fakeStore = sourceStore();
  const summary = await runSourceAwareScan([sourceConnector()], fakeStore, {
    runType: 'reconcile',
    detailBatchSize: 10,
    now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.deepEqual(fakeStore.calls, [
    'start', 'inventory:123', 'observation', 'canonical', 'link', 'classification', 'finish', 'finalize',
  ]);
  assert.equal(summary.jobsFound, 1);
  assert.equal(fakeStore.diagnostics[0].status, 'complete');
  assert.equal(fakeStore.diagnostics[0].hydrationStatus, 'complete');
});

test('reports an explicit detail backlog and honors the hydration batch budget', async () => {
  const listings = ['1', '2', '3'].map((id) => ({ ...inventoryListing, sourceExternalId: id }));
  const fakeStore = sourceStore(listings);
  const connector = sourceConnector({ listings });
  let hydrationCalls = 0;
  connector.hydrate = async (listing) => {
    hydrationCalls += 1;
    return { ...observation, sourceExternalId: listing.sourceExternalId, employerJobId: listing.sourceExternalId };
  };

  await runSourceAwareScan([connector], fakeStore, {
    runType: 'reconcile',
    detailBatchSize: 1,
    now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(hydrationCalls, 1);
  assert.equal(fakeStore.diagnostics[0].detailsDue, 3);
  assert.equal(fakeStore.diagnostics[0].detailsFetched, 1);
  assert.equal(fakeStore.diagnostics[0].detailsBacklogged, 2);
  assert.equal(fakeStore.diagnostics[0].hydrationStatus, 'backlog');
});

test('partial enumeration and connector failure never finalize lifecycle closure', async () => {
  for (const connector of [
    sourceConnector({ status: 'partial', listings: [] }),
    { ...sourceConnector(), enumerate: async () => { throw new Error('network unavailable'); } },
  ]) {
    const fakeStore = sourceStore([]);
    await runSourceAwareScan([connector], fakeStore, {
      runType: 'reconcile',
      detailBatchSize: 10,
      now: new Date('2026-08-03T00:00:00.000Z'),
    });
    assert.equal(fakeStore.calls.includes('finalize'), false);
    assert.ok(['partial', 'failed'].includes(fakeStore.diagnostics[0].status));
  }
});
