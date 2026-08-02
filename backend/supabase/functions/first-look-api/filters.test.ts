import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyJob } from './filters.ts';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'moodys_13927',
    employerJobId: '13927',
    company: "Moody's",
    sourceUrl: 'https://careers.moodys.com/en/job/example',
    applyUrl: 'https://career8.successfactors.com/apply',
    title: 'Financial Data Analyst',
    location: 'Bengaluru, India',
    description: 'Analyze credit and financial statements for ratings research.',
    experienceText: '0-2 years experience',
    jobCategory: 'Credit Analysis & Research',
    postedAt: '2026-07-29T00:00:00.000Z',
    ...overrides
  };
}

test('accepts a senior-titled finance role whose requirement is 0-2 years', () => {
  assert.equal(classifyJob(job({ title: 'Senior Financial Data Analyst' })), 'match');
});

test('accepts equivalent entry-level experience wording', () => {
  for (const experienceText of ['0 to 2 years', 'up to 2 years', '0–1 years', 'Freshers may apply']) {
    assert.equal(classifyJob(job({ experienceText })), 'match', experienceText);
  }
});

test('rejects a finance role requiring at least 3 years', () => {
  assert.equal(classifyJob(job({ experienceText: 'Minimum 3+ years experience' })), 'experience_over_limit');
});

test('separates jobs whose experience cannot be determined', () => {
  assert.equal(classifyJob(job({ experienceText: '' })), 'experience_unknown');
});

test('requires an India location', () => {
  assert.equal(classifyJob(job({ location: 'London, United Kingdom' })), 'not_india');
});

test('requires finance work rather than an analyst title alone', () => {
  assert.equal(classifyJob(job({ title: 'Software Analyst', description: 'Build Java services.', jobCategory: 'Technology' })), 'not_finance');
});
