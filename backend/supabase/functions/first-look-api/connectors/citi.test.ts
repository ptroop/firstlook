import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCitiConnector, parseCitiJob, parseCitiResultsPage } from './citi.ts';

const firstPage = readFileSync(new URL('../test-fixtures/citi-india-page-1.html', import.meta.url), 'utf8');
const secondPage = readFileSync(new URL('../test-fixtures/citi-india-page-2.html', import.meta.url), 'utf8');
const detailHtml = readFileSync(new URL('../test-fixtures/citi-model-analyst-c09.html', import.meta.url), 'utf8');
const catalogUrl = 'https://jobs.citi.com/location/india-jobs/287/1269750/2/1';

test('parses Citi result cards without opening detail pages', () => {
  const listings = parseCitiResultsPage(firstPage, catalogUrl);
  assert.equal(listings.length, 3);
  assert.deepEqual(listings.map((listing) => listing.sourceExternalId), ['101', '102', '103']);
  assert.equal(listings[0].title, 'Ops Sup Analyst 1 - C09 - CHENNAI');
  assert.equal(listings[0].location, 'Chennai, Tamil Nadu, India');
  assert.equal(listings[0].rawMetadata.workMode, 'On-Site/Resident');
  assert.equal(listings[0].category, null);
});

test('reconciliation inventories every advertised Citi India page', async () => {
  const requested: string[] = [];
  const connector = createCitiConnector(async (url) => {
    requested.push(url);
    return new Response(url.endsWith('/2') ? secondPage : firstPage, { status: 200 });
  }, 'citi-reconcile');
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 6);
  assert.equal(result.diagnostic.pagesExpected, 2);
  assert.equal(result.diagnostic.pagesFetched, 2);
  assert.equal(result.listings.length, 6);
  assert.deepEqual(requested, [catalogUrl, `${catalogUrl.slice(0, -1)}2`]);
});

test('watch fetches at most the newest five Citi pages', async () => {
  const requested: string[] = [];
  const connector = createCitiConnector(async (url) => {
    requested.push(url);
    const page = Number(url.match(/\/(\d+)\/?$/)?.[1] || 1);
    return new Response(generatedPage(page, 8, 120), { status: 200 });
  }, 'citi-watch');
  const result = await connector.enumerate({
    runType: 'watch', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 120);
  assert.equal(result.diagnostic.pagesExpected, 5);
  assert.equal(result.diagnostic.pagesFetched, 5);
  assert.equal(result.listings.length, 5);
  assert.equal(requested.length, 5);
  assert.ok(requested.every((url) => /\/2\/[1-5]$/.test(url)));
});

test('inventorying hundreds of Citi summaries never requests a detail URL', async () => {
  const requested: string[] = [];
  const connector = createCitiConnector(async (url) => {
    requested.push(url);
    const page = Number(url.match(/\/(\d+)\/?$/)?.[1] || 1);
    return new Response(generatedPage(page, 54, 800, page === 54 ? 5 : 15), { status: 200 });
  }, 'citi-reconcile');
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.listings.length, 800);
  assert.equal(requested.length, 54);
  assert.ok(requested.every((url) => url.includes('/location/india-jobs/')));
});

test('reconciles overlapping official category partitions when the root pagination duplicates jobs', async () => {
  const requested: string[] = [];
  const root = generatedPageWithIds(1, 2, 4, ['1']).replace(
    '</nav>',
    '</nav><section id="category-filters-section"><input class="filter-checkbox" data-id="19609" data-display="Finance"><input class="filter-checkbox" data-id="19624" data-display="Risk Management"></section>',
  );
  const connector = createCitiConnector(async (url) => {
    requested.push(url);
    if (url === catalogUrl) return new Response(root, { status: 200 });
    if (url.includes('/19609/')) return new Response(generatedPageWithIds(1, 1, 3, ['1', '2', '3']), { status: 200 });
    if (url.includes('/19624/')) return new Response(generatedPageWithIds(1, 1, 2, ['2', '4']), { status: 200 });
    return new Response('unexpected request', { status: 500 });
  }, 'citi-reconcile');

  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 4);
  assert.equal(result.diagnostic.pagesExpected, 3);
  assert.equal(result.diagnostic.pagesFetched, 3);
  assert.deepEqual(result.listings.map((listing) => listing.sourceExternalId).sort(), ['1', '2', '3', '4']);
  assert.deepEqual(requested.sort(), [
    catalogUrl,
    'https://jobs.citi.com/employment/india-finance-jobs/287/19609/1269750/2/1',
    'https://jobs.citi.com/employment/india-risk-management-jobs/287/19624/1269750/2/1',
  ].sort());
});

test('treats a Citi category without pagination controls as one complete page when its total matches its cards', async () => {
  const root = generatedPageWithIds(1, 2, 4, ['1']).replace(
    '</nav>',
    '</nav><section id="category-filters-section"><input class="filter-checkbox" data-id="19609" data-display="Finance"><input class="filter-checkbox" data-id="19624" data-display="Risk Management"></section>',
  );
  const connector = createCitiConnector(async (url) => {
    if (url === catalogUrl) return new Response(root, { status: 200 });
    if (url.includes('/19609/')) return new Response(generatedPageWithIds(1, 1, 2, ['1', '2']).replace(/<nav>[\s\S]*?<\/nav>/, ''), { status: 200 });
    if (url.includes('/19624/')) return new Response(generatedPageWithIds(1, 1, 2, ['3', '4']).replace(/<nav>[\s\S]*?<\/nav>/, ''), { status: 200 });
    return new Response('unexpected request', { status: 500 });
  }, 'citi-reconcile');

  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.pagesExpected, 3);
  assert.equal(result.diagnostic.pagesFetched, 3);
  assert.equal(result.listings.length, 4);
});

