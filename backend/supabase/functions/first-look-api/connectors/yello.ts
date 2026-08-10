import type { HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export interface YelloConfig {
  companyName: string;
  connectorIdPrefix: string;
  boardId: string;
  boardHost?: string;
  connectorId?: string;
}

// Verified live 2026-08-07: EY's careers site (careers.ey.com and
// ey.com/en_in/careers) embeds this Yello job board. The search endpoint
// returns JSON { html } with search-results__req_title anchors, and detail
// pages expose the title, description and an /external/requisitions apply URL.
// This is quota-free (no Firecrawl credits needed) and India-filtered via the
// location=India search parameter.
export const EY_GDS_YELLO_CONFIG: YelloConfig = {
  companyName: 'EY GDS',
  connectorIdPrefix: 'ey-gds',
  boardId: 'c1riT--B2O-KySgYWsZO1Q',
};

export const KEARNEY_YELLO_CONFIG: YelloConfig = {
  companyName: 'Kearney',
  connectorIdPrefix: 'kearney',
  boardId: '1',
  boardHost: 'kearney.recsolu.com',
  connectorId: 'kearney-firecrawl-india',
};

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8_000_000;
const MAX_PAGES = 20;
const PER_PAGE = 50;

export function createYelloConnector(
  config: YelloConfig,
  fetcher: JobFetch = fetch,
  runType: 'watch' | 'reconcile',
  scanGroup = `${config.connectorIdPrefix}-${runType}`,
): OfficialJobConnector {
  const connectorId = config.connectorId || `${config.connectorIdPrefix}-official-india`;
  return {
    connectorId,
    connectorVersion: 'yello-v1',
    company: config.companyName,
    scanGroup,
    async enumerate() {
      const listings: InventoryListing[] = [];
      const errors: string[] = [];
      let pagesFetched = 0;
      let total = 0;

      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const url = `${boardUrl(config)}/search?query=&location=India&per_page=${PER_PAGE}&page=${page}`;
        try {
          const data = await fetchJson(fetcher, url);
          const html = String(data.html ?? '');
          const pageJobs = parseSearchHtml(html, config, connectorId);
          total += pageJobs.length;
          listings.push(...pageJobs);
          pagesFetched += 1;
          if (pageJobs.length === 0 || pageJobs.length < PER_PAGE) break;
        } catch (error) {
          errors.push(errorSummary(url, error));
          break;
        }
      }

      if (pagesFetched === 0) {
        return {
          listings: [],
          diagnostic: {
            status: 'failed',
            reportedTotal: null,
            pagesExpected: null,
            pagesFetched: 0,
            errorSummaries: errors.length > 0 ? errors : [`${config.companyName}: Yello search returned no pages`],
          },
        } satisfies InventoryResult;
      }
      return {
        listings,
        diagnostic: {
          status: errors.length > 0 ? 'partial' : 'complete',
          reportedTotal: total,
          pagesExpected: total === 0 ? null : Math.ceil(total / PER_PAGE),
          pagesFetched,
          errorSummaries: errors,
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      const html = await fetchHtml(fetcher, listing.detailUrl);
      const title = html.match(/class="[^"]*details-top__title[^"]*"[^>]*>([\s\S]{0,160}?)<\/h1>/i)?.[1]
        || html.match(/<h1[^>]*>([\s\S]{0,160}?)<\/h1>/i)?.[1]
        || listing.title;
      const cleanTitle = htmlToText(title);
      const description = extractDescription(html) || listing.title;
      const applyUrl = extractApplyUrl(html, listing.detailUrl);
      if (!cleanTitle || !description || !applyUrl) {
        throw new Error(`Missing required ${config.companyName} Yello job fields`);
      }
      const location = extractLocation(html) || listing.location || 'India';
      const reqId = listing.sourceExternalId;

      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId: reqId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
        isOfficial: true,
        title: cleanTitle,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: '',
        postedAt: null,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${cleanTitle}\u0000${location}\u0000${description}`),
        rawMetadata: { discoveryMethod: 'yello-search' },
      } satisfies HydratedSourceObservation;
    },
  };
}

function boardUrl(config: YelloConfig): string {
  return `https://${config.boardHost || 'eyglobal.yello.co'}/job_boards/${config.boardId}`;
}

function parseSearchHtml(html: string, config: YelloConfig, connectorId: string): InventoryListing[] {
  const listings: InventoryListing[] = [];
  const hrefRegex = /class="[^"]*search-results__req_title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,160}?)<\/a>/gi;
  for (const match of html.matchAll(hrefRegex)) {
    const href = decodeHtmlEntities(match[1]);
    const title = htmlToText(match[2]);
    const detailUrl = new URL(href, boardUrl(config)).href;
    const externalId = detailUrl.split('/').filter(Boolean).pop()?.split('?')[0] ?? '';
    if (!externalId || !title || !/^https?:\/\//i.test(detailUrl)) continue;
    listings.push({
      connectorId,
      sourceExternalId: externalId,
      company: config.companyName,
      title,
      location: null,
      category: null,
      department: null,
      detailUrl,
      listingMetadataHash: hashText([externalId, title, detailUrl].join('\u0000')),
      rawMetadata: {},
    });
  }
  return listings;
}

function extractDescription(html: string): string {
  const block = html.match(/class="[^"]*job-details__description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1]
    || html.match(/id="[^"]*(?:description|job-description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || '';
  if (block) return htmlToText(block).slice(0, 20_000);
  return htmlToText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).slice(0, 20_000);
}

function extractApplyUrl(html: string, detailUrl: string): string | null {
  const relative = html.match(/href="(\/external\/requisitions\/[^"?#]+[^"]*)"/i)?.[1]
    || html.match(/class="[^"]*btn-apply[^"]*"[^>]*href="([^"]+)"/i)?.[1]
    || html.match(/href="([^"]*(?:apply|submit)[^"]*)"/i)?.[1];
  if (!relative) return null;
  const url = new URL(relative, detailUrl).href;
  return /^https?:\/\//i.test(url) ? url : null;
}

function extractLocation(html: string): string {
  const text = htmlToText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
  const city = text.match(/location[^a-z]{0,20}([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*,?\s*(India|IN)?/i)?.[1]
    || text.match(/(?:Bengaluru|Bangalore|Gurugram|Gurgaon|Mumbai|Pune|Hyderabad|Noida|Chennai|Kolkata|Kochi|Ahmedabad|Jaipur)(?:\s*,\s*(?:India|IN))?/i)?.[0]
    || '';
  return city || 'India';
}

async function fetchJson(fetcher: JobFetch, url: string): Promise<Record<string, any>> {
  // The search endpoint is JSON; requesting HTML here would break the parser.
  const text = await fetchText(fetcher, url, 'application/json');
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    throw new Error('Yello search returned invalid JSON');
  }
}

async function fetchHtml(fetcher: JobFetch, url: string): Promise<string> {
  // Detail pages return an empty JSON object {} if the client advertises JSON;
  // they must be fetched as text/html to receive the rendered posting.
  return fetchText(fetcher, url, 'text/html');
}

async function fetchText(fetcher: JobFetch, url: string, accept: string): Promise<string> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)', Accept: accept },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Yello fetch failed: HTTP ${response.status}`);
  if (text.length > MAX_BODY_BYTES) throw new Error(`Yello response exceeded ${MAX_BODY_BYTES} bytes`);
  return text;
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<\/?[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function extractExperience(description: string): string {
  return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function errorSummary(url: string, error: unknown): string {
  return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500);
}
