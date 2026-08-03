import assert from 'node:assert/strict';
import test from 'node:test';

import { presentCoverage, presentJob, sortPresentedJobs } from './presenters.ts';

const job = {
  id: 'citi_123',
  company: 'Citi',
  official_detail_url: 'https://jobs.citi.com/job/mumbai/analyst/287/123',
  official_apply_url: 'https://citi.wd5.myworkdayjobs.com/job/123/apply',
  title: 'Model Validation Analyst',
  location: 'Mumbai, India',
  description: 'Credit risk model validation.',
  first_seen_at: '2026-08-03T00:00:00Z',
  last_seen_at: '2026-08-03T01:00:00Z',
  posted_at: '2026-07-29T00:00:00Z',
  match_tier: 'possible' as const,
  classification_method: 'pending',
  location_status: 'india',
  finance_status: 'exact',
  experience_status: 'ambiguous',
  minimum_years: null,
  maximum_years: null,
  classified_at: '2026-08-03T01:00:00Z',
};

const sources = [
  {
    id: 1, job_id: 'citi_123', connector_id: 'citi-official-india', source_type: 'official_career',
    source_name: 'Citi Careers', source_external_id: '123', listing_url: job.official_detail_url,
    detail_url: job.official_detail_url, apply_url: job.official_apply_url, is_official: true,
    last_verified_at: '2026-08-03T01:00:00Z', active: true, hydration_status: 'complete',
  },
  {
    id: 2, job_id: 'citi_123', connector_id: 'linkedin-citi', source_type: 'linkedin',
    source_name: 'LinkedIn', source_external_id: 'li-123', listing_url: 'https://linkedin.com/jobs/view/123',
    detail_url: 'https://linkedin.com/jobs/view/123', apply_url: 'https://linkedin.com/jobs/view/123', is_official: false,
    last_verified_at: '2026-08-03T00:30:00Z', active: true, hydration_status: 'complete',
  },
];

const health = [
  { connector_id: 'citi-official-india', run_type: 'watch', status: 'complete', finished_at: '2026-08-03T01:00:00Z' },
  { connector_id: 'citi-official-india', run_type: 'reconcile', status: 'partial', finished_at: '2026-08-03T00:00:00Z' },
];

test('presents one canonical job with exact sources and official URL preference', () => {
  const payload = presentJob(job, sources, health);
  assert.equal(payload.id, 'citi_123');
  assert.deepEqual(payload.sources.map((source) => source.type), ['official_career', 'linkedin']);
  assert.equal(payload.applyUrl, payload.officialApplyUrl);
  assert.equal(payload.matchTier, 'possible');
  assert.equal(payload.eligibilityNote, 'Experience or relevance unconfirmed');
  assert.equal(payload.officialVerified, true);
  assert.equal(payload.sourceHealthState, 'partial');
  assert.equal(payload.watchFreshness, '2026-08-03T01:00:00Z');
  assert.equal(payload.reconcileFreshness, null);
  assert.equal(payload.sources[1].listingUrl, 'https://linkedin.com/jobs/view/123');
});

test('labels portal-only jobs unverified and uses their active destination only as fallback', () => {
  const payload = presentJob({
    ...job,
    id: 'portal_456',
    official_detail_url: null,
    official_apply_url: null,
    match_tier: 'exact',
  }, [{ ...sources[1], id: 3, job_id: 'portal_456' }], []);
  assert.equal(payload.applyUrl, 'https://linkedin.com/jobs/view/123');
  assert.equal(payload.officialVerified, false);
  assert.equal(payload.verificationNote, 'Official listing not yet verified');
  assert.equal(payload.applySourceType, 'linkedin');
});

test('sorts exact before possible, then newest first', () => {
  const possible = presentJob(job, sources, health);
  const olderExact = presentJob({ ...job, id: 'exact-old', match_tier: 'exact', first_seen_at: '2026-07-01T00:00:00Z' }, sources, health);
  const newerExact = presentJob({ ...job, id: 'exact-new', match_tier: 'exact', first_seen_at: '2026-08-02T00:00:00Z' }, sources, health);
  assert.deepEqual(sortPresentedJobs([possible, olderExact, newerExact]).map((item) => item.id), ['exact-new', 'exact-old', 'citi_123']);
});

test('sanitizes coverage to bounded operational fields and separates watch from reconcile', () => {
  const payload = presentCoverage([
    {
      connector_id: 'citi-official-india', source_company: 'Citi', source_type: 'official_career',
      run_type: 'watch', status: 'complete', hydration_status: 'backlog', reported_total: 721,
      pages_expected: 5, pages_fetched: 5, listings_discovered: 75, details_due: 40,
      details_fetched: 25, details_backlogged: 15, apply_urls_resolved: 22,
      error_summary: [], finished_at: '2026-08-03T01:00:00Z', raw_metadata: 'must-not-leak',
    },
    {
      connector_id: 'citi-official-india', source_company: 'Citi', source_type: 'official_career',
      run_type: 'reconcile', status: 'partial', hydration_status: 'degraded', reported_total: 721,
      pages_expected: 49, pages_fetched: 48, listings_discovered: 706, details_due: 20,
      details_fetched: 18, details_backlogged: 2, apply_urls_resolved: 17,
      error_summary: ['page 18 failed', 'x'.repeat(1000)], finished_at: '2026-08-03T00:00:00Z', bearer_token: 'must-not-leak',
    },
  ]);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].latestStatus, 'complete');
  assert.equal(payload[0].lastCompleteWatchAt, '2026-08-03T01:00:00Z');
  assert.equal(payload[0].lastCompleteReconcileAt, null);
  assert.equal(payload[0].reconcile.pagesFetched, 48);
  assert.equal(payload[0].reconcile.unresolvedApplyUrls, 1);
  assert.equal(payload[0].candidateBacklog, 15);
  assert.match(payload[0].anomalySummary, /page 18 failed/);
  assert.ok(JSON.stringify(payload).length < 5000);
  assert.doesNotMatch(JSON.stringify(payload), /must-not-leak|bearer_token|raw_metadata/);
});
