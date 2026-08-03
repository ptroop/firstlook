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

type CitiCategoryFacet = { id: string; slug: string };

export function createCitiConnector(
  fetcher: JobFetch = fetch,
  scanGroup = 'citi-reconcile',
): OfficialJobConnector {
  return {
    connectorId: 'citi-official-india',
    connectorVersion: 'citi-v5',
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
      const categories = request.runType === 'watch' ? [] : parseCitiCategoryFacets(firstHtml);
      const catalog = categories.length > 0
        ? await fetchCategoryPartitions(fetcher, categories, errorSummaries)
        : await fetchRootPages(fetcher, firstHtml, availablePages, request.runType, errorSummaries);

      const pagesExpected = catalog.pagesExpected;
      const pagesFetched = catalog.pagesFetched;
      const listings = uniqueBy(
        [firstHtml, ...catalog.bodies].flatMap((html) => parseCitiResultsPage(html, FIRST_PAGE_URL)),
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

export function parseCitiCategoryFacets(html: string): CitiCategoryFacet[] {
  const sectionStart = html.search(/<section\b[^>]*id=["']category-filters-section["'][^>]*>/i);
  if (sectionStart < 0) return [];
  const sectionEnd = html.indexOf('</section>', sectionStart);
  const section = html.slice(sectionStart, sectionEnd >= 0 ? sectionEnd + 10 : html.length);
  const facets: CitiCategoryFacet[] = [];
  for (const match of section.matchAll(/<input\b[^>]*>/gi)) {
    const input = match[0];
    if (!attribute(input, 'class').split(/\s+/).includes('filter-checkbox')) continue;
    const id = attribute(input, 'data-id');
    const name = attribute(input, 'data-display');
    if (!/^\d+$/.test(id) || !name) continue;
    facets.push({ id, slug: slugify(name) });
  }
  return uniqueBy(facets, (facet) => facet.id);
}

export function parseCitiJob(html: string, detailUrl: string) {
  const structured = parseCitiStructuredJob(html);
  const title = htmlToText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || structured.title;
  const employerJobId = valueAfterHeading(html, /^Job Req Id:?$/i) || structured.employerJobId;
  const location = valueAfterHeading(html, /^Location(?:\(s\))?:?$/i) || structured.location;
  const posted = valueAfterHeading(html, /^Posted:?$/i);
  const atsDescriptionHtml = contentFromClass(html, 'ats-description');
  const descriptionHtml = structured.descriptionHtml || atsDescriptionHtml;
  const description = htmlToText(descriptionHtml);
  const experienceText = [...descriptionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => htmlToText(match[1]))
    .find((text) => /\b(?:\d+\s*(?:-|–|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience|experience preferred)\b/i.test(text))
    || description.match(/[^.]*\b(?:\d+\s*(?:-|–|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience|experience preferred)\b[^.]*\.?/i)?.[0]?.trim()
    || '';
  const familyGroup = valueAfterHeading(atsDescriptionHtml, /^Job Family Group:?$/i);
  const family = valueAfterHeading(atsDescriptionHtml, /^Job Family:?$/i);
  const jobCategory = [familyGroup, family].filter(Boolean).join(' / ');
  const applyUrl = [...html.matchAll(/<a\b[^>]*>/gi)]
    .flatMap((match) => [attribute(match[0], 'data-apply-url'), attribute(match[0], 'href')])
    .find((href) => /^https:\/\/citi\.wd\d+\.myworkdayjobs\.com\/[^?#]+\/apply(?:[?#].*)?$/i.test(href))
    || '';

  if (!employerJobId || !title || !location || !description || !applyUrl) {
    const missing = [
      !employerJobId && 'employer job ID',
      !title && 'title',
      !location && 'location',
      !description && 'description',
      !applyUrl && 'apply URL',
    ].filter(Boolean).join(', ');
    throw new Error('Missing required Citi job fields: ' + missing);
  }
  return {
    employerJobId,
    title,
    location,
    description,
    experienceText,
    jobCategory,
    applyUrl,
    postedAt: parsePostedDate(posted) || parseStructuredPostedDate(structured.datePosted),
    detailUrl,
  };
}

function parseCitiStructuredJob(html: string) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const values = Array.isArray(parsed) ? parsed : [parsed];
      const posting = values.find((value) => value && typeof value === 'object' && value['@type'] === 'JobPosting');
      if (!posting) continue;
      const address = (Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation)?.address;
      return {
        title: typeof posting.title === 'string' ? posting.title.trim() : '',
        employerJobId: typeof posting.identifier === 'string'
          ? posting.identifier.trim()
          : typeof posting.identifier?.value === 'string' ? posting.identifier.value.trim() : '',
        location: address && typeof address === 'object'
          ? [address.addressLocality, address.addressRegion, address.addressCountry]
            .filter((value) => typeof value === 'string' && value.trim())
            .join(', ')
          : '',
        descriptionHtml: typeof posting.description === 'string' ? posting.description : '',
        datePosted: typeof posting.datePosted === 'string' ? posting.datePosted : '',
      };
    } catch {
      continue;
    }
  }
  return { title: '', employerJobId: '', location: '', descriptionHtml: '', datePosted: '' };
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

function inferredPageCount(html: string, pageOneUrl: string): number | null {
  const advertised = advertisedPageCount(html);
  if (advertised !== null) return advertised;
  const total = advertisedResultCount(html);
  const pageSize = parseCitiResultsPage(html, pageOneUrl).length;
  if (total === 0) return 1;
  return total !== null && pageSize > 0 ? Math.ceil(total / pageSize) : null;
}

function pageUrl(page: number): string {
  return `${CATALOG_ROOT}/${page}`;
}

async function fetchRootPages(
  fetcher: JobFetch,
  firstHtml: string,
  availablePages: number,
  runType: 'watch' | 'reconcile' | 'hydrate',
  errorSummaries: string[],
) {
  const requestedLimit = runType === 'watch' ? WATCH_PAGE_LIMIT : MAX_RECONCILE_PAGES;
  const pagesExpected = Math.min(availablePages, requestedLimit);
  if (runType !== 'watch' && availablePages > MAX_RECONCILE_PAGES) {
    errorSummaries.push(`Pagination exceeded ${MAX_RECONCILE_PAGES} pages`);
  }
  const bodies: Array<string | undefined> = Array.from({ length: pagesExpected });
  bodies[0] = firstHtml;
  await fetchNumberedPages(fetcher, Array.from({ length: Math.max(0, pagesExpected - 1) }, (_, index) => index + 2), pageUrl, bodies, errorSummaries);
  return { bodies: bodies.filter((body): body is string => Boolean(body)).slice(1), pagesExpected, pagesFetched: bodies.filter(Boolean).length };
}

async function fetchCategoryPartitions(
  fetcher: JobFetch,
  categories: CitiCategoryFacet[],
  errorSummaries: string[],
) {
  const firstPages: Array<string | undefined> = Array.from({ length: categories.length });
  await mapWithConcurrency(categories.map((category, index) => ({ category, index })), PAGE_CONCURRENCY, async ({ category, index }) => {
    const url = categoryPageUrl(category, 1);
    try {
      firstPages[index] = await fetchText(fetcher, url);
    } catch (error) {
      errorSummaries.push(errorSummary(url, error));
    }
  });

  const remaining = categories.flatMap((category, index) => {
    const html = firstPages[index];
    if (!html) return [];
    const url = categoryPageUrl(category, 1);
    const pages = inferredPageCount(html, url);
    if (pages === null) return [];
    if (pages > MAX_RECONCILE_PAGES) {
      errorSummaries.push(`${categoryPageUrl(category, 1)}: pagination exceeded ${MAX_RECONCILE_PAGES} pages`);
    }
    return Array.from({ length: Math.max(0, Math.min(pages, MAX_RECONCILE_PAGES) - 1) }, (_, offset) => ({ category, page: offset + 2 }));
  });
  const remainingBodies: Array<string | undefined> = Array.from({ length: remaining.length });
  await mapWithConcurrency(remaining.map((item, index) => ({ ...item, index })), PAGE_CONCURRENCY, async ({ category, page, index }) => {
    const url = categoryPageUrl(category, page);
    try {
      remainingBodies[index] = await fetchText(fetcher, url);
    } catch (error) {
      errorSummaries.push(errorSummary(url, error));
    }
  });
  return {
    bodies: [...firstPages, ...remainingBodies].filter((body): body is string => Boolean(body)),
    pagesExpected: 1 + categories.length + remaining.length,
    pagesFetched: 1 + firstPages.filter(Boolean).length + remainingBodies.filter(Boolean).length,
  };
}

async function fetchNumberedPages(
  fetcher: JobFetch,
  pages: number[],
  urlForPage: (page: number) => string,
  bodies: Array<string | undefined>,
  errorSummaries: string[],
) {
  await mapWithConcurrency(pages, PAGE_CONCURRENCY, async (page) => {
    const url = urlForPage(page);
    try {
      bodies[page - 1] = await fetchText(fetcher, url);
    } catch (error) {
      errorSummaries.push(errorSummary(url, error));
    }
  });
}

function categoryPageUrl(category: CitiCategoryFacet, page: number): string {
  return `https://jobs.citi.com/employment/india-${category.slug}-jobs/287/${category.id}/1269750/2/${page}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

function parseStructuredPostedDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toISOString() : null;
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
