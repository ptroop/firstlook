import type { HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export interface OfficialPageConfig {
  companyName: string;
  connectorIdPrefix: string;
  careerSearchUrl: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8_000_000;
const MAX_LISTINGS = 250;
const MAX_SITEMAP_URLS = 500;
const MAX_SITEMAPS = 3;
const INDIA = /\b(?:india|bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|delhi|noida|chennai|kolkata|ahmedabad|jaipur|kochi|thiruvananthapuram)\b/i;
const JOB_URL = /(?:\/job(?:s)?[\/-]|\/vacanc(?:y|ies)[\/-]|\/position(?:s)?[\/-]|\/requisition[\/-]|jobid=|job_id=|jobdetails?|job-detail|search-results?\/[^/?#]+\/\d)/i;
const GENERIC_LINK = /^(?:apply(?: now)?|learn more|view all|search|careers?|home|read more|know more|explore|click here)$/i;

export function createOfficialPageConnector(
  config: OfficialPageConfig,
  fetcher: JobFetch = fetch,
  runType: 'watch' | 'reconcile',
  scanGroup = `${config.connectorIdPrefix}-official-page-${runType}`,
): OfficialJobConnector {
  const connectorId = `${config.connectorIdPrefix}-official-page-india`;
  return {
    connectorId,
    connectorVersion: 'official-page-v1',
    company: config.companyName,
    scanGroup,
    async enumerate() {
      const page = await fetchText(fetcher, config.careerSearchUrl);
      const listings = uniqueBy([
        ...parseJsonLdListings(page, config, connectorId),
        ...parseAnchorListings(page, config, connectorId),
        ...(await discoverSitemapListings(fetcher, page, config, connectorId)),
      ], (listing) => listing.sourceExternalId).slice(0, MAX_LISTINGS);

      return {
        listings,
        diagnostic: {
          status: listings.length > 0 ? 'complete' : 'anomalous',
          reportedTotal: listings.length,
          pagesExpected: 1,
          pagesFetched: 1,
          errorSummaries: listings.length > 0
            ? []
            : [`${config.companyName}: official page exposed no parseable job detail links`],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const posting = parseJsonLdPostings(html)[0] ?? {};
      const title = stringValue(posting.title) || listing.title;
      const location = jsonLdLocation(posting.jobLocation) || listing.location || '';
      const description = htmlToText(stringValue(posting.description)) || extractBodyText(html);
      const applyUrl = findApplyUrl(html, listing.detailUrl);
      if (!title || !location || !description) throw new Error(`Missing required ${config.companyName} official-page job fields`);
      if (!applyUrl) throw new Error(`${config.companyName}: role page did not expose a direct Apply URL`);

      const employerJobId = stringValue(posting.identifier?.value)
        || stringValue(posting.identifier)
        || stableJobId(listing.detailUrl);
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: stringValue(posting.occupationalCategory) || stringValue(posting.industry) || '',
        postedAt: parseDate(stringValue(posting.datePosted)),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: { discoveryMethod: listing.rawMetadata.discoveryMethod || 'official-page' },
      } satisfies HydratedSourceObservation;
    },
  };
}

function parseJsonLdListings(html: string, config: OfficialPageConfig, connectorId: string): InventoryListing[] {
  return parseJsonLdPostings(html)
    .map((posting) => toListing(posting, config, connectorId, 'jsonld'))
    .filter((listing): listing is InventoryListing => listing !== null);
}

export function parseJsonLdPostings(html: string): Array<Record<string, any>> {
  const postings: Array<Record<string, any>> = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectJobPostings(JSON.parse(decodeHtml(match[1])), postings);
    } catch {
      // A malformed analytics JSON-LD block must not hide other postings.
    }
  }
  return postings;
}

function collectJobPostings(value: unknown, output: Array<Record<string, any>>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectJobPostings(item, output);
    return;
  }
  if (!isRecord(value)) return;
  const type = Array.isArray(value['@type']) ? value['@type'].map(String) : [String(value['@type'] ?? '')];
  if (type.some((item) => item.toLowerCase() === 'jobposting')) output.push(value);
  if (value['@graph']) collectJobPostings(value['@graph'], output);
}

function parseAnchorListings(html: string, config: OfficialPageConfig, connectorId: string): InventoryListing[] {
  const listings: InventoryListing[] = [];
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = absoluteUrl(match[2], config.careerSearchUrl);
    const title = htmlToText(match[3]);
    const context = htmlToText(match[0]).slice(0, 600);
    if (!href || !title || GENERIC_LINK.test(title) || !JOB_URL.test(href)) continue;
    if (!INDIA.test(context) && !INDIA.test(href) && !/india/i.test(config.careerSearchUrl)) continue;
    const listing = toListing({ title, url: href, jobLocation: { address: { addressCountry: 'IN' } } }, config, connectorId, 'anchor');
    if (listing) listings.push(listing);
  }
  return listings;
}

async function discoverSitemapListings(fetcher: JobFetch, page: string, config: OfficialPageConfig, connectorId: string): Promise<InventoryListing[]> {
  const candidates = new Set<string>();
  for (const match of page.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi)) candidates.add(decodeHtml(match[1]).trim());
  const origin = new URL(config.careerSearchUrl).origin;
  candidates.add(`${origin}/sitemap.xml`);
  candidates.add(`${origin}/sitemap_index.xml`);
  candidates.add(`${config.careerSearchUrl.replace(/\/$/, '')}/sitemap.xml`);

  const urls: string[] = [];
  const pending = [...candidates];
  const seenSitemaps = new Set<string>();
  let sitemapsFetched = 0;
  while (pending.length > 0 && sitemapsFetched < MAX_SITEMAPS) {
    const sitemap = pending.shift()!;
    if (seenSitemaps.has(sitemap)) continue;
    seenSitemaps.add(sitemap);
    try {
      const xml = await fetchText(fetcher, sitemap);
      sitemapsFetched += 1;
      for (const match of xml.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi)) {
        const url = decodeHtml(match[1]).trim();
        if (/sitemap(?:[_-][^/?#]+)?\.xml(?:$|[?#])/i.test(url)) {
          pending.push(url);
          continue;
        }
        if (JOB_URL.test(url) && (INDIA.test(url) || /india/i.test(config.careerSearchUrl))) urls.push(url);
      }
    } catch {
      // Sitemaps are an optional fallback. The primary page result remains valid.
    }
  }
  return uniqueBy(urls.slice(0, MAX_SITEMAP_URLS).map((url) => toListing(
    { title: titleFromUrl(url), url, jobLocation: { address: { addressCountry: 'IN' } } },
    config,
    connectorId,
    'sitemap',
  )).filter((listing): listing is InventoryListing => listing !== null), (listing) => listing.sourceExternalId);
}

function toListing(posting: Record<string, any>, config: OfficialPageConfig, connectorId: string, discoveryMethod: string): InventoryListing | null {
  const detailUrl = absoluteUrl(stringValue(posting.url) || stringValue(posting.mainEntityOfPage), config.careerSearchUrl);
  const title = stringValue(posting.title);
  const location = jsonLdLocation(posting.jobLocation) || (INDIA.test(detailUrl) ? 'India' : '');
  if (!detailUrl || !title || !/^https?:\/\//i.test(detailUrl) || !location || (!INDIA.test(location) && !INDIA.test(detailUrl))) return null;
  return {
    connectorId,
    sourceExternalId: stableJobId(detailUrl),
    company: config.companyName,
    title,
    location,
    category: stringValue(posting.occupationalCategory) || null,
    department: stringValue(posting.industry) || null,
    detailUrl,
    listingMetadataHash: hashText([detailUrl, title, location, stringValue(posting.datePosted)].join('\u0000')),
    rawMetadata: { discoveryMethod },
  };
}

export function findApplyUrl(html: string, detailUrl: string): string | null {
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = htmlToText(match[3]);
    const href = absoluteUrl(match[2], detailUrl);
    if (href && /\bapply(?: now)?\b/i.test(label) && !isGenericCareerUrl(href)) return href;
  }
  const explicitApply = html.match(/(?:href|data-href)=["']([^"']*\/apply[^"']*)["']/i)?.[1];
  const href = explicitApply ? absoluteUrl(explicitApply, detailUrl) : null;
  return href && !isGenericCareerUrl(href) ? href : null;
}

function isGenericCareerUrl(value: string): boolean {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, '').toLowerCase();
    return /^\/(?:careers?|jobs?|search|search-results?|home)?$/.test(path)
      || /\/(?:careers?|jobs?|search|search-results?)\/?$/i.test(path);
  } catch {
    return true;
  }
}

