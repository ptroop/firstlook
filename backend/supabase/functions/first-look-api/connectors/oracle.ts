import type { InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export type OracleConfig = {
  connectorId: string;
  company: string;
  sourceName: string;
  baseUrl: string;
  siteId: string;
  watchPages: number;
};

export const KPMG_CONFIG: OracleConfig = {
  connectorId: 'kpmg-official-india',
  company: 'KPMG India',
  sourceName: 'KPMG India Careers',
  baseUrl: 'https://ejgk.fa.em2.oraclecloud.com',
  siteId: 'CX_1',
  watchPages: 5,
};

export const AMEX_CONFIG: OracleConfig = {
  connectorId: 'amex-official-india',
  company: 'American Express',
  sourceName: 'American Express Careers',
  baseUrl: 'https://aexp.fa.us2.oraclecloud.com',
  siteId: 'CX_1',
  watchPages: 5,
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 8_000_000;

export function createOracleConnector(
  config: OracleConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-reconcile`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'oracle-v1',
    company: config.company,
    scanGroup,
    async enumerate(request) {
      return enumerateOracle(config, fetcher, request.runType === 'watch' ? config.watchPages : 100);
    },
    async hydrate(listing) {
      const url = `${config.baseUrl}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?finder=ById;Id="%22${listing.sourceExternalId}%22"`;
      const data = await fetchJson(fetcher, url);
      const detail = data?.items?.[0];
      if (!detail) {
        throw new Error(`Failed to hydrate ${listing.sourceExternalId}`);
      }

      const applyUrl = `${config.baseUrl}/hcmUI/CandidateExperience/en/sites/${config.siteId}/job/${listing.sourceExternalId}/apply`;
      const description = combineDescriptions(detail);
      
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: config.sourceName,
        sourceExternalId: listing.sourceExternalId,
        company: config.company,
        employerJobId: detail.Id || listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
        isOfficial: true,
        title: detail.Title || listing.title,
        location: detail.PrimaryLocation || listing.location,
        description,
        experienceText: extractExperience(description),
        jobCategory: detail.Category || listing.category || '',
        postedAt: parsePostedDate(detail.PostedDate),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${detail.Title || listing.title}\u0000${detail.PrimaryLocation || listing.location}\u0000${description}`),
        rawMetadata: { employerJobId: detail.Id },
      };
    },
  };
}

async function enumerateOracle(config: OracleConfig, fetcher: JobFetch, maxPages: number): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  let reportedTotal: number | null = null;
  const limit = 25;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * limit;
    const url = `${config.baseUrl}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=all&finder=findReqs;siteNumber=${config.siteId},limit=${limit},offset=${offset}`;
    
    try {
      const data = await fetchJson(fetcher, url);
      const items = Array.isArray(data?.items) ? data.items : [];
      pagesFetched += 1;

      for (const item of items) {
        const sourceExternalId = item.Id;
        const title = item.Title || '';
        const location = item.PrimaryLocation || '';
        const category = item.Category || null;
        
        // India filter regex
        if (!sourceExternalId || !title || !location || !/\b(?:india|bengaluru|bangalore|gurgaon|gurugram|mumbai|pune|hyderabad|delhi|noida|chennai)\b/i.test(location)) {
          continue;
        }

        const detailUrl = `${config.baseUrl}/hcmUI/CandidateExperience/en/sites/${config.siteId}/job/${sourceExternalId}`;
        listings.push({
          connectorId: config.connectorId,
          sourceExternalId,
          company: config.company,
          title,
          location,
          category,
          department: null,
          detailUrl,
          listingMetadataHash: hashText([sourceExternalId, title, location, detailUrl].join('\u0000')),
          rawMetadata: { },
        });
      }

      if (items.length < limit) {
        // Last page reached
        break;
      }
    } catch (error) {
      errors.push(errorSummary(url, error));
      break;
    }
  }

  return {
    listings: uniqueBy(listings, (listing) => listing.sourceExternalId),
    diagnostic: {
      status: errors.length === 0 ? 'complete' : 'partial',
      reportedTotal, // ORC doesn't typically provide a flat total count in this response format reliably
      pagesExpected: pagesFetched,
      pagesFetched,
      errorSummaries: errors,
    },
  };
}

async function fetchJson(fetcher: JobFetch, url: string): Promise<any> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'first-look-job-monitor/0.5 (+personal use)', 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  if (!text) throw new Error('Empty JSON response');
  return JSON.parse(text);
}

function combineDescriptions(detail: any): string {
  const parts = [
    detail.CorporateDescriptionStr,
    detail.OrganizationDescriptionStr,
    detail.ShortDescriptionStr,
    detail.ExternalResponsibilitiesStr,
    detail.ExternalQualificationsStr
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  
  if (parts.length === 0) {
    return 'No description available.';
  }
  return htmlToText(parts.join('\n\n'));
}

function extractExperience(description: string): string {
  return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
}

function parsePostedDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number.parseInt(d, 10)));
}

function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = identity(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function errorSummary(url: string, error: unknown): string {
  return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500);
}
