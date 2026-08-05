import type { InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

type TalentBrewConfig = {
  connectorId: string;
  company: string;
  sourceName: string;
  catalogBaseUrl: string;
  detailBaseUrl: string;
  organizationId: string;
  watchPages: number;
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 3_000_000;

export const BLACKROCK_CONFIG: TalentBrewConfig = {
  connectorId: 'blackrock-official-india',
  company: 'BlackRock',
  sourceName: 'BlackRock Careers',
  catalogBaseUrl: 'https://careers.blackrock.com/location/india-jobs/45831/1269750/2',
  detailBaseUrl: 'https://careers.blackrock.com',
  organizationId: '45831',
  watchPages: 5,
};

export const BARCLAYS_CONFIG: TalentBrewConfig = {
  connectorId: 'barclays-official-india',
  company: 'Barclays',
  sourceName: 'Barclays Careers',
  catalogBaseUrl: 'https://search.jobs.barclays/location/india-jobs/13015/1269750/2',
  detailBaseUrl: 'https://search.jobs.barclays',
  organizationId: '13015',
  watchPages: 5,
};

export function createTalentBrewConnector(
  config: TalentBrewConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-reconcile`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'talentbrew-v1',
    company: config.company,
    scanGroup,
    async enumerate(request) {
      return enumerateTalentBrew(config, fetcher, request.runType === 'watch' ? config.watchPages : 100);
    },
    async hydrate(listing) {
      const parsed = parseTalentBrewDetail(await fetchText(fetcher, listing.detailUrl), listing.detailUrl, config);
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: config.sourceName,
        sourceExternalId: listing.sourceExternalId,
        company: config.company,
        employerJobId: parsed.employerJobId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: parsed.applyUrl,
        isOfficial: true,
        title: parsed.title,
        location: parsed.location,
        description: parsed.description,
        experienceText: parsed.experienceText,
        jobCategory: parsed.jobCategory,
        postedAt: parsed.postedAt,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${parsed.title}\u0000${parsed.location}\u0000${parsed.description}`),
        rawMetadata: { employerJobId: parsed.employerJobId },
      };
    },
  };
}

async function enumerateTalentBrew(config: TalentBrewConfig, fetcher: JobFetch, maxPages: number): Promise<InventoryResult> {
  const firstUrl = `${config.catalogBaseUrl}/1`;
  const errors: string[] = [];
  let firstHtml: string;
  try {
    firstHtml = await fetchText(fetcher, firstUrl);
  } catch (error) {
    return { listings: [], diagnostic: { status: 'failed', reportedTotal: null, pagesExpected: 1, pagesFetched: 0, errorSummaries: [errorSummary(firstUrl, error)] } };
  }

  const metadata = parsePageMetadata(firstHtml);
  const pagesExpected = Math.min(metadata.pages || 1, maxPages);
  if (metadata.pages > maxPages) errors.push(`Pagination exceeded ${maxPages} pages`);
  const bodies: Array<string | undefined> = [firstHtml];
  for (let page = 2; page <= pagesExpected; page += 1) {
    const url = `${config.catalogBaseUrl}/${page}`;
    try { bodies.push(await fetchText(fetcher, url)); }
    catch (error) { errors.push(errorSummary(url, error)); bodies.push(undefined); }
  }

  const listings = uniqueBy(
    bodies.flatMap((html) => html ? parseTalentBrewResults(html, config) : []),
    (listing) => listing.sourceExternalId,
  );
  if (metadata.total !== null && maxPages >= metadata.pages && listings.length !== metadata.total) {
    errors.push(`Reported ${metadata.total} listings but discovered ${listings.length}`);
  }
  if (bodies.filter(Boolean).length !== pagesExpected) errors.push(`Fetched ${bodies.filter(Boolean).length} of ${pagesExpected} expected pages`);
  return {
    listings,
    diagnostic: {
      status: errors.length === 0 ? 'complete' : 'partial',
      reportedTotal: metadata.total,
      pagesExpected,
      pagesFetched: bodies.filter(Boolean).length,
      errorSummaries: errors,
    },
  };
}

export function parseTalentBrewResults(html: string, config: TalentBrewConfig): InventoryListing[] {
  const listings: InventoryListing[] = [];
  const anchorPattern = /<a\b([^>]+)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = attribute(match[1], 'href');
    const sourceExternalId = attribute(match[1], 'data-job-id');
    const title = htmlToText(match[2]);
    if (!/\/job\//i.test(href)) continue;
    const start = match.index ?? 0;
    const context = html.slice(start, start + 2_000);
    const location = extractContextValue(context, 'job-location');
    if (!sourceExternalId || !title || !location || !/\b(?:india|bengaluru|bangalore|gurgaon|gurugram|mumbai|pune|hyderabad|delhi|noida|chennai)\b/i.test(location)) continue;
    const detailUrl = new URL(href, config.detailBaseUrl).href;
    listings.push({
      connectorId: config.connectorId,
      sourceExternalId,
      company: config.company,
      title,
      location,
      category: extractContextValue(context, 'job-category') || null,
      department: null,
      detailUrl,
      listingMetadataHash: hashText([sourceExternalId, title, location, detailUrl].join('\u0000')),
      rawMetadata: { organizationId: config.organizationId },
    });
  }
  return listings;
}

