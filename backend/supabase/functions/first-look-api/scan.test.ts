import test from 'node:test';
import assert from 'node:assert/strict';

import { runScan } from './scan.ts';

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
