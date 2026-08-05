import type { ConnectorRunRequest, HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

const SEARCH_BASE = 'https://jobs.siemens.com/en_US/externaljobs/SearchJobs/';
const PAGE_SIZE = 6;
const MAX_WATCH_PAGES = 5;
const MAX_RECONCILE_PAGES = 300;

export function createSiemensConnector(fetcher: JobFetch = fetch, runType: 'watch' | 'reconcile'): OfficialJobConnector {
  const connectorId = 'siemens-official-india';
  return {
    connectorId,
    connectorVersion: 'siemens-avature-v1',
    scanGroup: `${connectorId}-${runType}`,
    company: 'Siemens',
    async enumerate() { return enumerateJobs(fetcher, connectorId, runType); },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const title = extractAttribute(html, 'og:title') || listing.title;
      const location = html.match(/class="list-item-jobCountry"[^>]*>\s*([^<]+)/i)?.[1]
        ? extractText(html.match(/class="article__content__view__field tf_locations"[\s\S]*?<div class="article__content__view__field__value">([\s\S]*?)<\/div>/i)?.[1] || '')
        : listing.location || '';
      const sectionDescription = html.match(/<div class="article__content" id="section1__content"[\s\S]*?<div class="article__content__view__field__value">([\s\S]*?)<\/div>/i)?.[1] || '';
      const valueBlocks = [...html.matchAll(/class="article__content__view__field__value"[^>]*>([\s\S]*?)<\/div>/gi)].map((match) => match[1]);
      const descriptionHtml = sectionDescription || valueBlocks.sort((left, right) => right.length - left.length)[0] || '';
      const description = htmlToText(descriptionHtml);
      const applyUrl = html.match(/<a[^>]+class="[^"]*button--hero[^"]*"[^>]+href="([^"]+)"/i)?.[1] || '';
      const posted = extractField(html, 'Posted since');
      if (!title || !location || !description || !applyUrl) throw new Error('Siemens role page did not expose complete job fields');
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: 'Siemens Careers',
        sourceExternalId: listing.sourceExternalId,
        company: 'Siemens',
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: new URL(decodeHtml(applyUrl), listing.detailUrl).href,
        isOfficial: true,
        title,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: listing.category || '',
        postedAt: parsePostedDate(posted),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: { portal: 'avature' },
      } satisfies HydratedSourceObservation;
    },
  };
}

async function enumerateJobs(fetcher: JobFetch, connectorId: string, runType: 'watch' | 'reconcile'): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const maxPages = runType === 'watch' ? MAX_WATCH_PAGES : MAX_RECONCILE_PAGES;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * PAGE_SIZE;
    const url = page === 0 ? SEARCH_BASE : `${SEARCH_BASE}?folderRecordsPerPage=${PAGE_SIZE}&folderOffset=${offset}`;
    try {
      const html = await fetchText(fetcher, url);
      const articles = [...html.matchAll(/<article class="article article--result[^>]*>([\s\S]*?)<\/article>/gi)].map((match) => match[1]);
      pagesFetched += 1;
      for (const article of articles) {
        const id = article.match(/\/JobDetail\/(\d+)/i)?.[1] || '';
        const title = extractText(article.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
        const location = extractText(article.match(/class="list-item-location"[\s\S]*?<\/span>\s*<\/span>/i)?.[0] || article.match(/class="list-item-jobCountry"[^>]*>([\s\S]*?)<\/span>/i)?.[0] || '');
        const category = extractText(article.match(/class="list-item-family"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
        if (!id || !title || !location || !/\bindia\b/i.test(location) || seen.has(id)) continue;
        seen.add(id);
        const detailUrl = `https://jobs.siemens.com/en_US/externaljobs/JobDetail/${id}`;
        listings.push({
          connectorId,
          sourceExternalId: id,
          company: 'Siemens',
          title,
          location,
          category: category || null,
          department: null,
          detailUrl,
          listingMetadataHash: hashText(`${id}\u0000${title}\u0000${location}`),
          rawMetadata: {},
        });
      }
      if (articles.length === 0 || !/paginationNextLink/i.test(html)) break;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500));
      break;
    }
  }

  if (listings.length === 0 && errors.length === 0) errors.push('Siemens search returned no India job rows');
  return {
    listings,
    diagnostic: {
      status: errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : 'complete',
      reportedTotal: null,
      pagesExpected: null,
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

function extractField(html: string, label: string): string { return htmlToText(html.match(new RegExp(`field__label[^>]*>\\s*${label}[\\s\\S]*?field__value[^>]*>([\\s\\S]*?)<\\/div>`, 'i'))?.[1] || ''); }
function extractAttribute(html: string, name: string): string { return decodeHtml(html.match(new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] || ''); }
function extractText(value: string): string { return htmlToText(value); }
function htmlToText(value: string): string { return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function decodeHtml(value: string): string { return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;|&#160;/gi, ' '); }
function extractExperience(description: string): string { return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || ''; }
function parsePostedDate(value: string): string | null { const time = Date.parse(value); return Number.isNaN(time) ? null : new Date(time).toISOString(); }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
