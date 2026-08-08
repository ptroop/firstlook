// Live smoke test for the new connectors (run with npx tsx).
import { createYelloConnector, EY_GDS_YELLO_CONFIG } from '../supabase/functions/first-look-api/connectors/yello.ts';
import { createLeverConnector, CRED_LEVER_CONFIG } from '../supabase/functions/first-look-api/connectors/lever.ts';

(async () => {
  const request = { runType: 'watch', detailBatchSize: 10, now: new Date() };

  const ey = createYelloConnector(EY_GDS_YELLO_CONFIG, fetch, 'watch', 'ey-gds-watch');
  const eyR = await ey.enumerate(request);
  console.log('EY GDS Yello:', eyR.diagnostic.status, '| listings:', eyR.listings.length, '| errors:', eyR.diagnostic.errorSummaries.slice(0, 2));
  if (eyR.listings[0]) {
    const h = await ey.hydrate(eyR.listings[0], request);
    console.log('  sample:', h.title.slice(0, 50), '|', h.location, '| apply:', h.applyUrl.slice(0, 60));
  }

  const cred = createLeverConnector(CRED_LEVER_CONFIG, fetch, 'cred-watch');
  const credR = await cred.enumerate(request);
  console.log('CRED Lever:', credR.diagnostic.status, '| listings:', credR.listings.length);
  if (credR.listings[0]) {
    const h = await cred.hydrate(credR.listings[0], request);
    console.log('  sample:', h.title.slice(0, 50), '|', h.location, '| apply:', h.applyUrl.slice(0, 60));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
