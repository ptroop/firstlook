import assert from 'node:assert/strict';
import test from 'node:test';

import { selectCandidate, selectDeferredAudit } from './candidates.ts';

const baseListing = {
  connectorId: 'citi-official-india',
  sourceExternalId: '123',
  company: 'Citi',
  title: 'Senior Finance Analyst',
  location: 'Pune, India',
  category: 'Technology',
  department: 'Engineering',
  detailUrl: 'https://jobs.citi.com/job/pune/software-engineer/287/123',
  listingMetadataHash: 'hash-123',
  rawMetadata: {},
};

test('hydrates a finance-category listing before reading its description', () => {
  const decision = selectCandidate({
    ...baseListing,
    category: 'Finance',
    department: 'Financial Planning & Analysis',
  });

  assert.equal(decision.status, 'hydrate');
  assert.ok(decision.reasons.includes('finance_metadata'));
});

test('hydrates every generic early-career title', () => {
  const titles = [
    'Graduate', 'Management Trainee', 'Summer Intern', 'Finance Apprentice',
    'Analyst', 'Associate', 'Credit Officer', 'Accounts Executive',
    'Operations Coordinator', 'Reporting Specialist', 'Business Consultant',
    'Financial Advisor', 'Researcher',
  ];

  for (const title of titles) {
    const decision = selectCandidate({ ...baseListing, title, sourceExternalId: title });
    assert.equal(decision.status, 'hydrate', title);
    assert.ok(decision.reasons.includes('early_career_title'), title);
  }
});

test('hydrates sparse metadata rather than assuming non-finance', () => {
  const decision = selectCandidate({
    ...baseListing,
    title: 'Analyst',
    category: null,
    department: 'Technology',
  });

  assert.equal(decision.status, 'hydrate');
  assert.ok(decision.reasons.includes('missing_category'));
});

test('defers a strongly structured software title even when the board omits category metadata', () => {
  const decision = selectCandidate({
    ...baseListing,
    title: 'Senior Java Developer - Assistant Vice President',
    category: null,
    department: null,
  });

  assert.deepEqual(decision, { status: 'defer', reasons: ['strong_non_finance_category'] });
});

test('defers technical analyst titles before hydration', () => {
  const decision = selectCandidate({
    ...baseListing,
    title: 'Technology Risk Analyst',
    category: 'Technology',
    department: 'Engineering',
  });

  assert.deepEqual(decision, { status: 'defer', reasons: ['strong_non_finance_category'] });
});

test('hydrates related education metadata and portal-corroborated listings', () => {
  const educationDecision = selectCandidate({
    ...baseListing,
    rawMetadata: { qualifications: 'MBA or PGDM in Finance preferred' },
  });
  const portalDecision = selectCandidate(baseListing, { portalCorroborated: true });

  assert.equal(educationDecision.status, 'hydrate');
  assert.ok(educationDecision.reasons.includes('education_signal'));
  assert.equal(portalDecision.status, 'hydrate');
  assert.ok(portalDecision.reasons.includes('portal_corroborated'));
});

test('defers only strongly categorized non-finance listings without another signal', () => {
  assert.deepEqual(selectCandidate({
    ...baseListing,
    title: 'Platform Architect',
    category: 'Technology',
    department: 'Engineering',
  }), {
    status: 'defer',
    reasons: ['strong_non_finance_category'],
  });
});

test('defers design titles before hydration even when the employer is a finance company', () => {
  const decision = selectCandidate({
    ...baseListing,
    company: 'D. E. Shaw',
    title: 'Contractor - Visual Designer (Design and User Experience)',
    category: 'Design',
    department: 'Design and User Experience',
  });

  assert.deepEqual(decision, {
    status: 'defer',
    reasons: ['strong_non_finance_category'],
  });
});

test('hydrates D. E. Shaw generic analyst titles despite sparse category labels', () => {
  const decision = selectCandidate({
    ...baseListing,
    connectorId: 'deshaw-official-india',
    company: 'D. E. Shaw',
    title: 'Analyst',
    category: 'All Positions',
    department: null,
    detailUrl: 'https://www.deshawindia.com/careers/analyst-financial-operations-7074',
  });

  assert.equal(decision.status, 'hydrate');
  assert.ok(decision.reasons.includes('connector_rule'));
});

test('returns bounded, unique machine-readable reasons', () => {
  const decision = selectCandidate({
    ...baseListing,
    title: 'Graduate Finance Analyst',
    category: null,
    department: null,
    rawMetadata: { qualification: 'MBA Finance' },
  }, { portalCorroborated: true });

  assert.ok(decision.reasons.length <= 12);
  assert.equal(new Set(decision.reasons).size, decision.reasons.length);
});

test('selects a deterministic bounded daily audit from deferred listings', () => {
  const listings = Array.from({ length: 20 }, (_, index) => ({
    ...baseListing,
    title: 'Platform Architect',
    category: 'Technology',
    department: 'Engineering',
    sourceExternalId: String(index + 1),
  }));

  const first = selectDeferredAudit(listings, { utcDate: '2026-08-03', limit: 3 });
  const repeated = selectDeferredAudit([...listings].reverse(), { utcDate: '2026-08-03', limit: 3 });

  assert.equal(first.length, 3);
  assert.deepEqual(
    first.map((listing) => listing.sourceExternalId),
    repeated.map((listing) => listing.sourceExternalId),
  );
  assert.ok(first.every((listing) => selectCandidate(listing).status === 'defer'));
});
