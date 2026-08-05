import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkdayConnector, MORNINGSTAR_CONFIG } from './workday.ts';

const DUMMY_CONFIG = {
  companyName: 'Dummy Co',
  baseUrl: 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers',
  tenant: 'dummy',
  siteName: 'Dummy_Careers',
  connectorIdPrefix: 'dummy',
};

test('enumerates the new Workday CXS jobs endpoint and filters India listings', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const body = JSON.parse(String(init?.body));
    if (body.offset === 0) {
      return new Response(JSON.stringify({
        total: 2,
        jobPostings: [
          { title: 'Financial Analyst', externalPath: '/job/Mumbai/Financial-Analyst_REQ-123', locationsText: 'Mumbai, India', postedOn: 'Posted Today' },
          { title: 'Engineer', externalPath: '/job/London/Engineer_REQ-456', locationsText: 'London, UK', postedOn: 'Posted Today' },
        ],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
  };

  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher, 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });

  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].sourceExternalId, '/job/Mumbai/Financial-Analyst_REQ-123');
  assert.equal(result.listings[0].detailUrl, 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/Mumbai/Financial-Analyst_REQ-123');
  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 2);
  assert.equal(requests[0].url, 'https://dummy.wd3.myworkdayjobs.com/wday/cxs/dummy/Dummy_Careers/jobs');
  assert.equal(JSON.parse(String(requests[0].init?.body)).offset, 0);
});

test('hydrates a Workday detail and preserves the role-level Apply URL', async () => {
  const fetcher = async (url: string) => {
    assert.equal(url, 'https://dummy.wd3.myworkdayjobs.com/wday/cxs/dummy/Dummy_Careers/job/Mumbai/Financial-Analyst_REQ-123');
    return new Response(JSON.stringify({
      jobPostingInfo: {
        title: 'Financial Analyst',
        jobDescription: '<p>0 to 2 years of experience in financial analysis.</p>',
        jobReqId: 'REQ-123',
        location: 'Mumbai, India',
        startDate: '2026-08-05',
        jobPostingId: 'Financial-Analyst_REQ-123',
        jobPostingSiteId: 'Dummy_Careers',
        canApply: true,
      },
    }), { status: 200 });
  };
  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher, 'watch');
  const result = await connector.hydrate({
    connectorId: 'dummy-official-india',
    sourceExternalId: '/job/Mumbai/Financial-Analyst_REQ-123',
    company: 'Dummy Co',
    title: 'Financial Analyst',
    location: 'Mumbai, India',
    category: null,
    department: null,
    detailUrl: 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/Mumbai/Financial-Analyst_REQ-123',
    listingMetadataHash: 'hash',
    rawMetadata: {},
  });

  assert.equal(result.connectorId, 'dummy-official-india');
  assert.equal(result.sourceType, 'official_career');
  assert.equal(result.employerJobId, 'REQ-123');
  assert.equal(result.description, '<p>0 to 2 years of experience in financial analysis.</p>');
  assert.match(result.experienceText, /0 to 2 years/i);
  assert.equal(result.applyUrl, 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/Mumbai/Financial-Analyst_REQ-123/apply');
});

test('turns Workday maintenance HTML into an actionable connector error', async () => {
  const fetcher = async () => new Response('<html><body class="maintenance-page">Maintenance</body></html>', { status: 500, statusText: 'Internal Server Error' });
  const connector = createWorkdayConnector(MORNINGSTAR_CONFIG, fetcher, 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'failed');
  assert.match(result.diagnostic.errorSummaries[0], /maintenance/i);
});

test('marks a truncated advertised Workday catalog partial', async () => {
  const fetcher = async (_url: string, init?: RequestInit) => {
    const offset = JSON.parse(String(init?.body)).offset;
    const count = offset === 0 ? 20 : offset === 20 ? 10 : 0;
    const jobPostings = Array.from({ length: count }, (_, index) => ({
      title: `Financial Analyst ${offset + index}`,
      externalPath: `/job/Mumbai/Financial-Analyst_REQ-${offset + index}`,
      locationsText: 'Mumbai, India',
    }));
    return new Response(JSON.stringify({ total: 60, jobPostings }), { status: 200 });
  };

  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher, 'reconcile');
  const result = await connector.enumerate({ runType: 'reconcile', detailBatchSize: 10, now: new Date() });

  assert.equal(result.diagnostic.status, 'partial');
  assert.equal(result.diagnostic.pagesExpected, 3);
  assert.equal(result.diagnostic.pagesFetched, 2);
  assert.match(result.diagnostic.errorSummaries[0], /Fetched 2 of 3/i);
});
