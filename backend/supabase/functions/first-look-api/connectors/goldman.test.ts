import assert from 'node:assert/strict';
import test from 'node:test';

import { createGoldmanConnector, parseGoldmanJob } from './goldman.ts';

const detailHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { role: {
    roleId: '178292_GS_MID_CAREER',
    corporateTitle: 'Associate',
    jobTitle: 'Global Banking & Markets, Operations, Listed Derivatives, Analyst / Associate, Mumbai',
    jobFunction: 'Matching, Shaping, Allocation',
    division: 'Global Banking & Markets',
    locations: [{ primary: true, city: 'Mumbai', state: 'Maharashtra', country: 'India' }],
    descriptionHtml: '<p>Support listed derivatives operations.</p><p>Bachelor degree with one-two years of experience in financial services.</p>',
    startDate: '2026-07-31',
    applyActive: true,
    externalSource: {
      sourceId: '178292',
      externalApplicationUrl: 'https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring/job/178292/apply/email',
    },
  } } },
})}</script>`;

test('parses Goldman detail payload and preserves the direct Oracle apply URL', () => {
  const parsed = parseGoldmanJob(detailHtml, 'https://higher.gs.com/roles/178292');
  assert.equal(parsed.employerJobId, '178292');
  assert.equal(parsed.location, 'Mumbai, Maharashtra, India');
  assert.equal(parsed.jobCategory, 'Matching, Shaping, Allocation');
  assert.match(parsed.experienceText, /one-two years/i);
  assert.equal(parsed.postedAt, '2026-07-31T00:00:00.000Z');
  assert.match(parsed.applyUrl, /oraclecloud\.com/);
});

test('paginates the complete India role inventory from Goldman’s public board API', async () => {
  const requestedPages: number[] = [];
  const connector = createGoldmanConnector(async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}')) as { variables?: { searchQueryInput?: { page?: { pageNumber?: number } } } };
    const page = body.variables?.searchQueryInput?.page?.pageNumber || 0;
    requestedPages.push(page);
    const items = page === 0
      ? Array.from({ length: 20 }, (_, index) => role(index + 1))
      : [role(21)];
    return new Response(JSON.stringify({ data: { roleSearch: { totalCount: 21, items } } }), { status: 200 });
  });
  const result = await connector.enumerate({ runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z') });
  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 21);
  assert.equal(result.diagnostic.pagesExpected, 2);
  assert.equal(result.listings.length, 21);
  assert.deepEqual(requestedPages, [0, 1]);
  assert.equal(result.listings[0].detailUrl, 'https://higher.gs.com/roles/1');
});

test('does not silently report complete coverage when a Goldman page fails', async () => {
  const connector = createGoldmanConnector(async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}')) as { variables?: { searchQueryInput?: { page?: { pageNumber?: number } } } };
    const page = body.variables?.searchQueryInput?.page?.pageNumber || 0;
    if (page === 1) return new Response('upstream failure', { status: 503 });
    return new Response(JSON.stringify({ data: { roleSearch: { totalCount: 21, items: Array.from({ length: 20 }, (_, index) => role(index + 1)) } } }), { status: 200 });
  });
  const result = await connector.enumerate({ runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z') });
  assert.equal(result.diagnostic.status, 'partial');
  assert.match(result.diagnostic.errorSummaries.join(' '), /HTTP 503/);
});

function role(id: number) {
  return {
    roleId: `${id}_GS_MID_CAREER`,
    corporateTitle: 'Analyst',
    jobTitle: `Finance Operations Analyst ${id}`,
    jobFunction: 'Operations',
    locations: [{ primary: true, city: 'Mumbai', state: 'Maharashtra', country: 'India' }],
    status: 'POSTED',
    division: 'Global Banking & Markets',
    skills: [],
    externalSource: { sourceId: String(id) },
  };
}
