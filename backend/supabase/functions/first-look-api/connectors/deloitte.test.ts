import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeloitteConnector } from './deloitte.ts';

test('enumerates Deloitte SuccessFactors rows and hydrates the direct Apply now URL', async () => {
  const search = `<table><tr class="data-row"><td><a class="jobTitle-link" href="/job/Mumbai-Finance-Analyst/55426244/">Finance Analyst</a></td><td><span class="jobLocation">Mumbai, IN</span></td><td><span class="jobDate">Aug 5, 2026</span></td></tr></table><div aria-label="Search results Page 1 Results 1 to 1 of 1"></div>`;
  const detail = `<meta itemprop="streetAddress" content="Mumbai, IN"><meta itemprop="datePosted" content="Wed Aug 05 02:00:00 UTC 2026"><span itemprop="title">Finance Analyst</span><span itemprop="description" data-careersite-propertyid="description"><span class="jobdescription"><p>Prepare financial reporting. 0-2 years experience.</p></span></span><a class="btn apply dialogApplyBtn" href="/talentcommunity/apply/55426244/?locale=en_US">Apply now</a>`;
  const connector = createDeloitteConnector(async (input) => new Response(String(input).includes('/job/') ? detail : search), 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'complete');
  const observation = await connector.hydrate(result.listings[0], { runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(observation.applyUrl, 'https://southasiacareers.deloitte.com/talentcommunity/apply/55426244/?locale=en_US');
  assert.match(observation.description, /financial reporting/i);
});
