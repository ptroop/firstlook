import assert from 'node:assert/strict';
import test from 'node:test';

import { checkJobStatusUrl, classifyJobStatusPage, pickRoleStatusUrl } from './job-status.ts';

function page(overrides: Partial<Parameters<typeof classifyJobStatusPage>[0]> = {}) {
  return {
    httpStatus: 200,
    finalUrl: 'https://jobs.example.com/requisition/1234',
    body: '<html><title>Financial Analyst</title><body><h1>Financial Analyst</h1><p>Mumbai, India. 0-2 years. Apply now.</p></body></html>',
    contentType: 'text/html',
    ...overrides,
  };
}

test('classifies 404 and 410 responses as closed', () => {
  assert.equal(classifyJobStatusPage(page({ httpStatus: 404 })).status, 'closed');
  assert.equal(classifyJobStatusPage(page({ httpStatus: 410 })).status, 'closed');
});

test('classifies 200 pages with closed-posting wording as closed', () => {
  const bodies = [
    'This job is no longer accepting applications.',
    'The position has been filled.',
    'We are sorry, the job posting you requested has been removed.',
    'This requisition is no longer available. No open vacancies at this time.',
    'We no longer have any open positions. Sorry, the page you requested cannot be found.',
    'This role has been closed.',
  ];
  for (const body of bodies) {
    assert.equal(classifyJobStatusPage(page({ body })).status, 'closed', body);
  }
});

test('classifies live 200 pages with readable content as open', () => {
  const body = '<html><head><title>Credit Risk Analyst - Mumbai</title></head><body><h1>Credit Risk Analyst</h1><p>Join our risk team in Mumbai. 0-2 years of experience welcome.</p><h2>Responsibilities</h2><p>Perform credit analysis, financial modeling and portfolio reporting. Support quarterly reviews and regulatory reporting for the India credit portfolio.</p><h2>Requirements</h2><p>MBA or equivalent with strong Excel and analytical skills. 0-2 years of relevant experience in banking or financial services.</p><p>We are an equal opportunity employer. Apply before the end of the quarter to be considered for this opening.</p></body></html>';
  const result = classifyJobStatusPage(page({ body }));
  assert.equal(result.status, 'open');
  assert.equal(result.note, 'The posting page is live.');
});

test('does not flag live-page talent-community footer boilerplate as closed', () => {
  const filler = Array.from({ length: 16 }, (_, index) => `<p>Section ${index + 1}: detailed responsibilities and qualifications for the role in Mumbai, including financial modeling, quarterly reporting and stakeholder coordination for the banking and capital markets vertical.</p>`).join('');
  const body = `<html><head><title>Financial Analyst - Mumbai</title></head><body><h1>Financial Analyst</h1>${filler}<footer>Can't find the job you are looking for? Unable to find the job that fits? Join our talent community. No vacancies currently in this team.</footer></body></html>`;
  assert.equal(classifyJobStatusPage(page({ body })).status, 'open');
});

test('does not mistake job-description wording about past roles for a closed posting', () => {
  const body = '<p>Responsibilities: support the closure of month-end close, reconcile positions filled by vendors, and report on open vacancies in the pipeline.</p><p>This is a long enough paragraph that the page clearly has real content.</p>';
  assert.equal(classifyJobStatusPage(page({ body })).status, 'open');
});

test('keeps ambiguous responses as unknown instead of guessing', () => {
  assert.equal(classifyJobStatusPage(page({ httpStatus: 403 })).status, 'unknown');
  assert.equal(classifyJobStatusPage(page({ httpStatus: 502 })).status, 'unknown');
  assert.equal(classifyJobStatusPage(page({ httpStatus: 301, finalUrl: 'https://jobs.example.com/careers' })).status, 'unknown');
  assert.equal(classifyJobStatusPage(page({ body: '<html><div id="app"></div></html>' })).status, 'unknown');
  assert.equal(classifyJobStatusPage(page({ httpStatus: 429 })).status, 'unknown');
});

test('returns unknown when the only URL is a generic career page', () => {
  assert.equal(pickRoleStatusUrl(
    { official_detail_url: 'https://example.com/careers' },
    [],
  ), null);
  assert.equal(pickRoleStatusUrl(
    { official_detail_url: 'https://example.myworkdayjobs.com/careers' },
    [],
  ), null);
});

test('prefers official role-level URLs over generic and portal fallbacks', () => {
  const picked = pickRoleStatusUrl(
    { official_detail_url: 'https://jobs.example.com/requisition/1234' },
    [{ detail_url: 'https://jobs.example.com/careers', is_official: true }],
  );
  assert.equal(picked, 'https://jobs.example.com/requisition/1234');
});

test('falls back to a non-generic source URL when the job row has none', () => {
  const picked = pickRoleStatusUrl(
    { official_detail_url: null, official_apply_url: null },
    [{ detail_url: 'https://example.com/jobs/456', listing_url: 'https://example.com/careers', is_official: true }],
  );
  assert.equal(picked, 'https://example.com/jobs/456');
});

test('wraps fetch failures and aborts as unknown verdicts', async () => {
  const failing = await checkJobStatusUrl('https://jobs.example.com/1234', {
    now: () => new Date('2026-08-06T10:00:00Z'),
    fetcher: async () => { throw new Error('network down'); },
  });
  assert.equal(failing.status, 'unknown');
  assert.equal(failing.checkedAt, '2026-08-06T10:00:00.000Z');

  const notFound = await checkJobStatusUrl('https://jobs.example.com/1234', {
    now: () => new Date('2026-08-06T10:00:00Z'),
    fetcher: async () => new Response('<html>not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
  });
  assert.equal(notFound.status, 'closed');

  const live = await checkJobStatusUrl('https://jobs.example.com/1234', {
    now: () => new Date('2026-08-06T10:00:00Z'),
    fetcher: async () => new Response('<html><title>Financial Analyst</title><body><h1>Financial Analyst</h1><p>Mumbai, India. 0-2 years of experience in accounting or treasury preferred. Responsibilities include monthly reporting, reconciliations and variance analysis for the finance team.</p><p>Apply now. We look forward to hearing from you.</p></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }),
  });
  assert.equal(live.status, 'open');
});
