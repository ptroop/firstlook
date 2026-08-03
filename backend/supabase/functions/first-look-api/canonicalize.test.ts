import assert from 'node:assert/strict';
import test from 'node:test';

import { decideCanonicalLink, mergeCanonicalJob } from './canonicalize.ts';

const observation = {
  connectorId: 'citi-official-india',
  sourceType: 'official_career' as const,
  sourceName: 'Citi Careers',
  sourceExternalId: '82424271840',
  company: 'Citi',
  employerJobId: '82424271840',
  listingUrl: 'https://jobs.citi.com/job/mumbai/model-analyst/287/82424271840',
  detailUrl: 'https://jobs.citi.com/job/mumbai/model-analyst/287/82424271840?source=search',
  applyUrl: 'https://jobs.citi.com/apply/82424271840',
  isOfficial: true,
  title: 'Model/Anlys/Valid Analyst I - C09',
  location: 'Mumbai, India',
  description: 'Credit risk model validation.',
  experienceText: '0-2 years',
  jobCategory: 'Risk Management',
  postedAt: '2026-08-01T00:00:00.000Z',
  listingMetadataHash: 'meta',
  contentHash: 'content',
  rawMetadata: {},
};

const existing = {
  id: 'citi_82424271840',
  company: 'Citi',
  employerJobId: '82424271840',
  title: observation.title,
  location: observation.location,
  postedAt: observation.postedAt,
  officialDetailUrl: observation.detailUrl,
  officialApplyUrl: observation.applyUrl,
  descriptionHash: observation.contentHash,
  officialVerifiedAt: '2026-08-02T00:00:00.000Z',
};

test('links by normalized employer and verified employer job ID', () => {
  const result = decideCanonicalLink({ ...observation, company: 'CITI ' }, [existing]);
  assert.deepEqual(result, { status: 'linked', jobId: 'citi_82424271840', matchedBy: 'employer_job_id' });
});

test('links by canonical official URL after removing tracking parameters', () => {
  const result = decideCanonicalLink({ ...observation, employerJobId: null }, [{
    ...existing,
    employerJobId: null,
    officialDetailUrl: `${observation.detailUrl}&utm_source=alert`,
  }]);
  assert.deepEqual(result, { status: 'linked', jobId: 'citi_82424271840', matchedBy: 'official_url' });
});

test('refuses a URL merge when verified employer IDs conflict', () => {
  const result = decideCanonicalLink(observation, [{ ...existing, employerJobId: 'different-id' }]);
  assert.deepEqual(result, { status: 'conflict', jobId: null, matchedBy: null });
});

test('does not merge distinct D. E. Shaw roles through its shared application bundle URL', () => {
  const result = decideCanonicalLink({
    ...observation,
    connectorId: 'deshaw-official-india',
    company: 'D. E. Shaw',
    employerJobId: '2781',
    detailUrl: 'https://www.deshawindia.com/careers/all-positions-in-financial-operations-2781',
    applyUrl: 'https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS',
    title: 'All positions in Financial Operations',
  }, [{
    ...existing,
    id: 'deshaw_5423',
    company: 'D. E. Shaw',
    employerJobId: '5423',
    officialDetailUrl: 'https://www.deshawindia.com/careers/lead-tech-qte-5423',
    officialApplyUrl: 'https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS',
  }]);

  assert.deepEqual(result, { status: 'pending', jobId: null, matchedBy: null });
});

test('keeps same-title roles in conflicting locations separate', () => {
  const result = decideCanonicalLink({
    ...observation,
    employerJobId: null,
    detailUrl: 'https://example.com/new',
    applyUrl: 'https://example.com/apply/new',
  }, [{
    ...existing,
    employerJobId: null,
    officialDetailUrl: 'https://example.com/old',
    location: 'Pune, India',
  }]);
  assert.deepEqual(result, { status: 'pending', jobId: null, matchedBy: null });
});

test('allows an exact weak fingerprint only when title location and posting date agree', () => {
  const result = decideCanonicalLink({
    ...observation,
    employerJobId: null,
    detailUrl: 'https://portal.example/citi/analyst',
    applyUrl: null,
  }, [{ ...existing, employerJobId: null }]);
  assert.deepEqual(result, { status: 'linked', jobId: 'citi_82424271840', matchedBy: 'fingerprint' });
});

test('portal data fills gaps but cannot overwrite verified official fields', () => {
  const merged = mergeCanonicalJob({
    ...existing,
    description: 'Verified official description',
    jobCategory: '',
  }, {
    ...observation,
    sourceType: 'linkedin',
    sourceName: 'LinkedIn',
    isOfficial: false,
    title: 'Changed portal title',
    description: 'Portal description',
    jobCategory: 'Risk',
  }, '2026-08-03T00:00:00.000Z');

  assert.equal(merged.title, existing.title);
  assert.equal(merged.description, 'Verified official description');
  assert.equal(merged.jobCategory, 'Risk');
  assert.equal(merged.officialApplyUrl, existing.officialApplyUrl);
});
