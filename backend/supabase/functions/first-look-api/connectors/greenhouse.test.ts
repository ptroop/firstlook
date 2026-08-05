import assert from 'node:assert/strict';
import test from 'node:test';
import { GROWW_CONFIG, PHONEPE_CONFIG, RAZORPAY_CONFIG, createGreenhouseConnector, parseGreenhouseJob } from './greenhouse.ts';

const job = {
  id: 4718601005,
  requisition_id: '14542',
  title: 'Analyst, Risk Management',
  absolute_url: 'https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/4718601005',
  location: { name: 'Bengaluru' },
  metadata: [{ name: 'Department', value: 'Risk' }],
  first_published: '2026-07-29T04:52:12-04:00',
  content: '<p>Support risk management and financial analysis. 0-2 years of experience preferred.</p>',
};

test('parses Razorpay Greenhouse detail data and preserves the role-level Apply page', () => {
  const parsed = parseGreenhouseJob(job, RAZORPAY_CONFIG);
  assert.equal(parsed.employerJobId, '14542');
  assert.equal(parsed.location, 'Bengaluru');
  assert.equal(parsed.applyUrl, job.absolute_url);
  assert.match(parsed.experienceText, /0-2 years/i);
});

test('enumerates only India jobs from the public Greenhouse board', async () => {
  const connector = createGreenhouseConnector(RAZORPAY_CONFIG, async (url) => {
    if (String(url).includes('content=false')) return new Response(JSON.stringify({ jobs: [job, { ...job, id: 99, title: 'US Analyst', location: { name: 'New York, United States' } }] }), { status: 200 });
    return new Response(JSON.stringify(job), { status: 200 });
  });
  const result = await connector.enumerate({ runType: 'reconcile', now: '2026-08-03T00:00:00Z' });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].sourceExternalId, '4718601005');
});

test('hydrates from the stable job ID after compact inventory persistence', async () => {
  const connector = createGreenhouseConnector(RAZORPAY_CONFIG, async (url) => {
    assert.match(String(url), /\/jobs\/4718601005\?content=true$/);
    return new Response(JSON.stringify(job), { status: 200 });
  });
  const result = await connector.hydrate({
    connectorId: RAZORPAY_CONFIG.connectorId,
    sourceExternalId: '4718601005',
    company: RAZORPAY_CONFIG.company,
    title: job.title,
    location: 'Bengaluru',
    category: null,
    department: null,
    detailUrl: job.absolute_url,
    listingMetadataHash: 'hash',
    rawMetadata: {},
  }, { runType: 'reconcile', now: '2026-08-03T00:00:00Z' });
  assert.equal(result.employerJobId, '14542');
  assert.equal(result.applyUrl, job.absolute_url);
});

test('defines the verified PDF gap additions on their official Greenhouse boards', () => {
  assert.deepEqual(
    [GROWW_CONFIG, PHONEPE_CONFIG].map(({ company, boardSlug, connectorId }) => ({ company, boardSlug, connectorId })),
    [
      { company: 'Groww', boardSlug: 'groww', connectorId: 'groww-official-india' },
      { company: 'PhonePe', boardSlug: 'phonepe', connectorId: 'phonepe-official-india' },
    ],
  );
});
