import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert';
import { createOracleConnector, KPMG_CONFIG } from './oracle.ts';
import type { InventoryListing } from '../types.ts';

const SAMPLE_LIST = {
  items: [
    {
      Id: "INTG10044604",
      Title: "TPRM-Advisory Services",
      PrimaryLocation: "Mumbai, Maharashtra, India",
      Category: "Consulting"
    },
    {
      Id: "INTG10045281",
      Title: "Assistant Manager - Financial Services",
      PrimaryLocation: "Bangalore, Karnataka, India",
    },
    {
      Id: "UKG1001",
      Title: "Tax Manager",
      PrimaryLocation: "London, UK",
    }
  ]
};

const SAMPLE_DETAIL = {
  items: [
    {
      Id: "INTG10044604",
      Title: "TPRM-Advisory Services",
      PostedDate: "2026-07-21",
      PrimaryLocation: "Mumbai, Maharashtra, India",
      PrimaryLocationCountry: "IN",
      ExternalQualificationsStr: "BE",
      ShortDescriptionStr: "Short desc",
      CorporateDescriptionStr: "Corp desc",
      Category: "Consulting"
    }
  ]
};

Deno.test('createOracleConnector - enumerate', async () => {
  const fetcher = async (url: string) => {
    if (url.includes('limit=25')) {
      return new Response(JSON.stringify(SAMPLE_LIST), { status: 200 });
    }
    return new Response('', { status: 404 });
  };

  const connector = createOracleConnector(KPMG_CONFIG, fetcher);
  const result = await connector.enumerate({ runType: 'watch', connectorId: 'kpmg-official-india' });

  // Should only include India listings
  assertEquals(result.listings.length, 2);
  assertEquals(result.listings[0].sourceExternalId, 'INTG10044604');
  assertEquals(result.listings[1].sourceExternalId, 'INTG10045281');
  assertEquals(result.diagnostic.status, 'complete');
});

Deno.test('createOracleConnector - hydrate', async () => {
  const fetcher = async (url: string) => {
    if (url.includes('ById;Id="%22INTG10044604%22"')) {
      return new Response(JSON.stringify(SAMPLE_DETAIL), { status: 200 });
    }
    return new Response('', { status: 404 });
  };

  const connector = createOracleConnector(KPMG_CONFIG, fetcher);
  const listing: InventoryListing = {
    connectorId: 'kpmg-official-india',
    sourceExternalId: 'INTG10044604',
    company: 'KPMG India',
    title: 'TPRM-Advisory Services',
    location: 'Mumbai, Maharashtra, India',
    category: 'Consulting',
    department: null,
    detailUrl: 'https://ejgk.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/INTG10044604',
    listingMetadataHash: 'abcd',
    rawMetadata: {}
  };

  const job = await connector.hydrate(listing);
  assertEquals(job.title, 'TPRM-Advisory Services');
  assertEquals(job.employerJobId, 'INTG10044604');
  assertStringIncludes(job.description, 'Corp desc');
  assertStringIncludes(job.description, 'Short desc');
  assertStringIncludes(job.description, 'BE');
  assertEquals(job.location, 'Mumbai, Maharashtra, India');
  assertEquals(job.applyUrl, 'https://ejgk.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/INTG10044604/apply');
});

Deno.test('createOracleConnector - enumerate empty', async () => {
  const fetcher = async (url: string) => {
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };

  const connector = createOracleConnector(KPMG_CONFIG, fetcher);
  const result = await connector.enumerate({ runType: 'watch', connectorId: 'kpmg-official-india' });

  assertEquals(result.listings.length, 0);
  assertEquals(result.diagnostic.status, 'complete');
});
