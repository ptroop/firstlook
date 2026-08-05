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

const RCV_FIRECRAWL_CONFIGS: FirecrawlConfig[] = [
  { companyName: 'BCG', connectorIdPrefix: 'bcg', careerSearchUrl: 'https://careers.bcg.com/' },
  { companyName: 'BCG Expand', connectorIdPrefix: 'bcg-expand', careerSearchUrl: 'https://careers.bcg.com/global/en/teams/expand' },
  { companyName: 'McKinsey', connectorIdPrefix: 'mckinsey', careerSearchUrl: 'https://www.mckinsey.com/careers/search-jobs' },
  { companyName: 'Bain / Capability Network', connectorIdPrefix: 'bain-capability-network', careerSearchUrl: 'https://www.bain.com/careers/' },
  { companyName: 'Kearney', connectorIdPrefix: 'kearney', careerSearchUrl: 'https://www.kearney.com/careers' },
  { companyName: 'Alvarez & Marsal', connectorIdPrefix: 'alvarez-marsal', careerSearchUrl: 'https://www.alvarezandmarsal.com/careers' },
  { companyName: 'ZS', connectorIdPrefix: 'zs', careerSearchUrl: 'https://www.zs.com/careers' },
  { companyName: 'BNY', connectorIdPrefix: 'bny', careerSearchUrl: 'https://www.bny.com/corporate/global/en/careers.html' },
  { companyName: 'MSCI', connectorIdPrefix: 'msci', careerSearchUrl: 'https://www.msci.com/careers' },
  { companyName: 'CRISIL', connectorIdPrefix: 'crisil', careerSearchUrl: 'https://www.crisil.com/en/home/careers.html' },
  { companyName: 'CARE Ratings', connectorIdPrefix: 'care-ratings', careerSearchUrl: 'https://www.careratings.com/careers' },
  { companyName: 'TresVista', connectorIdPrefix: 'tresvista', careerSearchUrl: 'https://www.tresvista.com/careers/' },
  { companyName: 'The Smart Cube', connectorIdPrefix: 'smart-cube', careerSearchUrl: 'https://www.thesmartcube.com/careers' },
  { companyName: 'Evalueserve', connectorIdPrefix: 'evalueserve', careerSearchUrl: 'https://www.evalueserve.com/careers/' },
  { companyName: 'Acuity Knowledge Partners', connectorIdPrefix: 'acuity-knowledge-partners', careerSearchUrl: 'https://www.acuitykp.com/careers/' },
  { companyName: 'SG Analytics', connectorIdPrefix: 'sg-analytics', careerSearchUrl: 'https://www.sganalytics.com/careers/' },
  { companyName: 'EY GDS', connectorIdPrefix: 'ey-gds', careerSearchUrl: 'https://www.ey.com/en_in/careers' },
  { companyName: 'GT Bharat', connectorIdPrefix: 'gt-bharat', careerSearchUrl: 'https://www.grantthornton.in/careers/' },
  { companyName: 'HDFC Bank', connectorIdPrefix: 'hdfc-bank', careerSearchUrl: 'https://www.hdfcbank.com/personal/about-us/careers' },
  { companyName: 'ICICI Bank', connectorIdPrefix: 'icici-bank', careerSearchUrl: 'https://www.icicicareers.com/' },
  { companyName: 'Axis Bank', connectorIdPrefix: 'axis-bank', careerSearchUrl: 'https://www.axisbank.com/careers' },
  { companyName: 'Kotak', connectorIdPrefix: 'kotak', careerSearchUrl: 'https://www.kotak.com/en/about-us/careers.html' },
  { companyName: 'IDFC First', connectorIdPrefix: 'idfc-first', careerSearchUrl: 'https://www.idfcfirstbank.com/about-us/careers' },
  { companyName: 'Bajaj Finserv', connectorIdPrefix: 'bajaj-finserv', careerSearchUrl: 'https://www.bajajfinserv.in/careers' },
  { companyName: 'Tata Capital', connectorIdPrefix: 'tata-capital', careerSearchUrl: 'https://www.tatacapital.com/careers.html' },
  { companyName: 'CRED', connectorIdPrefix: 'cred', careerSearchUrl: 'https://careers.cred.club/' },
  { companyName: 'HDFC AMC', connectorIdPrefix: 'hdfc-amc', careerSearchUrl: 'https://www.hdfcfund.com/about-us/careers' },
  { companyName: 'ICICI Pru AMC', connectorIdPrefix: 'icici-pru-amc', careerSearchUrl: 'https://www.icicipruamc.com/careers' },
  { companyName: 'Motilal Oswal', connectorIdPrefix: 'motilal-oswal', careerSearchUrl: 'https://www.motilaloswalgroup.com/careers' },
  { companyName: 'Edelweiss', connectorIdPrefix: 'edelweiss', careerSearchUrl: 'https://www.edelweissfin.com/careers' },
  { companyName: 'Zerodha', connectorIdPrefix: 'zerodha', careerSearchUrl: 'https://zerodha.com/careers/' },
];