export function parseTalentBrewDetail(html: string, detailUrl: string, config: TalentBrewConfig) {
  const title = firstText(html, ['section4__job-title', 'job-details--title', 'job-title']) || metaContent(html, 'og:title') || firstHeading(html);
  const location = firstText(html, ['section4__job-location', 'job-details--location', 'job-location']) || jsonLdLocation(html);
  const description = htmlToText(classHtml(html, 'ats-description') || classHtml(html, 'job-description') || jsonLdDescription(html) || classHtml(html, 'job-details--description'));
  const applyUrl = attribute(html, 'data-apply-url') || metaContent(html, 'job-apply-url') || findApplyHref(html);
  const employerJobId = attribute(html, 'data-job-id') || detailUrl.match(/\/(\d+)\/?$/)?.[1] || '';
  const jobCategory = firstText(html, ['section4__job-category', 'job-details--category']);
  const experienceText = description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
  if (!employerJobId || !title || !location || !description || !/^https?:\/\//i.test(applyUrl)) throw new Error(`Missing required ${config.company} job fields`);
  return { employerJobId, title, location, description, applyUrl, jobCategory, experienceText, postedAt: parsePostedDate(firstText(html, ['section4__job-date', 'job-date'])) };
}

function parsePageMetadata(html: string) {
  const section = html.match(/<(?:section|div)\b[^>]*data-total-job-results=["'](\d+)["'][^>]*data-total-pages=["'](\d+)["'][^>]*>/i);
  return { total: section ? Number(section[1]) : null, pages: section ? Number(section[2]) : 1 };
}

function extractContextValue(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scope = html.slice(0, 2_000);
  const opening = scope.match(new RegExp(`<([a-z0-9]+)\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>`, 'i'));
  if (!opening || opening.index === undefined) return '';
  const tagName = opening[1].toLowerCase();
  const contentStart = opening.index + opening[0].length;
  const remainder = scope.slice(contentStart);
  const nextOpening = remainder.search(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>`, 'i'));
  const bounded = nextOpening >= 0 ? remainder.slice(0, nextOpening) : remainder.slice(0, 800);
  const closingIndex = bounded.toLowerCase().lastIndexOf(`</${tagName}>`);
  return htmlToText(closingIndex >= 0 ? bounded.slice(0, closingIndex) : bounded);
}

function firstText(html: string, classNames: string[]): string {
  for (const className of classNames) {
    const value = htmlToText(classHtml(html, className));
    if (value) return value;
  }
  return '';
}

function firstHeading(html: string): string {
  return htmlToText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
}

function metaContent(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(html.match(new RegExp(`<meta\\b[^>]*(?:name|property|itemprop)=["']${escaped}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function jsonLdDescription(html: string): string {
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(block[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const value = candidates.find((item) => item && typeof item.description === 'string')?.description;
      if (value) return value;
    } catch { /* malformed JSON-LD is not fatal when visible markup is available */ }
  }
  return '';
}

function jsonLdLocation(html: string): string {
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(block[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const location = candidates.find((item) => item?.jobLocation)?.jobLocation;
      const values = Array.isArray(location) ? location : [location];
      const text = values.map((item) => item?.address?.addressLocality || item?.address?.addressRegion || '').filter(Boolean).join(', ');
      if (text) return text;
    } catch { /* malformed JSON-LD is not fatal when visible markup is available */ }
  }
  return '';
}

function classHtml(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1] || '';
}

function attribute(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(html.match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function findApplyHref(html: string): string {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]))
    .find((href) => /\/apply(?:[/?#]|$)/i.test(href) && /^https?:\/\//i.test(href)) || '';
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { 'User-Agent': 'first-look-job-monitor/0.5 (+personal use)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  return text;
}

function parsePostedDate(value: string): string | null {
  const timestamp = Date.parse(value.replace(/\./g, ''));
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function htmlToText(value: string): string { return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function decodeHtml(value: string): string { return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, ' ').replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number.parseInt(d, 10))); }
function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] { const seen = new Set<string>(); return values.filter((value) => { const key = identity(value); if (seen.has(key)) return false; seen.add(key); return true; }); }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
function errorSummary(url: string, error: unknown): string { return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500); }
