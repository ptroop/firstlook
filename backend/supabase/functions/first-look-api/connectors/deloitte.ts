import type { ConnectorRunRequest, HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

const SEARCH_BASE = 'https://southasiacareers.deloitte.com/go/Deloitte-India/718244/';
const PAGE_SIZE = 25;
const MAX_WATCH_PAGES = 5;
const MAX_RECONCILE_PAGES = 100;

export function createDeloitteConnector(fetcher: JobFetch = fetch, runType: 'watch' | 'reconcile'): OfficialJobConnector {
  // Preserve the existing scheduled/watchdog identity while replacing the generic scraper.
  const connectorId = 'deloitte-firecrawl-india';
  return {
    connectorId,
    connectorVersion: 'deloitte-successfactors-v1',
    scanGroup: `${connectorId}-${runType}`,
    company: 'Deloitte',
    async enumerate() { return enumerateJobs(fetcher, connectorId, runType); },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const title = extractText(html, /itemprop="title"[^>]*>([\s\S]*?)<\/span>/i) || listing.title;
      const location = extractAttribute(html, 'streetAddress') || listing.location || '';
      const descriptionHtml = html.match(/data-careersite-propertyid="description"[^>]*>[\s\S]*?<span class="jobdescription">([\s\S]*?)<\/span>\s*<\/span>/i)?.[1] || '';
      const description = htmlToText(descriptionHtml);
      const applyPath = html.match(/class="[^"]*apply[^\"]*"[^>]*href="([^"]+)"/i)?.[1] || '';
      const applyUrl = applyPath ? new URL(decodeHtml(applyPath), listing.detailUrl).href : '';
      if (!title || !location || !description || !applyUrl) throw new Error('Deloitte role page did not expose complete job fields');
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: 'Deloitte Careers',
        sourceExternalId: listing.sourceExternalId,
        company: 'Deloitte',
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: listing.category || '',
        postedAt: parsePostedDate(extractAttribute(html, 'datePosted')),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: { source: 'successfactors' },
      } satisfies HydratedSourceObservation;
    },
  };
}

async function enumerateJobs(fetcher: JobFetch, connectorId: string, runType: 'watch' | 'reconcile'): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  const maxPages = runType === 'watch' ? MAX_WATCH_PAGES : MAX_RECONCILE_PAGES;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * PAGE_SIZE;
    const url = page === 0 ? SEARCH_BASE : `${SEARCH_BASE}${offset}/?q=&sortColumn=referencedate&sortDirection=desc`;
    try {
      const html = await fetchText(fetcher, url);
      const totalMatch = html.match(/Results\s+\d+\s+to\s+\d+\s+of\s+([\d,]+)/i);
      if (totalMatch) total = Number(totalMatch[1].replace(/,/g, ''));
      const rows = [...html.matchAll(/<tr class="data-row">([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
      pagesFetched += 1;
      for (const row of rows) {
        const href = row.match(/href="([^"]*\/job\/[^"?]+)"/i)?.[1];
        const title = extractText(row, /class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/i);
        const location = extractText(row, /class="jobLocation"[^>]*>([\s\S]*?)<\/span>/i);
        const posted = extractText(row, /class="jobDate"[^>]*>([\s\S]*?)<\/span>/i);
        if (!href || !title || !location || !/\b(?:india|in)\b/i.test(location)) continue;
        const detailUrl = new URL(decodeHtml(href), SEARCH_BASE).href;
        const id = detailUrl.match(/\/(\d+)\/?$/)?.[1] || detailUrl;
        if (seen.has(id)) continue;
        seen.add(id);
        listings.push({
          connectorId,
          sourceExternalId: id,
          company: 'Deloitte',
          title,
          location,
          category: null,
          department: null,
          detailUrl,
          listingMetadataHash: hashText(`${id}\u0000${title}\u0000${location}\u0000${posted}`),
          rawMetadata: { posted },
        });
      }
      if (rows.length === 0 || (total !== null && (page + 1) * PAGE_SIZE >= total)) break;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500));
      break;
    }
  }

  const fullPages = total === null ? null : Math.ceil(total / PAGE_SIZE);
  const pagesExpected = fullPages === null ? null : Math.min(fullPages, maxPages);
  if (fullPages !== null && runType === 'reconcile' && pagesFetched < fullPages && errors.length === 0) errors.push(`Fetched ${pagesFetched} of ${fullPages} Deloitte pages`);
  if (listings.length === 0 && errors.length === 0) errors.push('Deloitte search returned no India job rows');
  return {
    listings,
    diagnostic: {
      status: errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : 'complete',
      reportedTotal: total,
      pagesExpected,
      pagesFetched,
      errorSummaries: errors,
    },
  };
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const response = await fetcher(url, { headers: { Accept: 'text/html', 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)' }, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return text;
}

function extractText(html: string, pattern: RegExp): string { return htmlToText(html.match(pattern)?.[1] || ''); }
function extractAttribute(html: string, name: string): string { return decodeHtml(html.match(new RegExp(`<meta[^>]+itemprop=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] || ''); }
function htmlToText(value: string): string { return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function decodeHtml(value: string): string { return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' '); }
function extractExperience(description: string): string { return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || ''; }
function parsePostedDate(value: string): string | null { const time = Date.parse(value); return Number.isNaN(time) ? null : new Date(time).toISOString(); }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
