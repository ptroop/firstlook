import type { ConnectorRunRequest, HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 8_000_000;
const INDIA = /\b(?:india|bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|delhi|noida|chennai|kolkata|ahmedabad|jaipur|kochi|thiruvananthapuram)\b/i;

export interface AvatureConfig {
  connectorId: string;
  company: string;
  sourceName: string;
  searchUrl: string;
  pageSize: number;
}

export const HSBC_AVATURE_CONFIG: AvatureConfig = {
  connectorId: 'hsbc-firecrawl-india',
  company: 'HSBC',
  sourceName: 'HSBC Careers',
  searchUrl: 'https://mycareer.hsbc.com/en_GB/external/SearchJobs/?country=India',
  pageSize: 10,
};

export interface IcraConfig {
  connectorId: string;
  company: string;
  sourceName: string;
  positionUrls: string[];
}

export const ICRA_NATIVE_CONFIG: IcraConfig = {
  connectorId: 'icra-firecrawl-india',
  company: 'ICRA',
  sourceName: 'ICRA Careers',
  positionUrls: [1, 2, 3].map((positionId) => `https://www.icra.in/Media/Jobs?positionId=${positionId}`),
};

export interface MicrosoftConfig {
  connectorId: string;
  company: string;
  sourceName: string;
  searchUrl: string;
}

export const MICROSOFT_NATIVE_CONFIG: MicrosoftConfig = {
  connectorId: 'microsoft-firecrawl-india',
  company: 'Microsoft',
  sourceName: 'Microsoft Careers',
  searchUrl: 'https://careers.microsoft.com/v2/global/en/locations/india.html',
};

export function createAvatureConnector(
  config: AvatureConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-native`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'avature-html-v1',
    company: config.company,
    scanGroup,
    async enumerate(request) {
      return enumerateAvature(config, fetcher, request.runType === 'watch' ? 12 : 120);
    },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const detail = parseAvatureDetail(html, listing.detailUrl, config);
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: config.sourceName,
        sourceExternalId: listing.sourceExternalId,
        company: config.company,
        employerJobId: detail.employerJobId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: detail.applyUrl,
        isOfficial: true,
        title: detail.title,
        location: detail.location,
        description: detail.description,
        experienceText: extractExperience(detail.description),
        jobCategory: detail.category,
        postedAt: parseDate(detail.postedAt),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${detail.title}\u0000${detail.location}\u0000${detail.description}`),
        rawMetadata: { platform: 'avature' },
      } satisfies HydratedSourceObservation;
    },
  };
}

export function createIcraConnector(
  config: IcraConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-native`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'icra-html-v1',
    company: config.company,
    scanGroup,
    async enumerate() {
      const listings: InventoryListing[] = [];
      const errors: string[] = [];
      let pagesFetched = 0;
      for (const detailUrl of config.positionUrls) {
        try {
          const html = await fetchText(fetcher, detailUrl);
          pagesFetched += 1;
          const listing = parseIcraListing(html, detailUrl, config);
          if (listing) listings.push(listing);
        } catch (error) {
          errors.push(errorSummary(detailUrl, error));
        }
      }
      const uniqueListings = uniqueBy(listings, (listing) => listing.sourceExternalId);
      return {
        listings: uniqueListings,
        diagnostic: {
          status: errors.length > 0 ? (uniqueListings.length > 0 ? 'partial' : 'failed') : (uniqueListings.length > 0 ? 'complete' : 'anomalous'),
          reportedTotal: uniqueListings.length,
          pagesExpected: config.positionUrls.length,
          pagesFetched,
          errorSummaries: errors.length > 0 ? errors : uniqueListings.length > 0 ? [] : [`${config.company}: no current position pages exposed a role`],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const detail = parseIcraDetail(html, listing.detailUrl, config);
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: config.sourceName,
        sourceExternalId: listing.sourceExternalId,
        company: config.company,
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: listing.detailUrl,
        isOfficial: true,
        title: detail.title,
        location: 'India',
        description: detail.description,
        experienceText: extractExperience(detail.description),
        jobCategory: detail.title,
        postedAt: null,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${detail.title}\u0000India\u0000${detail.description}`),
        rawMetadata: { positionId: listing.sourceExternalId },
      } satisfies HydratedSourceObservation;
    },
  };
}

export function createMicrosoftConnector(
  config: MicrosoftConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-native`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'microsoft-html-v1',
    company: config.company,
    scanGroup,
    async enumerate() {
      const html = await fetchText(fetcher, config.searchUrl);
      const listings = parseMicrosoftListings(html, config);
      return {
        listings,
        diagnostic: {
          status: listings.length > 0 ? 'complete' : 'anomalous',
          reportedTotal: listings.length,
          pagesExpected: 1,
          pagesFetched: 1,
          errorSummaries: listings.length > 0 ? [] : [`${config.company}: India page exposed no role-level links`],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      let html = '';
      try {
        html = await fetchText(fetcher, listing.detailUrl);
      } catch {
        // The role link itself is still an official apply surface. Keep the
        // inventory visible when the public detail shell is temporarily slow.
      }
      const detail = parseMicrosoftDetail(html, listing);
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: config.sourceName,
        sourceExternalId: listing.sourceExternalId,
        company: config.company,
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: listing.detailUrl,
        isOfficial: true,
        title: detail.title,
        location: listing.location || 'India',
        description: detail.description,
        experienceText: extractExperience(detail.description),
        jobCategory: '',
        postedAt: null,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${detail.title}\u0000${listing.location}\u0000${detail.description}`),
        rawMetadata: { platform: 'eightfold', detailFetched: Boolean(html) },
      } satisfies HydratedSourceObservation;
    },
  };
}

