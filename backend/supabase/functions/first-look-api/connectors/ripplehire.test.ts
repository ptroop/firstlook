import assert from 'node:assert/strict';
import test from 'node:test';

import { createRippleHireConnector, HDFC_BANK_RIPPLEHIRE_CONFIG } from './ripplehire.ts';

const careerPage = `
<input type="hidden" id="token" value="public-token" />
<input type="hidden" id="source" value="CAREERSITE" />
`;

function searchResponse(page: number) {
  const jobs = page === 0
    ? [
      { jobSeq: '1001', jobTitle: 'Finance Analyst', locations: 'Mumbai', jobReqExp: '0 - 2 Years', jobPostingDate: '10-Aug-2026', bussinessUnit: 'Finance' },
      { jobSeq: '1002', jobTitle: 'Risk Associate', locations: 'Pune', jobReqExp: '1 - 2 Years', jobPostingDate: '09-Aug-2026', bussinessUnit: 'Risk' },
    ]
    : [];
  return { totalJobCount: 2, jobVoList: jobs };
}

test('enumerates every RippleHire page and hydrates the role through the official API', async () => {
  const requests: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method || 'GET'} ${url}`);
    if (url === HDFC_BANK_RIPPLEHIRE_CONFIG.careerPageUrl) return new Response(careerPage, { status: 200 });
    if (url.endsWith('/candidate/candidatejobsearch')) {
      const body = String(init?.body || '');
      const params = new URLSearchParams(body);
      const search = JSON.parse(params.get('careerSiteUrlParams') || '{}');
      return new Response(JSON.stringify(searchResponse(Number(search.page || 0))), { status: 200 });
    }
    if (url.includes('/candidate/candidatejobdetail?')) {
      return new Response(JSON.stringify({ jobVO: {
        jobSeq: '1001',
        jobId: 'REQ-1001',
        jobTitle: 'Finance Analyst',
        locations: 'Mumbai',
        jobDesc: '<p>Support financial reporting and reconciliation.</p>',
        jobReqExp: '0 - 2 Years',
        jobPostingDate: '10-Aug-2026',
        bussinessUnit: 'Finance',
      } }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  const connector = createRippleHireConnector(HDFC_BANK_RIPPLEHIRE_CONFIG, fetcher, 'reconcile');
  const result = await connector.enumerate({ runType: 'reconcile', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 2);
  assert.deepEqual(result.listings.map((listing) => listing.title), ['Finance Analyst', 'Risk Associate']);
  assert.match(result.listings[0].detailUrl, /#detail\/job\/1001$/);

  const hydrated = await connector.hydrate(result.listings[0], { runType: 'reconcile', detailBatchSize: 10, now: new Date() });
  assert.equal(hydrated.applyUrl, 'https://hdfcbank.ripplehire.com/candidate/?token=public-token&source=CAREERSITE#apply/job/1001');
  assert.match(hydrated.description, /financial reporting/);
  assert.match(hydrated.experienceText, /0 - 2 Years/i);
  assert.equal(requests.filter((request) => request.includes('candidatejobsearch')).length, 1);
});

test('marks a bounded RippleHire watch as partial when the source advertises more pages', async () => {
  const fetcher = async (url: string) => {
    if (url === HDFC_BANK_RIPPLEHIRE_CONFIG.careerPageUrl) return new Response(careerPage, { status: 200 });
    if (url.endsWith('/candidate/candidatejobsearch')) return new Response(JSON.stringify({ totalJobCount: 600, jobVoList: [{ jobSeq: '1001', jobTitle: 'Finance Analyst', locations: 'Mumbai' }] }), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  const connector = createRippleHireConnector(HDFC_BANK_RIPPLEHIRE_CONFIG, fetcher, 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'partial');
  assert.match(result.diagnostic.errorSummaries[0], /advertised RippleHire pages/i);
});
