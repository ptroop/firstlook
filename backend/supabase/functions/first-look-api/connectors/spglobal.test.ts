import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpGlobalConnector } from './spglobal.ts';

test('enumerates S&P Global India API rows and hydrates the direct Workday Apply URL', async () => {
  const api = JSON.stringify({ totalCount: 1, jobs: [{ data: {
    slug: '123', req_id: 'REQ-123', title: 'Finance Analyst', description: 'Analyze financial reporting.',
    city: 'Mumbai', state: 'Maharashtra', country: 'India', categories: [{ name: 'Finance' }], posted_date: '2026-08-05T00:00:00+0000',
  } }] });
  const detail = `window.jobDescriptionConfig = ${JSON.stringify({ job: {
    slug: '123', req_id: 'REQ-123', title: 'Finance Analyst', full_location: 'Mumbai, Maharashtra, India',
    description: '<p>Analyze financial reporting.</p>', categories: [{ name: 'Finance' }], posted_date: '2026-08-05T00:00:00+0000',
    apply_url: 'https://spgi.wd5.myworkdayjobs.com/en-us/SPGI_Careers/job/Mumbai-Maharashtra/Finance-Analyst_REQ-123/apply',
  } })}; var Templates;`;
  const connector = createSpGlobalConnector(async (input) => new Response(String(input).includes('/jobs/123') ? detail : api), 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.listings[0].detailUrl, 'https://careers.spglobal.com/jobs/123');
  const observation = await connector.hydrate(result.listings[0], { runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(observation.applyUrl, 'https://spgi.wd5.myworkdayjobs.com/en-us/SPGI_Careers/job/Mumbai-Maharashtra/Finance-Analyst_REQ-123/apply');
  assert.equal(observation.jobCategory, 'Finance');
});
