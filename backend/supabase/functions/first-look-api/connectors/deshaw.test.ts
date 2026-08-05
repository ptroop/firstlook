import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDeshawConnector, parseDeshawCatalog, parseDeshawJob } from './deshaw.ts';

const catalogHtml = readFileSync(new URL('../test-fixtures/deshaw-careers.html', import.meta.url), 'utf8');
const detailHtml = readFileSync(new URL('../test-fixtures/deshaw-financial-operations.html', import.meta.url), 'utf8');
const catalogUrl = 'https://www.deshawindia.com/careers/work-with-us';

test('parses every server-rendered D. E. Shaw job summary and stable ID', () => {
  const listings = parseDeshawCatalog(catalogHtml, catalogUrl);
  assert.equal(listings.length, 6);
  assert.deepEqual(listings.map((listing) => listing.sourceExternalId), ['6778', '6968', '7074', '6759', '6734', '6989']);
  assert.equal(listings[2].category, 'Financial Operations');
  assert.equal(listings[2].location, 'Hyderabad / Bengaluru / Gurugram, India');
});

test('deduplicates repeated category appearances without losing known finance roles', () => {
  const duplicated = catalogHtml.replace('</div>\n', `${catalogHtml.match(/<div class="job" data-job-id="7074">[\s\S]*?<\/div><\/div>/)?.[0] ?? ''}</div>\n`);
  const listings = parseDeshawCatalog(duplicated, catalogUrl);
  const ids = listings.map((listing) => listing.sourceExternalId);
  assert.equal(ids.filter((id) => id === '7074').length, 1);
  for (const id of ['6778', '6968', '7074', '6759', '6734']) assert.ok(ids.includes(id), id);
});

test('reconciles the complete catalog from one official request', async () => {
  const requested: string[] = [];
  const connector = createDeshawConnector(async (url) => {
    requested.push(url);
    return new Response(catalogHtml, { status: 200 });
  });
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 6);
  assert.equal(result.diagnostic.pagesExpected, 1);
  assert.equal(result.diagnostic.pagesFetched, 1);
  assert.equal(result.listings.length, 6);
  assert.deepEqual(requested, [catalogUrl]);
});

test('marks the catalog partial when malformed cards break the reported count', async () => {
  const malformed = catalogHtml.replace('data-job-id="6989"', 'data-missing-job-id="6989"');
  const connector = createDeshawConnector(async () => new Response(malformed, { status: 200 }));
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });
  assert.equal(result.diagnostic.status, 'partial');
  assert.match(result.diagnostic.errorSummaries[0], /reported 6.*discovered 5/i);
});

test('treats the successfully parsed single-page catalog as complete when the page omits a total', async () => {
  const withoutTotal = catalogHtml.replace(/Viewing\s+6\s+of\s+6\s+Jobs/i, 'Open positions');
  const connector = createDeshawConnector(async () => new Response(withoutTotal, { status: 200 }));
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'complete');
  assert.equal(result.diagnostic.reportedTotal, 6);
  assert.deepEqual(result.diagnostic.errorSummaries, []);
});

test('still marks a no-total catalog partial when a visible card cannot be parsed', async () => {
  const malformed = catalogHtml
    .replace(/Viewing\s+6\s+of\s+6\s+Jobs/i, 'Open positions')
    .replace('data-job-id="6989"', 'data-missing-job-id="6989"');
  const connector = createDeshawConnector(async () => new Response(malformed, { status: 200 }));
  const result = await connector.enumerate({
    runType: 'reconcile', detailBatchSize: 10, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.diagnostic.status, 'partial');
  assert.equal(result.diagnostic.reportedTotal, 6);
  assert.match(result.diagnostic.errorSummaries[0], /6 job cards.*discovered 5/i);
});

test('hydrates the official detail, experience wording, and Apply Now URL', async () => {
  const listing = parseDeshawCatalog(catalogHtml, catalogUrl).find((item) => item.sourceExternalId === '7074')!;
  const connector = createDeshawConnector(async () => new Response(detailHtml, { status: 200 }));
  const result = await connector.hydrate(listing, {
    runType: 'hydrate', detailBatchSize: 1, now: new Date('2026-08-03T00:00:00.000Z'),
  });

  assert.equal(result.title, 'Analyst - Financial Operations');
  assert.equal(result.jobCategory, 'Financial Operations');
  assert.equal(result.location, 'Hyderabad, Bengaluru or Gurugram, India');
  assert.match(result.experienceText, /0 to 1 year/);
  assert.equal(result.applyUrl, 'https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS');
});

test('preserves a role-specific official recruit redirect when the detail exposes one', () => {
  const roleSpecific = detailHtml.replace(
    'https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS',
    'https://www.deshawindia.com/recruit/jobs/Adv/Link/AnlPricFinOpJul25',
  );
  assert.equal(
    parseDeshawJob(roleSpecific, 'https://www.deshawindia.com/careers/senior-analyst-manager-pricing-financial-operations-6759').applyUrl,
    'https://www.deshawindia.com/recruit/jobs/Adv/Link/AnlPricFinOpJul25',
  );
});

test('prefers a role-specific recruit URL over the shared application bundle', () => {
  const roleSpecific = detailHtml.replace(
    'https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS',
    'https://www.deshawindia.com/recruit/jobs/Ads/Link/ContVDAug26',
  );
  assert.equal(
    parseDeshawJob(roleSpecific, 'https://www.deshawindia.com/careers/contractor-visual-designer-design-and-user-experience-7199').applyUrl,
    'https://www.deshawindia.com/recruit/jobs/Ads/Link/ContVDAug26',
  );
});

test('hydrates the exploratory application template from JobPosting JSON-LD', () => {
  const exploratory = `
    <a href="https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS">Apply Now</a>
    <header class="JobDescription_header__current">
      <h1>All positions in Financial Operations</h1>
      <h2>Financial Operations<br>Hyderabad, Bengaluru or Gurugram</h2>
    </header>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'All positions in Financial Operations',
      occupationalCategory: 'Financial Operations',
      description: 'If you would like the group to consider your candidacy without specifying a role, we invite you to submit a general, exploratory application here.',
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress' } },
    })}</script>`;

  assert.deepEqual(parseDeshawJob(
    exploratory,
    'https://www.deshawindia.com/careers/all-positions-in-financial-operations-2781',
  ), {
    employerJobId: '2781',
    title: 'All positions in Financial Operations',
    location: 'Hyderabad, Bengaluru or Gurugram, India',
    description: 'If you would like the group to consider your candidacy without specifying a role, we invite you to submit a general, exploratory application here.',
    experienceText: '',
    jobCategory: 'Financial Operations',
    applyUrl: 'https://www.apply.deshawindia.com/ApplicationPage1.html?entity=DESIS',
  });
});
