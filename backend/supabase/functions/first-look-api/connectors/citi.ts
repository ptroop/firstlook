import type { InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';

const COMPANY = 'Citi';
const CATALOG_ROOT = 'https://jobs.citi.com/location/india-jobs/287/1269750/2';
const FIRST_PAGE_URL = `${CATALOG_ROOT}/1`;
const WATCH_PAGE_LIMIT = 5;
const MAX_RECONCILE_PAGES = 100;
const PAGE_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_500_000;

export function createCitiConnector(
  fetcher: JobFetch = fetch,
  scanGroup = 'citi-reconcile',
): OfficialJobConnector {
  return {
    connectorId: 'citi-official-india',
    connectorVersion: 'citi-v1',
    company: COMPANY,
    scanGroup,
    async enumerate(request) {
      const errorSummaries: string[] = [];
      let firstHtml: string;
      try {
        firstHtml = await fetchText(fetcher, FIRST_PAGE_URL);
      } catch (error) {
        return {
          listings: [],
          diagnostic: {
            status: 'failed',
            reportedTotal: null,
            pagesExpected: 1,
            pagesFetched: 0,
            errorSummaries: [errorSummary(FIRST_PAGE_URL, error)],
          },
        };
      }

      const reportedTotal = advertisedResultCount(firstHtml);
      const advertisedPages = advertisedPageCount(firstHtml);
      if (reportedTotal === null) errorSummaries.push('Catalog did not expose a reported total');
      if (advertisedPages === null) errorSummaries.push('Catalog did not expose a page count');

      const availablePages = advertisedPages ?? 1;
      const requestedLimit = request.runType === 'watch' ? WATCH_PAGE_LIMIT : MAX_RECONCILE_PAGES;
      const pagesExpected = Math.min(availablePages, requestedLimit);
      if (request.runType !== 'watch' && availablePages > MAX_RECONCILE_PAGES) {
        errorSummaries.push(`Pagination exceeded ${MAX_RECONCILE_PAGES} pages`);
      }

      const pageBodies: Array<string | undefined> = Array.from({ length: pagesExpected });
      pageBodies[0] = firstHtml;
      await mapWithConcurrency(
        Array.from({ length: Math.max(0, pagesExpected - 1) }, (_, index) => index + 2),
        PAGE_CONCURRENCY,
        async (page) => {
          const url = pageUrl(page);
          try {
            pageBodies[page - 1] = await fetchText(fetcher, url);
          } catch (error) {
            errorSummaries.push(errorSummary(url, error));
          }
        },
      );

      const pagesFetched = pageBodies.filter(Boolean).length;
      const listings = uniqueBy(
        pageBodies.flatMap((html) => html ? parseCitiResultsPage(html, FIRST_PAGE_URL) : []),
        (listing) => listing.sourceExternalId,
      );
      if (request.runType !== 'watch' && reportedTotal !== null && listings.length !== reportedTotal) {
        errorSummaries.push(`Reported ${reportedTotal} listings but discovered ${listings.length}`);
      }
      if (pagesFetched !== pagesExpected) {
        errorSummaries.push(`Fetched ${pagesFetched} of ${pagesExpected} expected pages`);
      }

      return {
        listings,
        diagnostic: {
          status: errorSummaries.length === 0 ? 'complete' : 'partial',
          reportedTotal,
          pagesExpected,
          pagesFetched,
          errorSummaries,
        },
      };
    },
    async hydrate(listing) {
      const parsed = parseCitiJob(await fetchText(fetcher, listing.detailUrl), listing.detailUrl);
      return {
        connectorId: 'citi-official-india',
        sourceType: 'official_career',
        sourceName: 'Citi Careers',
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
        postedAt: parsed.postedAt,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${parsed.title}\u0000${parsed.location}\u0000${parsed.description}`),
        rawMetadata: {
          employerJobId: parsed.employerJobId,
          workMode: listing.rawMetadata.workMode ?? null,
        },
      };
    },
  };
}

export function parseCitiResultsPage(html: string, baseUrl: string): InventoryListing[] {
  const listings: InventoryListing[] = [];
  for (const match of html.matchAll(/<li\b[^>]*class=["'][^"']*\bsr-job-item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const card = match[1];
    const anchor = card.match(/<a\b[^>]*class=["'][^"']*\bsr-job-item__link\b[^"']*["'][^>]*>[\s\S]*?<\/a>/i)?.[0] || '';
    const href = attribute(anchor, 'href');
    if (!href || !/\/job\//i.test(href)) continue;
    const detailUrl = new URL(href, baseUrl).href;
    const sourceExternalId = attribute(anchor, 'data-job-id') || detailUrl.match(/\/287\/(\d+)\/?$/)?.[1] || '';
    const title = htmlToText(anchor.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, ''));
    const location = classText(card, 'sr-job-location') || null;
    const workMode = classText(card, 'sr-job-type') || null;
    if (!sourceExternalId || !title) continue;
    listings.push({
      connectorId: 'citi-official-india',
      sourceExternalId,
      company: COMPANY,
      title,
      location,
      category: null,
      department: null,
      detailUrl,
      listingMetadataHash: hashText([sourceExternalId, title, location, workMode, detailUrl].join('\u0000')),
      rawMetadata: { workMode },
    });
  }
  return uniqueBy(listings, (listing) => listing.sourceExternalId);
}

export function parseCitiJob(html: string, detailUrl: string) {
  const title = htmlToText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const employerJobId = valueAfterHeading(html, /^Job Req Id:?$/i);
  const location = valueAfterHeading(html, /^Location:?$/i);
  const posted = valueAfterHeading(html, /^Posted:?$/i);
  const descriptionHtml = contentFromClass(html, 'ats-description');
  const description = htmlToText(descriptionHtml);
  const experienceText = [...descriptionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => htmlToText(match[1]))
    .find((text) => /\b(?:\d+\s*(?:-|–|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience|experience preferred)\b/i.test(text))
    || description.match(/[^.]*\b(?:\d+\s*(?:-|–|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience|experience preferred)\b[^.]*\.?/i)?.[0]?.trim()
    || '';
  const familyGroup = valueAfterHeading(descriptionHtml, /^Job Family Group:?$/i);
  const family = valueAfterHeading(descriptionHtml, /^Job Family:?$/i);
  const jobCategory = [familyGroup, family].filter(Boolean).join(' / ');
  const applyUrl = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]))
    .find((href) => /^https:\/\/citi\.wd\d+\.myworkdayjobs\.com\/[^?#]+\/apply(?:[?#].*)?$/i.test(href))
    || '';

  if (!employerJobId || !title || !location || !description || !applyUrl) {
    throw new Error('Missing required Citi job fields');
  }
  return {
    employerJobId,
    title,
    location,
    description,
    experienceText,
    jobCategory,
    applyUrl,
    postedAt: parsePostedDate(posted),
    detailUrl,
  };
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

function advertisedResultCount(html: string): number | null {
  const value = html.match(/\b([\d,]+)\s+Jobs?\s+in\s+India\b/i)?.[1];
  return value ? Number(value.replace(/,/g, '')) : null;
}

function advertisedPageCount(html: string): number | null {
  const value = html.match(/currently\s+on\s+page\s+\d+\s*\/\s*(\d+)/i)?.[1];
  return value ? Number(value) : null;
}

function pageUrl(page: number): string {
  return `${CATALOG_ROOT}/${page}`;
}

function valueAfterHeading(html: string, label: RegExp): string {
  for (const heading of html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    if (!label.test(htmlToText(heading[1]))) continue;
    const after = html.slice((heading.index ?? 0) + heading[0].length);
    const paragraph = after.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    if (paragraph !== undefined) return htmlToText(paragraph);
    return htmlToText(after.match(/^\s*([^<]+)/)?.[1] || '');
  }
  return '';
}

function contentFromClass(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opening = new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>`, 'i').exec(html);
  if (!opening) return '';
  const start = (opening.index ?? 0) + opening[0].length;
  const boundary = html.slice(start).search(/<\/(?:main|body)>/i);
  return html.slice(start, boundary >= 0 ? start + boundary : Math.min(html.length, start + 500_000));
}

function classText(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return htmlToText(html.match(new RegExp(`<[^>]+class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\/[^>]+>`, 'i'))?.[1] || '');
}

function attribute(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(html.match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function parsePostedDate(value: string): string | null {
  const match = value.match(/^([A-Za-z]{3})\.?\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2]))).toISOString();
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

function errorSummary(url: string, error: unknown): string {
  return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500);
}

async function mapWithConcurrency<T>(values: T[], concurrency: number, operation: (value: T) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const value = values[nextIndex];
      nextIndex += 1;
      await operation(value);
    }
  });
  await Promise.all(workers);
}