export function jsonLdLocation(value: unknown): string {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => {
    if (typeof item === 'string') return item;
    if (!isRecord(item)) return '';
    const address = isRecord(item.address) ? item.address : item;
    const country = stringValue(address.addressCountry);
    const countryLabel = /^(?:in|ind)$/i.test(country) ? 'India' : country;
    return [address.addressLocality, address.addressRegion, countryLabel]
      .map(stringValue)
      .filter(Boolean)
      .join(', ');
  }).filter(Boolean).join(' / ');
}

export function extractBodyText(html: string): string {
  return htmlToText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 20_000);
}

export function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)', Accept: 'text/html, application/xml' },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Official page fetch failed: HTTP ${response.status}`);
  if (text.length > MAX_BODY_BYTES) throw new Error(`Official page exceeded ${MAX_BODY_BYTES} bytes`);
  return text;
}

function absoluteUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    return /^https?:$/i.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function titleFromUrl(value: string): string {
  try {
    const part = new URL(value).pathname.split('/').filter(Boolean).pop() || 'Official vacancy detail';
    return decodeURIComponent(part).replace(/[-_]+/g, ' ').replace(/\b\d{3,}\b/g, '').replace(/\s+/g, ' ').trim() || 'Official vacancy detail';
  } catch {
    return 'Official vacancy detail';
  }
}

function stableJobId(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(-180);
}

export function extractExperience(description: string): string {
  return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
}

export function parseDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => { const key = identity(value); if (seen.has(key)) return false; seen.add(key); return true; });
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
