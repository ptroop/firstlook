import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HSBC_AVATURE_CONFIG,
  ICRA_NATIVE_CONFIG,
  MICROSOFT_NATIVE_CONFIG,
  parseAvatureResults,
  parseIcraListing,
  parseMicrosoftListings,
} from './public-ats.ts';
import { PINE_LABS_TURBOHIRE_CONFIG, parseTurboHireResponse } from './turbohire.ts';

test('parses all India Avature rows and keeps role-level detail URLs', () => {
  const html = `
    <article class="article--item">
      <a href="/en_GB/external/PipelineDetail/Analyst/288674"><span>Analyst, Finance</span></a>
      <div class="article--item item--location">Mumbai, India</div>
    </article>`;
  const listings = parseAvatureResults(html, HSBC_AVATURE_CONFIG);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].sourceExternalId, '288674');
  assert.equal(listings[0].location, 'Mumbai, India');
  assert.equal(listings[0].detailUrl, 'https://mycareer.hsbc.com/en_GB/external/PipelineDetail/Analyst/288674');
});

test('turns an ICRA official position page into an inventory row', () => {
  const html = `
    <h1>Business Development</h1>
    <h3>Job Description</h3>
    <div>Build client relationships and support credit research in India.</div>
    <h3>Submit Your Application</h3>`;
  const listing = parseIcraListing(html, ICRA_NATIVE_CONFIG.positionUrls[0], ICRA_NATIVE_CONFIG);
  assert.equal(listing?.sourceExternalId, '1');
  assert.equal(listing?.title, 'Business Development');
  assert.equal(listing?.location, 'India');
});

test('extracts Microsoft Eightfold role links without Firecrawl', () => {
  const html = `<a href="https://apply.careers.microsoft.com/careers/job/1970393556958423?hl=en">Finance Analyst</a>`;
  const listings = parseMicrosoftListings(html, MICROSOFT_NATIVE_CONFIG);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].sourceExternalId, '1970393556958423');
  assert.equal(listings[0].title, 'Finance Analyst');
  assert.equal(listings[0].location, 'India');
});

test('parses Pine Labs TurboHire pages and preserves direct public apply URLs', () => {
  const result = parseTurboHireResponse({
    Jobs: [{
      JobId: 'pine-42',
      JobTitle: 'Finance Analyst',
      Department: 'Finance',
      Location: '[{"Address":"Bengaluru, India"}]',
      ApplyUrl: 'https://pinelabsgroup.turbohire.co/job/publicjobs/pine-42',
    }],
    Total: 1,
  }, PINE_LABS_TURBOHIRE_CONFIG);
  assert.equal(result.total, 1);
  assert.equal(result.jobs[0].JobId, 'pine-42');
  assert.match(String(result.jobs[0].ApplyUrl), /turbohire\.co\/job\/publicjobs\/pine-42/);
});