export function parseAvatureResults(html: string, config: AvatureConfig): InventoryListing[] {
  const listings: InventoryListing[] = [];
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']*(?:PipelineDetail|JobDetail|JobDetails)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const detailUrl = absoluteUrl(match[2], config.searchUrl);
    const title = htmlToText(match[3]);
    if (!detailUrl || !title || isGenericTitle(title)) continue;
    const contextStart = Math.max(0, (match.index ?? 0) - 1_000);
    const contextEnd = Math.min(html.length, (match.index ?? 0) + match[0].length + 2_000);
    const context = html.slice(contextStart, contextEnd);
    const location = firstClassText(context, ['item--location', 'article--item--location', 'job-location']) || 'India';
    if (!INDIA.test(location) && !INDIA.test(config.searchUrl)) continue;
    const sourceExternalId = attribute(match[1], 'data-job-id') || detailUrl.match(/\/(\d+)(?:[/?#]|$)/)?.[1] || stableId(detailUrl);
    listings.push({
      connectorId: config.connectorId,
      sourceExternalId,
      company: config.company,
      title,
      location,
      category: firstClassText(context, ['item--category', 'article--item--category']) || null,
      department: null,
      detailUrl,
      listingMetadataHash: hashText(`${sourceExternalId}\u0000${title}\u0000${location}\u0000${detailUrl}`),
      rawMetadata: { platform: 'avature' },
    });
  }
  return uniqueBy(listings, (listing) => listing.sourceExternalId);
}

export function parseIcraListing(html: string, detailUrl: string, config: IcraConfig): InventoryListing | null {
  const detail = parseIcraDetail(html, detailUrl, config);
  if (!detail.title || !detail.description) return null;
  const sourceExternalId = new URL(detailUrl).searchParams.get('positionId') || stableId(detailUrl);
  return {
    connectorId: config.connectorId,
    sourceExternalId,
    company: config.company,
    title: detail.title,
    location: 'India',
    category: detail.title,
    department: null,
    detailUrl,
    listingMetadataHash: hashText(`${sourceExternalId}\u0000${detail.title}\u0000${detailUrl}`),
    rawMetadata: { platform: 'icra', positionId: sourceExternalId },
  };
}

export function parseMicrosoftListings(html: string, config: MicrosoftConfig): InventoryListing[] {
  const listings: InventoryListing[] = [];
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']*apply\.careers\.microsoft\.com[^"']*\/careers\/job\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const detailUrl = absoluteUrl(match[2], config.searchUrl);
    const title = htmlToText(match[3]) || `Microsoft role ${detailUrl.match(/\/job\/([^/?#]+)/i)?.[1] || stableId(detailUrl)}`;
    if (!detailUrl || isGenericTitle(title)) continue;
    const sourceExternalId = detailUrl.match(/\/job\/([^/?#]+)/i)?.[1] || stableId(detailUrl);
    listings.push({
      connectorId: config.connectorId,
      sourceExternalId,
      company: config.company,
      title,
      location: 'India',
      category: null,
      department: null,
      detailUrl,
      listingMetadataHash: hashText(`${sourceExternalId}\u0000${title}\u0000India\u0000${detailUrl}`),
      rawMetadata: { platform: 'eightfold' },
    });
  }
  return uniqueBy(listings, (listing) => listing.sourceExternalId);
}

function parseAvatureDetail(html: string, detailUrl: string, config: AvatureConfig) {
  const title = firstText(html, ['article--title', 'job-title', 'pipeline-title']) || firstHeading(html) || titleFromUrl(detailUrl);
  const location = firstClassText(html, ['item--location', 'article--item--location', 'job-location']) || 'India';
  const description = firstClassText(html, ['article--content', 'job-description', 'pipeline-description', 'description']) || extractMainText(html) || title;
  const applyUrl = findApplyHref(html, detailUrl) || detailUrl;
  const employerJobId = detailUrl.match(/\/(\d+)(?:[/?#]|$)/)?.[1] || stableId(detailUrl);
  return {
    title,
    location,
    description,
    applyUrl,
    employerJobId,
    category: firstClassText(html, ['item--category', 'job-category']),
    postedAt: firstText(html, ['item--date', 'job-date']),
  };
}

function parseIcraDetail(html: string, detailUrl: string, _config: IcraConfig) {
  const title = firstHeading(html) || metaContent(html, 'og:title');
  const descriptionMatch = html.match(/Job Description\s*<\/[^>]+>([\s\S]*?)(?:Submit Your Application|Please fill the details)/i);
  const description = htmlToText(descriptionMatch?.[1] || firstClassText(html, ['job-description', 'career-description', 'description']) || extractMainText(html));
  return { title: title.replace(/\s*\|\s*ICRA.*$/i, '').trim(), description, detailUrl };
}

function parseMicrosoftDetail(html: string, listing: InventoryListing) {
  const title = firstHeading(html) || metaContent(html, 'og:title') || listing.title;
  const description = htmlToText(firstClassText(html, ['job-description', 'description', 'job-details']) || extractMainText(html) || title);
  return { title: title.replace(/\s*\|.*Microsoft.*$/i, '').trim(), description };
}

async function enumerateAvature(config: AvatureConfig, fetcher: JobFetch, maxPages: number): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  let pagesExpected: number | null = null;
  let reportedTotal = parseReportedTotal('');
  for (let page = 0; page < maxPages; page += 1) {
    const url = page === 0 ? config.searchUrl : withPage(config.searchUrl, config.pageSize, page * config.pageSize);
    try {
      const html = await fetchText(fetcher, url);
      pagesFetched += 1;
      if (reportedTotal === null) reportedTotal = parseReportedTotal(html);
      const pageListings = parseAvatureResults(html, config);
      const newListings = pageListings.filter((listing) => !seen.has(listing.sourceExternalId));
      newListings.forEach((listing) => { seen.add(listing.sourceExternalId); listings.push(listing); });
      if (pageListings.length === 0 || newListings.length === 0 || pageListings.length < config.pageSize) break;
    } catch (error) {
      errors.push(errorSummary(url, error));
      break;
    }
  }
  if (reportedTotal !== null) pagesExpected = Math.ceil(reportedTotal / config.pageSize);
  if (pagesExpected !== null && pagesFetched < pagesExpected && errors.length === 0) errors.push(`Fetched ${pagesFetched} of ${pagesExpected} advertised ${config.company} pages`);
  return {
    listings,
    diagnostic: {
      status: errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : (listings.length > 0 ? 'complete' : 'anomalous'),
      reportedTotal: reportedTotal ?? listings.length,
      pagesExpected: pagesExpected ?? pagesFetched,
      pagesFetched,
      errorSummaries: errors.length > 0 ? errors : listings.length > 0 ? [] : [`${config.company}: no role links found`],
    },
  };
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)', Accept: 'text/html,application/xhtml+xml' },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}

function withPage(value: string, pageSize: number, offset: number): string {
  const url = new URL(value);
  url.searchParams.set('pipelineRecordsPerPage', String(pageSize));
  url.searchParams.set('pipelineOffset', String(offset));
  return url.href;
}

function parseReportedTotal(html: string): number | null {
  const value = html.match(/(?:data-total(?:-results)?|total(?:Results|Jobs)?)[="':\s]+(\d+)/i)?.[1]
    || html.match(/\bof\s+(\d+)\s+(?:jobs?|results?)/i)?.[1];
  return value ? Number(value) : null;
}

function firstClassText(html: string, classNames: string[]): string {
  for (const className of classNames) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
    const value = htmlToText(match?.[1] || '');
    if (value) return value;
  }
  return '';
}

function firstText(html: string, classNames: string[]): string { return firstClassText(html, classNames); }

function firstHeading(html: string): string { return htmlToText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || ''); }

function extractMainText(html: string): string {
  const content = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] || '';
  return htmlToText(content).slice(0, 20_000);
}

function metaContent(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(html.match(new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function findApplyHref(html: string, baseUrl: string): string {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = htmlToText(match[2]);
    if (/\bapply(?: now)?\b/i.test(label)) return absoluteUrl(match[1], baseUrl);
  }
  const explicit = html.match(/(?:href|data-href)=["']([^"']*\/apply[^"']*)["']/i)?.[1];
  return explicit ? absoluteUrl(explicit, baseUrl) : '';
}

function titleFromUrl(value: string): string { try { return decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).pop() || 'Role').replace(/[-_]+/g, ' '); } catch { return 'Role'; } }
function absoluteUrl(value: string, baseUrl: string): string { try { return new URL(decodeHtml(value), baseUrl).href; } catch { return ''; } }
function stableId(value: string): string { return `url-${hashText(value)}`; }
function isGenericTitle(value: string): boolean { return /^(?:apply(?: now)?|learn more|view all|search|careers?|home|read more|details?)$/i.test(value.trim()); }
function extractExperience(value: string): string { return value.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || ''; }
function parseDate(value: string): string | null { const timestamp = Date.parse(value); return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString(); }
function htmlToText(value: string): string { return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function decodeHtml(value: string): string { return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, ' ').replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number.parseInt(d, 10))); }
function attribute(value: string, name: string): string { const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return decodeHtml(value.match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || ''); }
function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] { const seen = new Set<string>(); return values.filter((value) => { const key = identity(value); if (seen.has(key)) return false; seen.add(key); return true; }); }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
function errorSummary(url: string, error: unknown): string { return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500); }
