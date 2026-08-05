import assert from 'node:assert/strict';
import test from 'node:test';

import { createSiemensConnector } from './siemens.ts';

test('enumerates Siemens Avature India rows and hydrates the direct application URL', async () => {
  const search = `<article class="article article--result"><h3><a href="https://jobs.siemens.com/en_US/externaljobs/JobDetail/513315">Finance Operations Analyst</a></h3><span class="list-item-location"><span class="list-item-jobCity">Chennai</span>, <span class="list-item-jobCountry">India</span></span><span class="list-item-family">Finance</span></article>`;
  const detail = `<meta property="og:title" content="Finance Operations Analyst"><article class="article article--details "><div class="article__content" id="section0__content"><div class="article__content__view__field tf_locations"><div class="article__content__view__field__value"><ul><li>Chennai - Tamil Nadu - India</li></ul></div></div><div class="article__content__view__field"><div class="article__content__view__field__label">Posted since</div><div class="article__content__view__field__value">05-Aug-2026</div></div></div></article><article class="article article--details "><div class="article__content__view__field__value"><p>Support financial operations and reconciliation. 0-2 years experience.</p></div></article><a class="button button--hero" href="https://jobs.siemens.com/en_US/externaljobs/ApplicationMethods?folderId=513315">Apply</a>`;
  const connector = createSiemensConnector(async (input) => new Response(String(input).includes('/JobDetail/') ? detail : search), 'watch');
  const result = await connector.enumerate({ runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(result.diagnostic.status, 'complete');
  const observation = await connector.hydrate(result.listings[0], { runType: 'watch', detailBatchSize: 10, now: new Date() });
  assert.equal(observation.applyUrl, 'https://jobs.siemens.com/en_US/externaljobs/ApplicationMethods?folderId=513315');
  assert.match(observation.description, /financial operations/i);
});
