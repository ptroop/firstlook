import type { ConnectorRunRequest, HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

const API_URL = 'https://careers.spglobal.com/api/jobs?location=India&page=';
const PUBLIC_URL = 'https://careers.spglobal.com/jobs/';
const PAGE_SIZE = 20;
const MAX_PAGES = 50;

export function createSpGlobalConnector(fetcher: JobFetch = fetch, runType: 'watch' | 'reconcile'): OfficialJobConnector {
  const connectorId = 'sp-global-official-india';
  return {
    connectorId,
    connectorVersion: 'spglobal-jibe-v1',
    scanGroup: `${connectorId}-${runType}`,
    company: 'S&P Global',
    async enumerate() {
      return enumerateJobs(fetcher, connectorId);
    },
    async hydrate(listing) {
      const html = await fetchText(fetcher, listing.detailUrl);
      const job = parseEmbeddedJob(html);
      const title = stringValue(job.title) || listing.title;
      const description = htmlToText(stringValue(job.description));
      const location = stringValue(job.full_location) || listing.location || '';
      const applyUrl = stringValue(job.apply_url);
      if (!title || !description || !location || !applyUrl) throw new Error('S&P Global role page did not expose complete job fields');
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: 'S&P Global Careers',
        sourceExternalId: listing.sourceExternalId,
        company: 'S&P Global',
        employerJobId: stringValue(job.req_id) || listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: Array.isArray(job.categories) ? job.categories.map((item: any) => stringValue(item?.name)).filter(Boolean).join(' / ') : '',
        postedAt: parsePostedDate(stringValue(job.posted_date)),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: { ats: stringValue(job.ats_code), reqId: stringValue(job.req_id) },
      } satisfies HydratedSourceObservation;
    },
  };
}

async function enumerateJobs(fetcher: JobFetch, connectorId: string): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let total: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${API_URL}${page}`;
    try {
      const payload = JSON.parse(await fetchText(fetcher, url)) as Record<string, any>;
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      total = numberValue(payload.totalCount) ?? total;
      for (const wrapper of jobs) {
        const job = wrapper?.data;
        if (!job || typeof job !== 'object') continue;
        const id = stringValue(job.req_id) || stringValue(job.slug);
        const slug = stringValue(job.slug) || id;
        const title = stringValue(job.title);
        const location = stringValue(job.full_location) || [job.city, job.state, job.country].map(stringValue).filter(Boolean).join(', ');
        if (!id || !slug || !title || !location || !/\bindia\b/i.test(location) || seen.has(id)) continue;
        seen.add(id);
        listings.push({
          connectorId,
          sourceExternalId: id,
          company: 'S&P Global',
          title,
          location,
          category: Array.isArray(job.categories) ? job.categories.map((item: any) => stringValue(item?.name)).filter(Boolean).join(' / ') : null,
          department: null,
          detailUrl: `${PUBLIC_URL}${encodeURIComponent(slug)}`,
          listingMetadataHash: hashText(`${id}\u0000${title}\u0000${location}\u0000${stringValue(job.posted_date)}`),
          rawMetadata: {},
        });
      }
      if (jobs.length === 0 || (total !== null && page * PAGE_SIZE >= total)) break;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500));
      break;
    }
  }

  const pagesExpected = total === null ? null : Math.ceil(total / PAGE_SIZE);
  if (total !== null && listings.length === 0) errors.push('S&P Global API returned no India listings');
  return {
    listings,
    diagnostic: {
      status: errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : 'complete',
      reportedTotal: total,
      pagesExpected,
      pagesFetched: Math.min(MAX_PAGES, Math.max(1, Math.ceil(listings.length / PAGE_SIZE))),
      errorSummaries: errors,
    },
  };
}

function parseEmbeddedJob(html: string): Record<string, any> {
  const config = html.match(/window\.jobDescriptionConfig\s*=\s*(\{[\s\S]*?\});\s*(?:var|<\/script>)/i)?.[1];
  if (config) {
    try {
      const parsed = JSON.parse(config);
      if (parsed?.job && typeof parsed.job === 'object') return parsed.job;
    } catch (_error) { /* fall through to structured metadata */ }
  }
  const jsonLd = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (jsonLd) {
    try { return JSON.parse(jsonLd); } catch (_error) { /* malformed structured data */ }
  }
  return {};
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const response = await fetcher(url, { headers: { Accept: 'application/json,text/html', 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)' }, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return text;
}

function htmlToText(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/g, (_m, decimal) => String.fromCodePoint(Number(decimal))).replace(/\s+/g, ' ').trim();
}

function extractExperience(description: string): string { return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || ''; }
function parsePostedDate(value: string): string | null { const time = Date.parse(value); return Number.isNaN(time) ? null : new Date(time).toISOString(); }
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
