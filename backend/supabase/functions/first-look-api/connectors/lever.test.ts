import assert from 'node:assert/strict';
import test from 'node:test';
import { PAYTM_LEVER_CONFIG, createLeverConnector, parseLeverJob } from './lever.ts';

const job = {
  id: 'paytm-risk-1',
  text: 'Credit Risk Analyst',
  hostedUrl: 'https://jobs.lever.co/paytm/paytm-risk-1',
  applyUrl: 'https://jobs.lever.co/paytm/paytm-risk-1/apply',
  categories: { location: 'Mumbai, India', department: 'Risk' },
  descriptionPlain: 'Analyse credit risk and financial data. 1-3 years of experience preferred.',
  createdAt: 1780000000000,
};

test('parses a Lever posting with a role-level direct Apply URL', () => {
  const parsed = parseLeverJob(job, PAYTM_LEVER_CONFIG);
  assert.equal(parsed.employerJobId, 'paytm-risk-1');
  assert.equal(parsed.location, 'Mumbai, India');
  assert.equal(parsed.applyUrl, job.applyUrl);
  assert.match(parsed.experienceText, /1-3 years/i);
});

test('enumerates only India roles from the public Lever feed and hydrates by ID', async () => {
  const connector = createLeverConnector(PAYTM_LEVER_CONFIG, async (url) => {
    if (String(url).includes('/postings/paytm?')) {
      return new Response(JSON.stringify([job, { ...job, id: 'us-1', categories: { location: 'New York, United States' } }]), { status: 200 });
    }
    return new Response(JSON.stringify(job), { status: 200 });
  }, 'paytm-watch');
  const result = await connector.enumerate({ runType: 'watch', now: '2026-08-06T00:00:00Z' });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].sourceExternalId, 'paytm-risk-1');
  const hydrated = await connector.hydrate(result.listings[0], { runType: 'watch', now: '2026-08-06T00:00:00Z' });
  assert.equal(hydrated.applyUrl, job.applyUrl);
});
