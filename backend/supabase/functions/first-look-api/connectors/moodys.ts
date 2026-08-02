import { classifyJob } from '../filters.ts';
import type {
  ConnectorDiagnostic,
  ConnectorResult,
  ExclusionReason,
  JobFetch,
  NormalizedJob
} from '../types.ts';

const COMPANY = "Moody's";
const INDIA_SEARCH_URL = 'https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/1';
const REQUEST_TIMEOUT_MS = 12_000;
const DETAIL_CONCURRENCY = 4;

export function discoverMoodysPages(html: string, baseUrl: string): string[] {
  const urls = [baseUrl];
  const pattern = /href=["']([^"']*\/en\/location\/india-jobs\/49841\/1269750\/2\/\d+[^"']*)["']/gi;
  for (const match of html.matchAll(pattern)) urls.push(new URL(decodeHtml(match[1]), baseUrl).href);
  return unique(urls).sort((left, right) => pageNumber(left) - pageNumber(right));
}

export function discoverMoodysJobUrls(html: string, baseUrl: string): string[] {
  const results = html.match(/<ul[^>]+id=["']search-results-jobs["'][^>]*>[\s\S]*?<\/ul>/i)?.[0] || '';
  const urls: string[] = [];
  for (const match of results.matchAll(/href=["']([^"']*\/en\/job\/[^"'#?]+)["']/gi)) {
    urls.push(new URL(decodeHtml(match[1]), baseUrl).href);
  }
  return unique(urls);
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
    const pages = discoverMoodysPages(firstHtml, INDIA_SEARCH_URL);
    const pageHtml = [firstHtml];

    for (const pageUrl of pages.slice(1)) {
      try {
        pageHtml.push(await fetchText(fetcher, pageUrl));
      } catch (_error) {
        requestErrors += 1;
      }
    }

    const detailUrls = unique(pageHtml.flatMap((html) => discoverMoodysJobUrls(html, INDIA_SEARCH_URL)));
    discoveredCount = detailUrls.length;

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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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