test('marks Citi reconciliation partial when a middle page fails', async () => {
  const connector = createCitiConnector(async (url) => {
    if (url.endsWith('/2')) return new Response('upstream error', { status: 503 });
    return new Response(generatedPage(1, 3, 3), { status: 200 });
  }, 'citi-reconcile');
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'partial');
  assert.equal(result.diagnostic.pagesExpected, 3);
  assert.equal(result.diagnostic.pagesFetched, 2);
  assert.match(result.diagnostic.errorSummaries.join(' '), /HTTP 503/);
});

test('marks Citi inventory partial when advertised result metadata is missing', async () => {
  const malformed = firstPage.replace('<h2>6 Jobs in India</h2>', '<h2>India opportunities</h2>');
  const connector = createCitiConnector(async () => new Response(malformed, { status: 200 }));
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 25, now: new Date('2026-08-03T00:00:00.000Z'),
  });
  assert.equal(result.diagnostic.status, 'partial');
  assert.match(result.diagnostic.errorSummaries.join(' '), /reported total/i);
});

test('hydrates Citi detail fields and the direct Workday Apply now URL', async () => {
  const listing = parseCitiResultsPage(secondPage, catalogUrl).find((item) => item.sourceExternalId === '105')!;
  const connector = createCitiConnector(async () => new Response(detailHtml, { status: 200 }));
  const observation = await connector.hydrate(listing, {
    runType: 'hydrate', detailBatchSize: 1, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(observation.employerJobId, '12345678');
  assert.equal(observation.location, 'Mumbai, Maharashtra, India');
  assert.equal(observation.jobCategory, 'Risk Management / Risk Analytics, Modeling, and Validation');
  assert.match(observation.experienceText, /0-2 years/);
  assert.equal(observation.postedAt, '2026-07-31T00:00:00.000Z');
  assert.equal(observation.applyUrl, 'https://citi.wd5.myworkdayjobs.com/2/job/MUMBAI-MAHARASHTRA/Model-Analyst_12345678/apply');
});

test('accepts the current Citi Location(s) detail heading', () => {
  const currentDetail = detailHtml.replace('<h2>Location:</h2>', '<h2>Location(s):</h2>');
  const observation = parseCitiJob(currentDetail, 'https://jobs.citi.com/job/mumbai/model-analyst/287/105');

  assert.equal(observation.location, 'Mumbai, Maharashtra, India');
});

test('hydrates Citi from its official JobPosting data and data-apply-url when visible detail fields are absent', () => {
  const structuredDetail = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Finance Analyst',
    identifier: '26976496',
    datePosted: '2026-7-30',
    description: '<p>0-2 years of relevant finance experience.</p>',
    jobLocation: [{ address: { addressLocality: 'Chennai', addressRegion: 'Tamil Nadu', addressCountry: 'India' } }],
  })}</script><a data-apply-url="https://citi.wd5.myworkdayjobs.com/2/job/CHENNAI/Finance-Analyst_26976496/apply" href="#">Apply</a>`;

  const observation = parseCitiJob(structuredDetail, 'https://jobs.citi.com/job/chennai/finance-analyst/287/98525945984');

  assert.equal(observation.employerJobId, '26976496');
  assert.equal(observation.title, 'Finance Analyst');
  assert.equal(observation.location, 'Chennai, Tamil Nadu, India');
  assert.equal(observation.experienceText, '0-2 years of relevant finance experience.');
  assert.equal(observation.description, '0-2 years of relevant finance experience.');
  assert.equal(observation.postedAt, '2026-07-30T00:00:00.000Z');
  assert.equal(observation.applyUrl, 'https://citi.wd5.myworkdayjobs.com/2/job/CHENNAI/Finance-Analyst_26976496/apply');
});

test('rejects a Citi detail page without a direct official apply destination', () => {
  assert.throws(
    () => parseCitiJob(detailHtml.replace(/<a class="apply"[\s\S]*?<\/a>/, ''), 'https://jobs.citi.com/job/mumbai/model-analyst/287/105'),
    /required Citi job fields/,
  );
});

function generatedPage(page: number, pages: number, reportedTotal: number, cards = 1): string {
  const ids = Array.from({ length: cards }, (_, index) => String((page - 1) * 15 + index + 1));
  return generatedPageWithIds(page, pages, reportedTotal, ids);
}

function generatedPageWithIds(page: number, pages: number, reportedTotal: number, ids: string[]): string {
  const items = ids.map((id) => {
    return `<li class="sr-job-item"><span class="sr-job-type">Hybrid</span><a class="sr-job-item__link" href="/job/mumbai/analyst/287/${id}" data-job-id="${id}">Analyst ${id}</a><span class="sr-job-location">Mumbai, India</span></li>`;
  }).join('');
  return `<h2>${reportedTotal} Jobs in India</h2><ul>${items}</ul><nav>Currently on page ${page} / ${pages}</nav>`;
}
