import assert from 'node:assert/strict';
import test from 'node:test';
import { EY_GDS_YELLO_CONFIG, createYelloConnector } from './yello.ts';

const searchHtml = `
<li class="search-results__item">
  <div class="clearfix">
    <div class="search-results__jobinfo pull-left">
      <a class="search-results__req_title" lang="en" href="/jobs/5BNe5PYwsGAoOa4A26rKCw?job_board_id=c1riT--B2O-KySgYWsZO1Q">Business Analyst - Tech Consulting Digital Engineering</a>
      <div><span>1715875</span></div>
    </div>
    <div class="search-results__post-time pull-right">3w</div>
  </div>
</li>
<li class="search-results__item">
  <div class="clearfix">
    <div class="search-results__jobinfo pull-left">
      <a class="search-results__req_title" lang="en" href="/jobs/j3XQnY1oS82bWYtwSefNUQ?job_board_id=c1riT--B2O-KySgYWsZO1Q">Associate - Tax, Corporate Secretarial (2026)</a>
      <div><span>1727422</span></div>
    </div>
  </div>
</li>
`;

const detailHtml = `
<div class="details-top__title pull-left"><h1>Business Analyst - Tech Consulting Digital Engineering</h1></div>
<div class="job-details__description pull-left">
  <p>Join EY Global Delivery Services and support financial services clients. Work from Bengaluru, India.</p>
  <p>Requires 0-2 years of experience in financial analysis and consulting.</p>
</div>
<div class="details-top__apply"><a class="btn btn-primary btn-apply" href="/external/requisitions/5BNe5PYwsGAoOa4A26rKCw/apply?locale=en">Apply now</a></div>
`;

test('enumerates only India roles from the EY GDS Yello board search', async () => {
  const connector = createYelloConnector(EY_GDS_YELLO_CONFIG, async (url) => {
    const href = String(url);
    if (href.includes('/search')) return new Response(JSON.stringify({ html: searchHtml }), { status: 200 });
    return new Response(detailHtml, { status: 200 });
  }, 'reconcile');
  const result = await connector.enumerate({ runType: 'reconcile', now: '2026-08-07T00:00:00Z' });
  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.listings.length, 2);
  assert.equal(result.listings[0].sourceExternalId, '5BNe5PYwsGAoOa4A26rKCw');
  assert.equal(result.listings[0].title, 'Business Analyst - Tech Consulting Digital Engineering');
  assert.match(result.listings[0].detailUrl, /eyglobal\.yello\.co\/jobs\/5BNe5PYwsGAoOa4A26rKCw/);
});

test('hydrates title, India location, description and Apply URL from the Yello detail page', async () => {
  const connector = createYelloConnector(EY_GDS_YELLO_CONFIG, async (url) => {
    if (String(url).includes('/search')) return new Response(JSON.stringify({ html: searchHtml }), { status: 200 });
    return new Response(detailHtml, { status: 200 });
  }, 'reconcile');
  const listing = {
    connectorId: 'ey-gds-official-india',
    sourceExternalId: '5BNe5PYwsGAoOa4A26rKCw',
    company: 'EY GDS',
    title: 'Business Analyst - Tech Consulting Digital Engineering',
    location: null,
    category: null,
    department: null,
    detailUrl: 'https://eyglobal.yello.co/jobs/5BNe5PYwsGAoOa4A26rKCw?job_board_id=c1riT--B2O-KySgYWsZO1Q',
    listingMetadataHash: 'hash',
    rawMetadata: {},
  };
  const result = await connector.hydrate(listing, { runType: 'reconcile', now: '2026-08-07T00:00:00Z' });
  assert.equal(result.title, 'Business Analyst - Tech Consulting Digital Engineering');
  assert.match(result.location, /Bengaluru/i);
  assert.match(result.description, /Global Delivery Services/i);
  assert.equal(result.applyUrl, 'https://eyglobal.yello.co/external/requisitions/5BNe5PYwsGAoOa4A26rKCw/apply?locale=en');
  assert.equal(result.isOfficial, true);
});

test('throws when the detail page exposes no Apply URL', async () => {
  const connector = createYelloConnector(EY_GDS_YELLO_CONFIG, async (url) => {
    if (String(url).includes('/search')) return new Response(JSON.stringify({ html: searchHtml }), { status: 200 });
    return new Response('<h1>Job</h1><div class="job-details__description"><p>Description</p></div>', { status: 200 });
  }, 'reconcile');
  await assert.rejects(
    connector.hydrate({
      connectorId: 'ey-gds-official-india',
      sourceExternalId: 'missing',
      company: 'EY GDS',
      title: 'Job',
      location: null,
      category: null,
      department: null,
      detailUrl: 'https://eyglobal.yello.co/jobs/missing?job_board_id=c1riT--B2O-KySgYWsZO1Q',
      listingMetadataHash: 'hash',
      rawMetadata: {},
    }, { runType: 'reconcile', now: '2026-08-07T00:00:00Z' }),
    /Missing required EY GDS Yello job fields/i,
  );
});
