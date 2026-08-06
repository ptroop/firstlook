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

test('keeps preferred-only experience within two years eligible and rejects higher preferred ranges', () => {
  for (const text of ['0-2 years preferred', '2+ years preferred', '0–1 years desirable', 'up to 18 months preferred']) {
    assert.equal(parseExperience(text).status, 'zero_to_two', text);
  }
  for (const text of ['3-8 years preferred', '5+ years of experience preferred', '6-10 years desirable', '4 years experience preferred']) {
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

test('ignores company-history years when parsing job requirements', () => {
  const result = parseExperience('Candidates need 1-2 years of experience. Goldman Sachs has more than 150 years of history.');
  assert.equal(result.status, 'zero_to_two');
  assert.deepEqual(result.evidence, ['1-2 years']);
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

test('does not classify a software role as finance from generic bank boilerplate', () => {
  const result = classifyDeterministically({
    title: 'Senior Java Backend Developer - Assistant Vice President',
    location: 'Chennai, India',
    description: 'Build Java services and cloud infrastructure for a global financial services company.',
    jobCategory: 'Technology / Applications Development',
    experienceText: '5-8 years of experience',
  });

  assert.equal(result.financeStatus, 'unrelated');
  assert.equal(result.matchTier, 'not_targeted');
});

test('hard-excludes safety and environmental roles before reading finance boilerplate', () => {
  const result = classifyDeterministically({
    title: 'Assistant Manager - Environment, Health and Safety',
    location: 'Kumbalgodu, India',
    description: 'Manage site safety, risk assessment, and regulatory reporting.',
    jobCategory: 'Environment, Health and Safety',
    experienceText: '3-5 years',
  });

  assert.equal(result.financeStatus, 'unrelated');
  assert.equal(result.matchTier, 'not_targeted');
});

test('hard-excludes technical titles before reading finance boilerplate', () => {
  const technicalTitles = [
    'Technology Risk Analyst',
    'Data Engineer - Financial Services',
    'Software Developer - Banking Platform',
    'Systems Analyst - Finance Technology',
  ];

  for (const title of technicalTitles) {
    const result = classifyDeterministically({
      title,
      location: 'Bengaluru, India',
      description: 'Build technology for a global financial services company.',
      jobCategory: 'Technology',
      experienceText: '0-2 years',
    });

    assert.equal(result.financeStatus, 'unrelated', title);
    assert.equal(result.matchTier, 'not_targeted', title);
  }
});

test('keeps finance and finance-context operations analysts eligible', () => {
  const cases = [
    { title: 'Finance Analyst', description: 'Prepare financial reporting and variance analysis.', jobCategory: 'Finance' },
    { title: 'Operations Analyst', description: 'Support reconciliation and investment operations.', jobCategory: 'Operations' },
    { title: 'Financial Data Analyst', description: 'Analyze credit and financial statements.', jobCategory: 'Credit Research' },
  ];

  for (const input of cases) {
    const result = classifyDeterministically({
      ...input,
      location: 'Mumbai, India',
      experienceText: '0-2 years',
    });

    assert.equal(result.financeStatus, 'exact', input.title);
    assert.equal(result.matchTier, 'exact', input.title);
  }
});

test('excludes generic compliance and customer-facing fintech roles without finance evidence', () => {
  const cases = [
    { title: 'Compliance Analyst', description: 'Maintain policy registers and coordinate internal training.', jobCategory: 'Corporate Compliance' },
    { title: 'Product Manager - Payments', description: 'Own product discovery, roadmaps, and user growth for a payments app.', jobCategory: 'Product Management' },
    { title: 'Sales Operations Analyst', description: 'Improve sales reporting and pipeline conversion for merchant accounts.', jobCategory: 'Sales' },
  ];

  for (const input of cases) {
    const result = classifyDeterministically({ ...input, location: 'Bengaluru, India', experienceText: '0-2 years' });
    assert.equal(result.financeStatus, 'unrelated', input.title);
    assert.equal(result.matchTier, 'not_targeted', input.title);
  }
});

test('excludes design, UX, and creative roles even when the employer is financial', () => {
  const cases = [
    { title: 'Contractor - Visual Designer (Design and User Experience)', jobCategory: 'Design', description: 'Create visual experiences for a financial services employer.' },
    { title: 'Customer Strategy & Design Consultant', jobCategory: 'Customer Strategy', description: 'Lead design thinking and customer experience work.' },
    { title: 'UX Researcher', jobCategory: 'User Experience', description: 'Research user journeys for a banking product.' },
  ];

  for (const input of cases) {
    const result = classifyDeterministically({ ...input, location: 'Bengaluru, India', experienceText: '0-2 years' });
    assert.equal(result.financeStatus, 'unrelated', input.title);
    assert.equal(result.matchTier, 'not_targeted', input.title);
  }
});

test('keeps regulated finance controls and compliance roles eligible', () => {
  const result = classifyDeterministically({
    title: 'Analyst - Financial Compliance',
    location: 'Mumbai, India',
    description: 'Review AML alerts, sanctions screening, and regulatory controls.',
    jobCategory: 'Compliance',
    experienceText: '0-2 years',
  });

  assert.equal(result.financeStatus, 'exact');
  assert.equal(result.matchTier, 'exact');
});

test('does not surface an exploratory talent-pool page as a live vacancy', () => {
  const result = classifyDeterministically({
    title: 'All positions in Financial Operations',
    location: 'Hyderabad, Bengaluru or Gurugram, India',
    description: 'If you would like the group to consider your candidacy without specifying a role, we invite you to submit a general, exploratory application here.',
    jobCategory: 'Financial Operations',
    experienceText: '',
  });

  assert.equal(result.financeStatus, 'unrelated');
  assert.equal(result.matchTier, 'not_targeted');
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
