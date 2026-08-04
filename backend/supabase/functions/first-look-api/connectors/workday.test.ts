// backend/supabase/functions/first-look-api/connectors/workday.test.ts
import assert from 'node:assert/strict';
import { createWorkdayConnector } from './workday.ts';
import type { InventoryListing } from '../types.ts';

const DUMMY_CONFIG = {
  companyName: 'Dummy Co',
  baseUrl: 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers',
  connectorIdPrefix: 'dummy',
};

const SAMPLE_LIST = {
  jobPostings: [
    { title: 'Engineer', externalPath: '/job/123', locationsText: 'Bengaluru, India' },
    { title: 'Manager', externalPath: '/job/456', locationsText: 'London, UK' }
  ]
};

// node test runner doesn't use Deno.test. Since this file is run with tsx --test, it should use node:test
import { test } from 'node:test';

test('createWorkdayConnector - enumerate', async () => {
  const fetcher = async (url: string) => {
    if (url.includes('search')) {
      return new Response(JSON.stringify(SAMPLE_LIST), { status: 200 });
    }
    return new Response('', { status: 404 });
  };
  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher as any, 'watch');
  const result = await connector.enumerate({ runType: 'watch', connectorId: 'dummy-official-india' });
  
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].sourceExternalId, '/job/123');
  assert.equal(result.diagnostic.status, 'complete');
});