export const RCV_FIRECRAWL_WAVES: FirecrawlConfig[][] = [
  RCV_FIRECRAWL_CONFIGS.slice(0, 10),
  RCV_FIRECRAWL_CONFIGS.slice(10, 20),
  RCV_FIRECRAWL_CONFIGS.slice(20, 30),
  RCV_FIRECRAWL_CONFIGS.slice(30),
];

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 8_000_000;

export function createFirecrawlConnector(
  config: FirecrawlConfig,
  firecrawlApiKey: string,
  runType: 'watch' | 'reconcile',
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorIdPrefix}-firecrawl-india-${runType}`,
): OfficialJobConnector {
  const connectorId = `${config.connectorIdPrefix}-firecrawl-india`;

  return {
    connectorId,
    connectorVersion: 'firecrawl-v1',
    company: config.companyName,
    scanGroup,
    async enumerate(_request: ConnectorRunRequest) {
      if (!firecrawlApiKey.trim()) throw new Error(`${config.companyName} Firecrawl connector is not configured`);
      const markdown = await scrapeUrl(config.careerSearchUrl, firecrawlApiKey, fetcher);
      const listings = extractListingsFromMarkdown(markdown, config, connectorId);
      
      return {
        listings,
        diagnostic: {
          status: listings.length > 0 ? 'complete' : 'anomalous',
          reportedTotal: listings.length,
          pagesExpected: 1,
          pagesFetched: 1,
          errorSummaries: listings.length > 0 ? [] : [`${config.companyName}: Firecrawl returned no India job links from the configured career page`],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing, _request: ConnectorRunRequest) {
      if (!listing.detailUrl) {
        throw new Error(`Missing detailUrl for ${listing.sourceExternalId}`);
      }
      
      const markdown = await scrapeUrl(listing.detailUrl, firecrawlApiKey, fetcher);
      
      const applyUrl = extractApplyUrl(markdown, listing.detailUrl);
      if (!applyUrl) throw new Error(`${config.companyName}: role page did not expose a direct Apply URL`);
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
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
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const locationRegex = /\b(?:india|bengaluru|bangalore|gurgaon|gurugram|mumbai|pune|hyderabad|delhi|noida|chennai)\b/i;
  
  const listings: InventoryListing[] = [];
  const seenUrls = new Set<string>();

  for (const match of markdown.matchAll(linkRegex)) {
      const title = match[1].trim();
      const url = match[2].trim();
      const start = match.index ?? 0;
      const lineStart = markdown.lastIndexOf('\n', start) + 1;
      const lineEnd = markdown.indexOf('\n', start);
      const nextLineEnd = lineEnd < 0 ? markdown.length : (markdown.indexOf('\n', lineEnd + 1) < 0 ? markdown.length : markdown.indexOf('\n', lineEnd + 1));
      const context = markdown.slice(lineStart, nextLineEnd);
      if (locationRegex.test(context) && !/^(?:home|careers?|search|learn more|view all|apply now)$/i.test(title)) {
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

          const locationMatches = context.match(locationRegex);
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
  
  return listings;
}

function extractApplyUrl(markdown: string, detailUrl: string): string | null {
  const links = [...markdown.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)];
  const candidate = links
    .map((match) => ({ label: match[1].trim(), href: match[2].trim() }))
    .find(({ label, href }) => /\bapply(?: now)?\b/i.test(label) || /\/apply(?:[/?#]|$)/i.test(href));
  if (candidate) return new URL(candidate.href, detailUrl).href;
  return /\/apply(?:[/?#]|$)/i.test(detailUrl) ? detailUrl : null;
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
