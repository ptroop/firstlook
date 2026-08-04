import type { HydratedSourceObservation, InventoryListing, JobFetch, ConnectorRunRequest } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export interface FirecrawlConfig {
  companyName: string;
  connectorIdPrefix: string;
  careerSearchUrl: string;
  jobUrlPattern?: RegExp;
}

export const AMAZON_CONFIG: FirecrawlConfig = {
  companyName: 'Amazon',
  connectorIdPrefix: 'amazon',
  careerSearchUrl: 'https://www.amazon.jobs/en/search?base_query=&loc_query=India',
};
export const MICROSOFT_CONFIG: FirecrawlConfig = {
  companyName: 'Microsoft',
  connectorIdPrefix: 'microsoft',
  careerSearchUrl: 'https://careers.microsoft.com/global/en/search?l=India&pg=1',
};
export const DELOITTE_CONFIG: FirecrawlConfig = {
  companyName: 'Deloitte',
  connectorIdPrefix: 'deloitte',
  careerSearchUrl: 'https://apply.deloitte.com/careers/SearchJobs/?3_56_3=210',
};
export const HSBC_CONFIG: FirecrawlConfig = {
  companyName: 'HSBC',
  connectorIdPrefix: 'hsbc',
  careerSearchUrl: 'https://mycareer.hsbc.com/en_GB/external/searchResults?country=India',
};
export const PIRAMAL_CONFIG: FirecrawlConfig = {
  companyName: 'Piramal Finance',
  connectorIdPrefix: 'piramal',
  careerSearchUrl: 'https://www.piramalfinance.com/careers',
};
export const PINE_LABS_CONFIG: FirecrawlConfig = {
  companyName: 'Pine Labs',
  connectorIdPrefix: 'pine-labs',
  careerSearchUrl: 'https://www.pinelabs.com/careers',
};
export const ICRA_CONFIG: FirecrawlConfig = {
  companyName: 'ICRA',
  connectorIdPrefix: 'icra',
  careerSearchUrl: 'https://www.icra.in/Home/Careers',
};

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 8_000_000;

export function createFirecrawlConnector(
  config: FirecrawlConfig,
  firecrawlApiKey: string,
  runType: 'watch' | 'reconcile',
  fetcher: JobFetch = fetch
): OfficialJobConnector {
  const connectorId = `${config.connectorIdPrefix}-firecrawl-india`;
  const scanGroup = `${connectorId}-${runType}`;

  return {
    connectorId,
    connectorVersion: 'firecrawl-v1',
    company: config.companyName,
    scanGroup,
    async enumerate(_request: ConnectorRunRequest) {
      const markdown = await scrapeUrl(config.careerSearchUrl, firecrawlApiKey, fetcher);
      const listings = extractListingsFromMarkdown(markdown, config, connectorId);
      
      return {
        listings,
        diagnostic: {
          status: 'complete',
          reportedTotal: listings.length,
          pagesExpected: 1,
          pagesFetched: 1,
          errorSummaries: [],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing, _request: ConnectorRunRequest) {
      if (!listing.detailUrl) {
        throw new Error(`Missing detailUrl for ${listing.sourceExternalId}`);
      }
      
      const markdown = await scrapeUrl(listing.detailUrl, firecrawlApiKey, fetcher);
      
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: listing.detailUrl,
        isOfficial: true,
        title: listing.title,
        location: listing.location || 'India',
        description: markdown.trim(),
        experienceText: '',
        jobCategory: '',
        postedAt: null,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${listing.title}\u0000${listing.location}\u0000${markdown}`),
        rawMetadata: {},
      } satisfies HydratedSourceObservation;
    },
  };
}

async function scrapeUrl(url: string, apiKey: string, fetcher: JobFetch): Promise<string> {
  const response = await fetcher('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  
  if (!response.ok) {
    throw new Error(`Firecrawl API error: ${response.status}`);
  }
  
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  
  const json = JSON.parse(text);
  if (!json.success || !json.data) {
    throw new Error(`Firecrawl API scrape failed: ${JSON.stringify(json)}`);
  }
  
  return json.data.markdown || '';
}

function extractListingsFromMarkdown(markdown: string, config: FirecrawlConfig, connectorId: string): InventoryListing[] {
  const lines = markdown.split('\n');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
  const locationRegex = /\b(?:india|bengaluru|bangalore|gurgaon|gurugram|mumbai|pune|hyderabad|delhi|noida|chennai)\b/i;
  
  const listings: InventoryListing[] = [];
  const seenUrls = new Set<string>();

  for (const line of lines) {
    const match = line.match(linkRegex);
    if (match) {
      const title = match[1].trim();
      const url = match[2].trim();
      
      if (locationRegex.test(line)) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          
          let externalId = url;
          try {
            const urlObj = new URL(url, config.careerSearchUrl);
            externalId = urlObj.pathname + urlObj.search;
          } catch (e) {
            // ignore
          }

          let fullUrl = url;
          try {
            fullUrl = new URL(url, config.careerSearchUrl).toString();
          } catch (e) {
            // ignore
          }

          const locationMatches = line.match(locationRegex);
          const location = locationMatches ? locationMatches[0] : 'India';

          listings.push({
            connectorId,
            sourceExternalId: externalId,
            company: config.companyName,
            title,
            location,
            category: null,
            department: null,
            detailUrl: fullUrl,
            listingMetadataHash: hashText(`${externalId}\u0000${title}\u0000${location}\u0000${fullUrl}`),
            rawMetadata: {},
          });
        }
      }
    }
  }
  
  return listings;
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
