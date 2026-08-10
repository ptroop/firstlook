import assert from 'node:assert/strict';
import test from 'node:test';

import { createAmazonConnector } from './amazon.ts';

function mockAmazonFetch(url: string): Promise<Response> {
  const offset = Number(new URL(url).searchParams.get('offset') || 0);
  const jobs = Array.from({ length: 100 }, (_, index) => ({
    id: `amazon-${offset + index}`,
    job_path: `/en-gb/jobs/amazon-${offset + index}`,
    title: `Finance Analyst ${offset + index}`,
    normalized_location: 'Bengaluru, KA, IND',
    job_category: 'Finance',
    job_family: 'Finance',
  }));
  return Promise.resolve(new Response(JSON.stringify({ hits: 600, jobs }), { status: 200 }));
}

test('reconciles every advertised Amazon page within the bounded page budget', async () => {
  const connector = createAmazonConnector(mockAmazonFetch, 'reconcile');
  const result = await connector.enumerate({ runType: 'reconcile', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 600);
  assert.equal(result.diagnostic.pagesExpected, 6);
  assert.equal(result.listings.length, 600);
});

test('marks the bounded Amazon watch as partial instead of claiming full coverage', async () => {
  const connector = createAmazonConnector(mockAmazonFetch, 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'partial');
  assert.equal(result.listings.length, 500);
  assert.match(result.diagnostic.errorSummaries[0], /advertised Amazon pages/i);
});
