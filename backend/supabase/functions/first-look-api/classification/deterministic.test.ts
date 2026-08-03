import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDeterministically } from './deterministic.ts';
import { parseExperience } from './experience.ts';

test('normalizes zero-to-two-year experience wording', () => {
  const cases = [
    '0-2 years experience',
    '1 - 2 years of relevant experience',
    'one to two years in financial analysis',
    '0–2 years',
    'up to 24 months of experience',
    'up to 2 years',
    'Freshers may apply',
    'No prior experience required',
    '2 years of experience preferred',
  ];

  for (const text of cases) {
    assert.equal(parseExperience(text).status, 'zero_to_two', text);
  }
});

test('keeps open-ended and contradictory requirements ambiguous', () => {
  const cases = [
    '1+ years of experience',
    '2+ years of experience',
    'At least 2 years of experience',
    '0-2 years in analytics and minimum 4 years in banking',
    '',
  ];

  for (const text of cases) {
    assert.equal(parseExperience(text).status, 'ambiguous', text);
  }
});

test('marks explicit requirements above two years as over two', () => {
  const cases = [
    'Minimum 3 years of experience',
    '3+ years in finance',
    '1-3 years of relevant experience',
    '36 months of required experience',
  ];

  for (const text of cases) {
    assert.equal(parseExperience(text).status, 'over_two', text);
  }
});

test('extracts numeric years and evidence without inventing missing bounds', () => {
  assert.deepEqual(parseExperience('Candidates need 1-2 years of experience.'), {
    status: 'zero_to_two',
    minimumYears: 1,
    maximumYears: 2,
    evidence: ['1-2 years'],
  });
  assert.deepEqual(parseExperience('2+ years preferred'), {
    status: 'zero_to_two',
    minimumYears: null,
    maximumYears: null,
    evidence: ['2+ years preferred'],
  });
});

const baseJob = {
  title: 'Senior Financial Data Analyst',
  location: 'Bengaluru, India',
  description: 'Analyze credit and financial statements for ratings research and capital markets.',
  jobCategory: 'Credit Analysis & Research',
  experienceText: '0-2 years experience',
};

test('classifies verified Moody’s, D. E. Shaw, and Citi finance patterns', () => {
  const cases = [
    baseJob,
    {
      ...baseJob,
      title: 'Analyst - Financial Operations',
      description: 'Perform fund accounting, pricing, reconciliation, and portfolio reporting.',
      jobCategory: 'Financial Operations',
      experienceText: '1-2 years',
    },
    {
      ...baseJob,
      title: 'Analyst - Compliance Trade Monitoring',
      description: 'Review regulatory controls, compliance alerts, and trade monitoring.',
      jobCategory: 'Compliance',
      experienceText: 'Up to two years of experience',
    },
    {
      ...baseJob,
      title: 'Analyst - Private Credit Operations & Reporting',
      description: 'Support private credit investment operations and portfolio reporting.',
      jobCategory: 'Financial Operations',
      experienceText: '0–2 years',
    },
    {
      ...baseJob,
      title: 'Model/Anlys/Valid Analyst I - C09',
      location: 'Mumbai, India',
      description: 'Support model analysis and validation for credit risk.',
      jobCategory: 'Risk Management',
      experienceText: '0-2 years of experience',
    },
  ];

  for (const input of cases) {
    const result = classifyDeterministically(input);
    assert.equal(result.locationStatus, 'india', input.title);
    assert.equal(result.financeStatus, 'exact', input.title);
    assert.equal(result.experienceStatus, 'zero_to_two', input.title);
    assert.equal(result.matchTier, 'exact', input.title);
  }
});

test('does not exclude finance roles merely because they include data or technology', () => {
  const result = classifyDeterministically({
    ...baseJob,
    title: 'Data Analytics Analyst - Credit Research',
    description: 'Build data tooling for credit research, valuation, and fixed income analysis.',
    jobCategory: 'Technology and Financial Research',
  });

  assert.equal(result.financeStatus, 'exact');
  assert.equal(result.matchTier, 'exact');
});

test('uses possible for uncertainty and not-targeted only for explicit exclusions', () => {
  assert.equal(classifyDeterministically({ ...baseJob, experienceText: '' }).matchTier, 'possible');
  assert.equal(classifyDeterministically({ ...baseJob, location: 'Remote - APAC' }).matchTier, 'possible');
  assert.equal(classifyDeterministically({ ...baseJob, location: 'London, United Kingdom' }).matchTier, 'not_targeted');
  assert.equal(classifyDeterministically({
    ...baseJob,
    title: 'Software Engineer',
    description: 'Build Java services and cloud infrastructure.',
    jobCategory: 'Technology',
  }).matchTier, 'not_targeted');
  assert.equal(classifyDeterministically({ ...baseJob, experienceText: 'Minimum 4 years required' }).matchTier, 'not_targeted');
});
