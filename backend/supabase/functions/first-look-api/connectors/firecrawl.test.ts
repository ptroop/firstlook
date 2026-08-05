import test from 'node:test';
import assert from 'node:assert';
import { createFirecrawlConnector, AMAZON_CONFIG } from './firecrawl.ts';

test('Firecrawl connector', async (t) => {
  const dummyRequest = {
    runType: 'watch' as const,
    detailBatchSize: 10,
    now: new Date(),
  };

  await t.test('enumerate filters for India and extracts correctly', async () => {
    const mockFetcher = async (url: string, init?: RequestInit) => {
      const responseBody = {
        success: true,
        data: {
          markdown: "## Jobs\n\n[Software Engineer](https://example.com/job/123) - Bangalore, India\n\n[Product Manager](https://example.com/job/456) - New York, US"
        }
      };
      return new Response(JSON.stringify(responseBody), { status: 200 });
    };

    const connector = createFirecrawlConnector(AMAZON_CONFIG, 'dummy-key', 'watch', mockFetcher);
    const result = await connector.enumerate(dummyRequest);

    assert.strictEqual(result.listings.length, 1);
    assert.strictEqual(result.listings[0].title, 'Software Engineer');
    assert.strictEqual(result.listings[0].location, 'Bangalore');
    assert.strictEqual(result.listings[0].detailUrl, 'https://example.com/job/123');
  });

  await t.test('hydrate scrapes detail page', async () => {
    const mockFetcher = async (url: string, init?: RequestInit) => {
      const responseBody = {
        success: true,
        data: {
          markdown: "# Software Engineer\n\nJob details here.\n\n[Apply now](https://example.com/job/123/apply)"
        }
      };
      return new Response(JSON.stringify(responseBody), { status: 200 });
    };

    const connector = createFirecrawlConnector(AMAZON_CONFIG, 'dummy-key', 'watch', mockFetcher);
    const listing = {
      connectorId: 'amazon-firecrawl-india',
      sourceExternalId: '/job/123',
      company: 'Amazon',
      title: 'Software Engineer',
      location: 'Bangalore',
      category: null,
      department: null,
      detailUrl: 'https://example.com/job/123',
      listingMetadataHash: 'hash',
      rawMetadata: {},
    };
    
    const result = await connector.hydrate(listing, dummyRequest);
    
    assert.strictEqual(result.title, 'Software Engineer');
    assert.match(result.description, /Job details here/);
    assert.strictEqual(result.applyUrl, 'https://example.com/job/123/apply');
  });

  await t.test('marks a successful scrape with no role links anomalous', async () => {
    const mockFetcher = async () => new Response(JSON.stringify({ success: true, data: { markdown: '# Careers\n\nNo current roles.' } }), { status: 200 });
    const connector = createFirecrawlConnector(AMAZON_CONFIG, 'dummy-key', 'watch', mockFetcher);
    const result = await connector.enumerate(dummyRequest);
    assert.equal(result.diagnostic.status, 'anomalous');
    assert.match(result.diagnostic.errorSummaries[0], /no India job links/i);
  });

  await t.test('throws error on Firecrawl API failure', async () => {
    const mockFetcher = async (url: string, init?: RequestInit) => {
      return new Response('Internal Server Error', { status: 500 });
    };

    const connector = createFirecrawlConnector(AMAZON_CONFIG, 'dummy-key', 'watch', mockFetcher);
    await assert.rejects(
      connector.enumerate(dummyRequest),
      /Firecrawl API error: 500/
    );
  });
});
