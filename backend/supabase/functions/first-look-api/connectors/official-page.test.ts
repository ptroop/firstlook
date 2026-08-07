import assert from 'node:assert/strict';
import test from 'node:test';

import { createOfficialPageConnector } from './official-page.ts';

const config = {
  companyName: 'Example Finance',
  connectorIdPrefix: 'example-finance',
  careerSearchUrl: 'https://careers.example.com/india/jobs',
};

const searchPage = `
<script type="application/ld+json">[
  {"@type":"JobPosting","title":"Finance Analyst","url":"https://careers.example.com/india/jobs/123","jobLocation":{"address":{"addressLocality":"Mumbai","addressCountry":"IN"}}},
  {"@type":"JobPosting","title":"Software Engineer","url":"https://careers.example.com/jobs/999","jobLocation":{"address":{"addressLocality":"New York","addressCountry":"US"}}}
]</script>
<a href="/india/jobs/456"><span>Investment Operations Associate</span></a> Mumbai, India
`;

const detailPage = `
<script type="application/ld+json">{
  "@type":"JobPosting",
  "title":"Finance Analyst",
  "url":"https://careers.example.com/india/jobs/123",
  "description":"Support financial reporting and reconciliation. 0-2 years of experience.",
  "jobLocation":{"address":{"addressLocality":"Mumbai","addressCountry":"IN"}},
  "datePosted":"2026-08-01"
}</script>
<a href="https://apply.example.com/123">Apply now</a>
`;

test('discovers India JobPosting JSON-LD and role links without Firecrawl', async () => {
  const fetcher = async (url: string) => {
    if (url === config.careerSearchUrl) return new Response(searchPage, { status: 200 });
    if (url.endsWith('/123')) return new Response(detailPage, { status: 200 });
    if (url.endsWith('/456')) return new Response(detailPage.replace('Finance Analyst', 'Investment Operations Associate'), { status: 200 });
    return new Response('missing', { status: 404 });
  };
  const connector = createOfficialPageConnector(config, fetcher, 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.listings.length, 2);
  assert.deepEqual(result.listings.map((listing) => listing.title), ['Finance Analyst', 'Investment Operations Associate']);
  assert.equal(result.listings.every((listing) => /India|Mumbai/i.test(listing.location || '')), true);

  const hydrated = await connector.hydrate(result.listings[0], { runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(hydrated.applyUrl, 'https://apply.example.com/123');
  assert.match(hydrated.description, /financial reporting/);
  assert.match(hydrated.experienceText, /0-2 years/i);
});

test('does not promote an official detail page without a role-level Apply URL', async () => {
  const fetcher = async (url: string) => new Response(url === config.careerSearchUrl
    ? searchPage
    : detailPage.replace('https://apply.example.com/123', 'https://careers.example.com/india/jobs'), { status: 200 });
  const connector = createOfficialPageConnector(config, fetcher, 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  await assert.rejects(connector.hydrate(result.listings[0], { runType: 'watch', detailBatchSize: 10, now: new Date() }), /direct Apply URL/i);
});
