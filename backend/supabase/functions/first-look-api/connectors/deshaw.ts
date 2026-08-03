import type { InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';

const COMPANY = 'D. E. Shaw';
const CATALOG_URL = 'https://www.deshawindia.com/careers/work-with-us';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 8_000_000;

export function createDeshawConnector(
  fetcher: JobFetch = fetch,
  scanGroup = 'deshaw-reconcile',
): OfficialJobConnector {
  return {
    connectorId: 'deshaw-official-india',
    connectorVersion: 'deshaw-v1',
    company: COMPANY,
    scanGroup,
    async enumerate() {
      const html = await fetchText(fetcher, CATALOG_URL);
      const listings = parseDeshawCatalog(html, CATALOG_URL);
      const advertisedTotal = reportedCatalogTotal(html);
      const cardCount = catalogCardCount(html);
      const reportedTotal = advertisedTotal ?? cardCount;
      const errorSummaries: string[] = [];
      if (advertisedTotal !== null && advertisedTotal !== listings.length) {
        errorSummaries.push(`Reported ${advertisedTotal} listings but discovered ${listings.length}`);
      }
      if (cardCount === 0) errorSummaries.push('Catalog contained no job cards');
      else if (cardCount !== listings.length) {
        errorSummaries.push(`Catalog exposed ${cardCount} job cards but discovered ${listings.length}`);
      }
      return {
        listings,
        diagnostic: {
          status: errorSummaries.length === 0 ? 'complete' : 'partial',
          reportedTotal,
          pagesExpected: 1,
          pagesFetched: 1,
          errorSummaries,
        },
      };
    },
    async hydrate(listing) {
      const parsed = parseDeshawJob(await fetchText(fetcher, listing.detailUrl), listing.detailUrl);
      return {
        connectorId: 'deshaw-official-india',
        sourceType: 'official_career',
        sourceName: 'D. E. Shaw India Careers',
        sourceExternalId: listing.sourceExternalId,
        company: COMPANY,
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
        postedAt: null,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${parsed.title}\u0000${parsed.location}\u0000${parsed.description}`),
        rawMetadata: { employerJobId: parsed.employerJobId },
      };
    },
  };
}

export function parseDeshawCatalog(html: string, baseUrl: string): InventoryListing[] {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bjob\b[^"']*["'][^>]*data-job-id=["'](\d+)["'][^>]*>/gi)];
  const listings: InventoryListing[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? Math.min(html.length, start + 20_000);
    const card = html.slice(start, end);
    const sourceExternalId = match[1];
    const title = classText(card, 'job-display-name');
    const href = firstAttribute(card, /<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    if (!sourceExternalId || !title || !href || !/\/careers\//i.test(href)) continue;
    const rawLocation = classText(card, 'location');
    const category = classText(card, 'category') || null;
    const detailUrl = new URL(decodeHtml(href), baseUrl).href;
    const location = normalizeCatalogLocation(rawLocation);
    listings.push({
      connectorId: 'deshaw-official-india',
      sourceExternalId,
      company: COMPANY,
      title,
      location,
      category,
      department: category,
      detailUrl,
      listingMetadataHash: hashText([sourceExternalId, title, location, category, detailUrl].join('\u0000')),
      rawMetadata: { locationCode: rawLocation },
    });
  }
  return uniqueBy(listings, (listing) => listing.sourceExternalId);
}

export function parseDeshawJob(html: string, detailUrl: string) {
  const structured = parseDeshawJobPosting(html);
  const employerJobId = attributeFromDocument(html, 'data-job-id') || detailUrl.match(/-(\d+)\/?$/)?.[1] || '';
  const header = html.match(/<header\b[^>]*class=["'][^"']*JobDescription_header__[^"']*["'][^>]*>([\s\S]*?)<\/header>/i)?.[1] || '';
  const title = htmlToText(header.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || structured.title;
  const headingParts = (header.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '')
    .split(/<br\s*\/?\s*>/i)
    .map(htmlToText)
    .filter(Boolean);
  const jobCategory = headingParts[0] || structured.jobCategory;
  const location = normalizeDetailLocation(headingParts.slice(1).join(' ')) || structured.location;
  const sections = [...html.matchAll(/<section\b[^>]*class=["'][^"']*JobDescription_pageTextBox__[^"']*["'][^>]*>([\s\S]*?)<\/section>/gi)]
    .map((match) => htmlToText(match[1]));
  const description = sections.join(' ').trim() || structured.description;
  const experienceText = description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
  const applyUrl = decodeHtml(html.match(/href=["']([^"']*(?:apply\.deshawindia\.com|\/recruit\/jobs\/)[^"']*)["']/i)?.[1] || '') || structured.applyUrl;

  if (!employerJobId || !title || !location || !description || !applyUrl) {
    throw new Error('Missing required D. E. Shaw job fields');
  }
  return { employerJobId, title, location, description, experienceText, jobCategory, applyUrl };
}

function parseDeshawJobPosting(html: string): {
  title: string;
  location: string;
  description: string;
  jobCategory: string;
  applyUrl: string;
} {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1].trim()) as Record<string, unknown>;
      if (value['@type'] !== 'JobPosting') continue;
      const address = value.jobLocation && typeof value.jobLocation === 'object'
        ? (value.jobLocation as Record<string, unknown>).address
        : null;
      const postalAddress = address && typeof address === 'object' ? address as Record<string, unknown> : null;
      const location = [postalAddress?.addressLocality, postalAddress?.addressRegion]
        .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
        .join(', ');
      return {
        title: typeof value.title === 'string' ? value.title.trim() : '',
        location: normalizeDetailLocation(location),
        description: typeof value.description === 'string' ? htmlToText(value.description) : '',
        jobCategory: typeof value.occupationalCategory === 'string' ? value.occupationalCategory.trim() : '',
        applyUrl: typeof value.url === 'string' && /\/recruit\/jobs\//i.test(value.url) ? value.url : '',
      };
    } catch {
      // Ignore malformed JSON-LD and continue with the rendered template.
    }
  }
  return { title: '', location: '', description: '', jobCategory: '', applyUrl: '' };
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'first-look-job-monitor/0.3 (+personal use)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function reportedCatalogTotal(html: string): number | null {
  const value = html.match(/\bViewing\s+\d+\s+of\s+([\d,]+)\s+Jobs\b/i)?.[1];
  return value ? Number(value.replace(/,/g, '')) : null;
}

function catalogCardCount(html: string): number {
  return [...html.matchAll(/<div\b[^>]*class=["']([^"']*)["'][^>]*>/gi)]
    .filter((match) => match[1].split(/\s+/).includes('job'))
    .length;
}

function normalizeCatalogLocation(value: string): string | null {
  if (!value) return null;
  const names: Record<string, string> = { HYD: 'Hyderabad', BLR: 'Bengaluru', GGM: 'Gurugram' };
  const cities = value.split('/').map((code) => names[code.trim()] || code.trim()).filter(Boolean);
  return cities.length > 0 ? `${cities.join(' / ')}, India` : null;
}

function normalizeDetailLocation(value: string): string {
  if (!value) return '';
  return /\bindia\b/i.test(value) ? value : `${value}, India`;
}

function classText(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const content = html.match(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1] || '';
  return htmlToText(content);
}

function attributeFromDocument(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(html.match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function firstAttribute(html: string, pattern: RegExp): string {
  return decodeHtml(html.match(pattern)?.[1] || '');
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
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
