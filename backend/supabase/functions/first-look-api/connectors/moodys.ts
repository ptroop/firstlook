import { classifyJob } from '../filters.ts';
import type {
  ConnectorDiagnostic,
  ConnectorResult,
  ExclusionReason,
  JobFetch,
  InventoryListing,
  NormalizedJob
} from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';

const COMPANY = "Moody's";
const INDIA_SEARCH_URL = 'https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/1';
const REQUEST_TIMEOUT_MS = 12_000;
const DETAIL_CONCURRENCY = 4;
const MAX_SEARCH_PAGES = 20;

export function createMoodysConnector(
  fetcher: JobFetch = fetch,
  scanGroup = 'moodys-reconcile',
): OfficialJobConnector {
  return {
    connectorId: 'moodys-official-india',
    connectorVersion: 'moodys-v2',
    company: COMPANY,
    scanGroup,
    async enumerate() {
      const pageHtml: string[] = [];
      const knownPages = new Set<string>([INDIA_SEARCH_URL]);
      const pendingPages = [INDIA_SEARCH_URL];
      const errorSummaries: string[] = [];
      let reportedTotal: number | null = null;

      while (pendingPages.length > 0 && pageHtml.length < MAX_SEARCH_PAGES) {
        const pageUrl = pendingPages.shift() as string;
        try {
          const html = await fetchText(fetcher, pageUrl);
          pageHtml.push(html);
          if (reportedTotal === null) reportedTotal = advertisedResultCount(html);
          for (const discovered of discoverMoodysPages(html, pageUrl)) {
            if (!knownPages.has(discovered)) {
              knownPages.add(discovered);
              pendingPages.push(discovered);
            }
          }
        } catch (error) {
          errorSummaries.push(`${pageUrl}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500));
        }
      }

      if (pendingPages.length > 0) errorSummaries.push(`Pagination exceeded ${MAX_SEARCH_PAGES} pages`);
      const listings = uniqueBy(
        pageHtml.flatMap((html) => parseMoodysInventoryPage(html, INDIA_SEARCH_URL)),
        (listing) => listing.sourceExternalId,
      );
      if (reportedTotal !== null && listings.length !== reportedTotal) {
        errorSummaries.push(`Reported ${reportedTotal} listings but discovered ${listings.length}`);
      }
      const complete = errorSummaries.length === 0 && pageHtml.length === knownPages.size;
      return {
        listings,
        diagnostic: {
          status: complete ? 'complete' : 'partial',
          reportedTotal,
          pagesExpected: knownPages.size,
          pagesFetched: pageHtml.length,
          errorSummaries,
        },
      };
    },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const parsed = parseMoodysJob(html, listing.detailUrl);
      return {
        connectorId: 'moodys-official-india',
        sourceType: 'official_career',
        sourceName: "Moody's Careers",
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
        rawMetadata: { employerJobId: parsed.employerJobId },
      };
    },
  };
}

export function discoverMoodysPages(html: string, baseUrl: string): string[] {
  const urls = [baseUrl];
  const pattern = /href=["']([^"']*\/en\/location\/india-jobs\/49841\/1269750\/2\/\d+[^"']*)["']/gi;
  for (const match of html.matchAll(pattern)) urls.push(new URL(decodeHtml(match[1]), baseUrl).href);
  return unique(urls).sort((left, right) => pageNumber(left) - pageNumber(right));
}

export function discoverMoodysJobUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const anchor = match[0];
    const classes = attribute(anchor, 'class').split(/\s+/);
    const href = attribute(anchor, 'href');
    if (classes.includes('search-results-list__job-link') && /\/en\/job\//i.test(href)) {
      urls.push(new URL(href, baseUrl).href);
    }
  }
  return unique(urls);
}

export function parseMoodysInventoryPage(html: string, baseUrl: string): InventoryListing[] {
  const listings: InventoryListing[] = [];
  const pattern = /<a\b[^>]*class=["'][^"']*search-results-list__job-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const anchor = match[0];
    const href = attribute(anchor, 'href');
    if (!href || !/\/en\/job\//i.test(href)) continue;
    const detailUrl = new URL(href, baseUrl).href;
    const sourceExternalId = attribute(anchor, 'data-job-id') || detailUrl.match(/\/(\d+)\/?$/)?.[1] || '';
    const title = htmlToText(match[1]);
    if (!sourceExternalId || !title) continue;
    const start = match.index ?? 0;
    const nextAnchor = html.indexOf('search-results-list__job-link', start + anchor.length);
    const card = html.slice(start, nextAnchor >= 0 ? nextAnchor : Math.min(html.length, start + 1_500));
    const location = classText(card, 'search-results-list__job-info-list') || null;
    const category = attribute(anchor, 'data-category') || null;
    const department = attribute(anchor, 'data-department') || null;
    listings.push({
      connectorId: 'moodys-official-india',
      sourceExternalId,
      company: COMPANY,
      title,
      location,
      category,
      department,
      detailUrl,
      listingMetadataHash: hashText([title, location, category, department, detailUrl].join('\u0000')),
      rawMetadata: { searchUrl: baseUrl },
    });
  }
  return uniqueBy(listings, (listing) => listing.sourceExternalId);
}

export function parseMoodysJob(html: string, detailUrl: string): NormalizedJob {
  const section = html.match(/<section[^>]+class=["'][^"']*job-description[^"']*["'][^>]*>[\s\S]*?<\/section>/i)?.[0];
  if (!section) throw new Error('Missing job description');

  const employerJobId = classText(section, 'job-detail-job-reference');
  const title = classText(section, 'job-description__heading');
  const location = classText(section, 'job-description__job-location-info');
  const jobCategory = classText(section, 'job-detail-job-category');
  const applyUrl = attribute(section, 'data-apply-url') || applyHref(section);
  const descriptionHtml = classHtml(section, 'ats-description');
  const description = htmlToText(descriptionHtml);
  const experienceText = [...descriptionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => htmlToText(match[1]))
    .find((text) => /\b(?:years?|fresher|entry[- ]level)\b/i.test(text)) || '';

  if (!employerJobId || !title || !location || !applyUrl) throw new Error('Missing required job fields');

  return {
    id: `moodys_${employerJobId}`,
    employerJobId,
    company: COMPANY,
    sourceUrl: detailUrl,
    applyUrl,
    title,
    location,
    description,
    experienceText,
    jobCategory,
    postedAt: parsePostedDate(classText(section, 'job-detail-posted'))
  };
}

export async function runMoodysConnector(fetcher: JobFetch = fetch): Promise<ConnectorResult> {
  const startedAt = new Date().toISOString();
  const excluded: ConnectorDiagnostic['excluded'] = {};
  const jobs: NormalizedJob[] = [];
  let discoveredCount = 0;
  let fetchedCount = 0;
  let requestErrors = 0;

  try {
    const firstHtml = await fetchText(fetcher, INDIA_SEARCH_URL);
    const pageHtml = [firstHtml];
    const visitedPages = new Set([INDIA_SEARCH_URL]);
    const pendingPages = discoverMoodysPages(firstHtml, INDIA_SEARCH_URL).filter((url) => !visitedPages.has(url));

    while (pendingPages.length > 0 && visitedPages.size < MAX_SEARCH_PAGES) {
      const pageUrl = pendingPages.shift() as string;
      if (visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);
      try {
        const html = await fetchText(fetcher, pageUrl);
        pageHtml.push(html);
        for (const discoveredPage of discoverMoodysPages(html, pageUrl)) {
          if (!visitedPages.has(discoveredPage) && !pendingPages.includes(discoveredPage)) pendingPages.push(discoveredPage);
        }
      } catch (_error) {
        requestErrors += 1;
      }
    }

    const detailUrls = unique(pageHtml.flatMap((html) => discoverMoodysJobUrls(html, INDIA_SEARCH_URL)));
    discoveredCount = detailUrls.length;
    const advertisedCount = advertisedResultCount(firstHtml);
    if (advertisedCount !== null && discoveredCount < advertisedCount) requestErrors += 1;

    await mapWithConcurrency(detailUrls, DETAIL_CONCURRENCY, async (detailUrl) => {
      try {
        const detailHtml = await fetchText(fetcher, detailUrl);
        fetchedCount += 1;
        const job = parseMoodysJob(detailHtml, detailUrl);
        const classification = classifyJob(job);
        if (classification === 'match') jobs.push(job);
        else increment(excluded, classification);
      } catch (_error) {
        requestErrors += 1;
        increment(excluded, 'malformed');
      }
    });

    const status = requestErrors > 0 ? 'partial' : 'success';
    return {
      jobs,
      diagnostic: {
        company: COMPANY,
        status,
        discoveredCount,
        fetchedCount,
        matchingCount: jobs.length,
        excluded,
        errorMessage: requestErrors > 0 ? `${requestErrors} Moody's request or parse operation failed` : null,
        startedAt,
        finishedAt: new Date().toISOString()
      }
    };
  } catch (_error) {
    return {
      jobs: [],
      diagnostic: {
        company: COMPANY,
        status: 'failed',
        discoveredCount,
        fetchedCount,
        matchingCount: 0,
        excluded,
        errorMessage: "Moody's search request failed",
        startedAt,
        finishedAt: new Date().toISOString()
      }
    };
  }
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'first-look-job-monitor/0.2 (+personal use)' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function classHtml(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<([a-z0-9]+)[^>]+class=["'](?:[^"']*\\s)?${escaped}(?=\\s|["'])[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'))?.[2] || '';
}

function classText(html: string, className: string): string {
  return htmlToText(classHtml(html, className));
}

function attribute(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = html.match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '';
  return decodeHtml(value);
}

function applyHref(html: string): string {
  const anchor = html.match(/<a[^>]+class=["'][^"']*job-apply[^"']*["'][^>]*>/i)?.[0] || '';
  return attribute(anchor, 'href');
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
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

function parsePostedDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]))).toISOString();
}

function pageNumber(url: string): number {
  return Number(url.match(/\/(\d+)\/?$/)?.[1] || 1);
}

function advertisedResultCount(html: string): number | null {
  const value = html.match(/data-results-count=["'](\d+)["']/i)?.[1]
    || html.match(/\b([\d,]+)\s+jobs?\s+found\s+in\s+India\b/i)?.[1];
  return value ? Number(value.replace(/,/g, '')) : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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

function increment(target: ConnectorDiagnostic['excluded'], reason: ExclusionReason | 'malformed') {
  target[reason] = (target[reason] || 0) + 1;
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
