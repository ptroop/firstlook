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
  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher as unknown as typeof fetch, 'watch');
  const result = await connector.enumerate({ runType: 'watch', connectorId: 'dummy-official-india' });
  
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].sourceExternalId, '/job/123');
  assert.equal(result.diagnostic.status, 'complete');
});

test('createWorkdayConnector - hydrate', async () => {
  const fetcher = async (url: string) => {
    if (url.includes('/job/123')) {
      return new Response(JSON.stringify({
        jobPostingInfo: {
          jobDescription: 'Great job!',
          reqId: 'REQ-123'
        }
      }), { status: 200 });
    }
    return new Response('', { status: 404 });
  };
  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher as unknown as typeof fetch, 'watch');
  const result = await connector.hydrate({
    connectorId: 'dummy-official-india',
    sourceExternalId: '/job/123',
    company: 'Dummy Co',
    title: 'Engineer',
    location: 'Bengaluru, India',
    category: null,
    department: null,
    detailUrl: 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/123',
    listingMetadataHash: 'hash',
    rawMetadata: {}
  });

  assert.equal(result.title, 'Engineer');
  assert.equal(result.employerJobId, 'REQ-123');
  assert.equal(result.description, 'Great job!');
  assert.equal(result.location, 'Bengaluru, India');
  assert.equal(result.applyUrl, 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/123/apply');
});

test('createWorkdayConnector - hydrate handles missing fields safely', async () => {
  const fetcher = async (url: string) => {
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const connector = createWorkdayConnector(DUMMY_CONFIG, fetcher as unknown as typeof fetch, 'watch');
  const result = await connector.hydrate({
    connectorId: 'dummy-official-india',
    sourceExternalId: '/job/456',
    company: 'Dummy Co',
    title: 'Manager',
    location: 'London, UK',
    category: null,
    department: null,
    detailUrl: 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/456',
    listingMetadataHash: 'hash',
    rawMetadata: {}
  });

  assert.equal(result.title, 'Manager');
  assert.equal(result.employerJobId, '/job/456');
  assert.equal(result.description, '');
  assert.equal(result.location, 'London, UK');
  assert.equal(result.applyUrl, 'https://dummy.wd3.myworkdayjobs.com/Dummy_Careers/job/456/apply');
});
