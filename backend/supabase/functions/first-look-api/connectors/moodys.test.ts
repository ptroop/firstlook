import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  discoverMoodysJobUrls,
  discoverMoodysPages,
  parseMoodysJob,
  runMoodysConnector
} from './moodys.ts';

const searchHtml = readFileSync(new URL('../test-fixtures/moodys-india-page.html', import.meta.url), 'utf8');
const detailHtml = readFileSync(new URL('../test-fixtures/moodys-senior-financial-data-analyst.html', import.meta.url), 'utf8');
const baseUrl = 'https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/1';

test('discovers all Moody’s India result pages', () => {
  assert.deepEqual(discoverMoodysPages(searchHtml, baseUrl), [
    'https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/1',
    'https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/2'
  ]);
});

test('discovers only jobs from the search results list', () => {
  assert.deepEqual(discoverMoodysJobUrls(searchHtml, baseUrl), [
    'https://careers.moodys.com/en/job/bengaluru/senior-financial-data-analyst/49841/98452084112',
    'https://careers.moodys.com/en/job/bengaluru/senior-data-engineer/49841/96475569408'
  ]);
});

test('parses the current 0-2 year Moody’s role and its direct apply URL', () => {
  assert.deepEqual(parseMoodysJob(detailHtml, 'https://careers.moodys.com/en/job/bengaluru/senior-financial-data-analyst/49841/98452084112'), {
    id: 'moodys_13927',
    employerJobId: '13927',
    company: "Moody's",
    sourceUrl: 'https://careers.moodys.com/en/job/bengaluru/senior-financial-data-analyst/49841/98452084112',
    applyUrl: 'https://career8.successfactors.com/sfcareer/jobreqcareer?jobId=13927&company=MoodysProd',
    title: 'Senior Financial Data Analyst',
    location: 'Bengaluru, India',
    description: 'Skills and Competencies 0-2 years’ experience in credit/financial data analysis and interpretation with knowledge of capital markets. Education Masters’ degree in Accounting, Finance, Economics or qualified CA.',
    experienceText: '0-2 years’ experience in credit/financial data analysis and interpretation with knowledge of capital markets.',
    jobCategory: 'Credit Analysis & Research',
    postedAt: '2026-07-29T00:00:00.000Z'
  });
});

test('crawls pages, classifies details, and reports exclusions', async () => {
  const secondPage = '<ul id="search-results-jobs"></ul>';
  const technologyDetail = detailHtml
    .replaceAll('13927', '14000')
    .replace('98452084112', '96475569408')
    .replace('Senior Financial Data Analyst', 'Senior Data Engineer')
    .replace('Credit Analysis &amp; Research', 'Technology')
    .replace(/<div class="ats-description">[\s\S]*?<\/div>/, '<div class="ats-description"><p>Build Java systems. Minimum 3 years experience.</p></div>');

  const fetcher = async (url: string) => {
    if (url.endsWith('/2/1')) return new Response(searchHtml, { status: 200 });
    if (url.endsWith('/2/2')) return new Response(secondPage, { status: 200 });
    if (url.includes('senior-financial-data-analyst')) return new Response(detailHtml, { status: 200 });
    if (url.includes('senior-data-engineer')) return new Response(technologyDetail, { status: 200 });
    return new Response('not found', { status: 404 });
  };

  const result = await runMoodysConnector(fetcher);
  assert.equal(result.diagnostic.status, 'success');
  assert.equal(result.diagnostic.discoveredCount, 2);
  assert.equal(result.diagnostic.fetchedCount, 2);
  assert.equal(result.diagnostic.matchingCount, 1);
  assert.deepEqual(result.diagnostic.excluded, { not_finance: 1 });
  assert.equal(result.jobs[0]?.employerJobId, '13927');
});

test('does not report success when result markup yields fewer jobs than advertised', async () => {
  const changedMarkup = '<p>37 jobs found in India</p><ul id="search-results-jobs"></ul>';
  const result = await runMoodysConnector(async () => new Response(changedMarkup, { status: 200 }));
  assert.equal(result.diagnostic.status, 'partial');
  assert.equal(result.diagnostic.discoveredCount, 0);
});
