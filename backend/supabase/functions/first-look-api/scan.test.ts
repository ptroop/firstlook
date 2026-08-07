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

function ambiguousSourceConnector() {
  const connector = sourceConnector();
  connector.hydrate = async (listing) => ({
    ...observation,
    sourceExternalId: listing.sourceExternalId,
    employerJobId: listing.sourceExternalId,
    // Genuinely ambiguous wording (no experience band at all) stays "possible":
    // the parser cannot confirm a 0-2 cap, so it must not notify.
    experienceText: '',
    description: 'Credit risk and financial model analysis.',
    detailUrl: listing.detailUrl,
    listingUrl: listing.detailUrl,
  });
  return connector;
}

function sourceStore(due = [inventoryListing]) {
  const calls: string[] = [];
  const diagnostics: any[] = [];
  const canonicalClassifications: any[] = [];
  const classificationRecords: any[] = [];
  return {
    calls,
    diagnostics,
    canonicalClassifications,
    classificationRecords,
    startRun: async () => { calls.push('start'); return 41; },
    upsertInventory: async (_runId: number, rows: any[]) => {
      calls.push(`inventory:${rows.map((row) => row.listing.sourceExternalId).join(',')}`);
    },
    dueCandidates: async () => due,
    persistObservation: async () => { calls.push('observation'); return 91; },
    markInventoryHydrated: async () => { calls.push('hydrated'); },
    findCanonicalCandidates: async () => [],
    getCachedClassification: async () => null,
    upsertCanonicalJob: async (_jobId: string, _job: any, classification: any) => {
      canonicalClassifications.push(classification);
      calls.push('canonical');
    },
    enqueueNotification: async (_jobId: string, _title: string, _company: string) => { calls.push('notify'); },
    linkObservation: async () => { calls.push('link'); },
    saveClassification: async (_jobId: string, record: any) => {
      classificationRecords.push(record);
      calls.push('classification');
    },
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
    'start', 'inventory:123', 'observation', 'hydrated', 'canonical', 'notify', 'link', 'classification', 'finish', 'finalize',
  ]);
  assert.equal(summary.jobsFound, 1);
  assert.equal(fakeStore.diagnostics[0].status, 'complete');
  assert.equal(fakeStore.diagnostics[0].hydrationStatus, 'complete');
});

test('enqueues a push notification only for new exact-match canonical jobs', async () => {
  const exact = sourceStore();
  await runSourceAwareScan([sourceConnector()], exact, {
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });
  assert.ok(exact.calls.includes('notify'), 'new exact match should be enqueued');

  const ambiguous = sourceStore();
  await runSourceAwareScan([ambiguousSourceConnector()], ambiguous, {
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });
  assert.equal(ambiguous.calls.includes('notify'), false, 'possible-tier job should not be enqueued');
});

test('uses OpenRouter only for an ambiguous job and persists the actual response model', async () => {
  const fakeStore = sourceStore();
  let requests = 0;
  await runSourceAwareScan([ambiguousSourceConnector()], fakeStore, {
    runType: 'reconcile',
    detailBatchSize: 10,
    now: new Date('2026-08-03T00:00:00.000Z'),
    openRouter: {
      apiKey: 'test-only-key',
      model: 'google/gemini-2.5-flash-lite',
      fallbackModels: [],
      promptVersion: 'job-classification-v1',
    },
    classifierFetch: async () => {
      requests += 1;
      return new Response(JSON.stringify({
        model: 'google/gemini-2.5-flash-lite-001',
        choices: [{ message: { content: JSON.stringify({
          locationStatus: 'india', financeStatus: 'exact', experienceStatus: 'zero_to_two',
          minimumYears: 0, maximumYears: 2, confidence: 0.93,
          evidence: {
            location: ['Mumbai, India'], finance: ['Credit risk'], experience: ['financial model analysis'],
          },
        }) } }],
      }), { status: 200 });
    },
  });

  assert.equal(requests, 1);
  assert.equal(fakeStore.canonicalClassifications[0].matchTier, 'exact');
  assert.equal(fakeStore.canonicalClassifications[0].classificationMethod, 'mixed');
  assert.equal(fakeStore.classificationRecords[0].requested_model_id, 'google/gemini-2.5-flash-lite');
  assert.equal(fakeStore.classificationRecords[0].actual_model_id, 'google/gemini-2.5-flash-lite-001');
});

test('keeps ambiguous jobs possible and pending when OpenRouter is not configured', async () => {
  const fakeStore = sourceStore();
  await runSourceAwareScan([ambiguousSourceConnector()], fakeStore, {
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });
  assert.equal(fakeStore.canonicalClassifications[0].matchTier, 'possible');
  assert.equal(fakeStore.canonicalClassifications[0].classificationMethod, 'pending');
  assert.match(fakeStore.classificationRecords[0].validation_errors.join(' '), /not configured/i);
});

test('does not call OpenRouter when deterministic classification is already exact', async () => {
  const fakeStore = sourceStore();
  const exactConnector = sourceConnector();
  exactConnector.hydrate = async (listing) => ({
    ...observation,
    sourceExternalId: listing.sourceExternalId,
    employerJobId: listing.sourceExternalId,
    title: 'Credit Risk Analyst',
    description: 'Credit risk and financial model analysis with 0-2 years of experience.',
    detailUrl: listing.detailUrl,
    listingUrl: listing.detailUrl,
  });
  let requests = 0;
  await runSourceAwareScan([exactConnector], fakeStore, {
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
    openRouter: {
      apiKey: 'test-only-key', model: 'google/gemini-2.5-flash-lite', fallbackModels: [], promptVersion: 'job-classification-v1',
    },
    classifierFetch: async () => { requests += 1; throw new Error('must not be called'); },
  });
  assert.equal(requests, 0);
  assert.equal(fakeStore.canonicalClassifications[0].classificationMethod, 'deterministic');
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
