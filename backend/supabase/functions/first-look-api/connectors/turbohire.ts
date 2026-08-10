import type { HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';
import { extractExperience, htmlToText } from './official-page.ts';

export interface TurboHireConfig {
  companyName: string;
  connectorId: string;
  jobsApiUrl: string;
  publicJobHost: string;
  careerPageUrl: string;
}

export const PINE_LABS_TURBOHIRE_CONFIG: TurboHireConfig = {
  companyName: 'Pine Labs',
  connectorId: 'pine-labs-firecrawl-india',
  jobsApiUrl: 'https://www.pinelabs.com/gateway/turbo-hire',
  publicJobHost: 'https://pinelabsgroup.turbohire.co',
  careerPageUrl: 'https://www.pinelabs.com/careers/open-jobs',
};

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 8_000_000;

interface TurboHireJob {
  JobId?: string | number;
  JobTitle?: string;
  Department?: string;
  Location?: unknown;
  JobType?: string;
  ApplyUrl?: string;
  Description?: string;
  JobDescription?: string;
  PostedDate?: string;
  [key: string]: unknown;
}

interface TurboHireResponse {
  Jobs?: TurboHireJob[];
  Total?: number | string;
  TotalJobs?: number | string;
  TotalCount?: number | string;
  [key: string]: unknown;
}

export function createTurboHireConnector(
  config: TurboHireConfig,
  fetcher: JobFetch = fetch,
  runType: 'watch' | 'reconcile',
  scanGroup = `${config.connectorId}-native-${runType}`,
): OfficialJobConnector {
  const access = { connectorId: config.connectorId };
  return {
    connectorId: config.connectorId,
    connectorVersion: 'turbohire-v1',
    company: config.companyName,
    scanGroup,
    async enumerate() {
      const listings: InventoryListing[] = [];
      const errors: string[] = [];
      const seen = new Set<string>();
      let total: number | null = null;
      let pagesFetched = 0;
      const maxPages = runType === 'watch' ? 10 : MAX_PAGES;

      for (let page = 0; page < maxPages; page += 1) {
        const skip = page * PAGE_SIZE;
        const url = config.jobsApiUrl;
        try {
          const result = await searchPage(fetcher, config, skip);
          pagesFetched += 1;
          total = numberValue(result.total) ?? total;
          for (const job of result.jobs) {
            const listing = toListing(job, config, access.connectorId);
            if (listing && !seen.has(listing.sourceExternalId)) {
              seen.add(listing.sourceExternalId);
              listings.push(listing);
            }
          }
          if (result.jobs.length < PAGE_SIZE || (total !== null && listings.length >= total)) break;
        } catch (error) {
          errors.push(errorSummary(`${url} skip=${skip}`, error));
          break;
        }
      }

      const pagesExpected = total === null ? null : Math.ceil(total / PAGE_SIZE);
      if (pagesExpected !== null && pagesFetched < pagesExpected && errors.length === 0) {
        errors.push(`Fetched ${pagesFetched} of ${pagesExpected} advertised ${config.companyName} pages`);
      }
      return {
        listings,
        diagnostic: {
          status: errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : listings.length > 0 ? 'complete' : 'anomalous',
          reportedTotal: total ?? listings.length,
          pagesExpected,
          pagesFetched,
          errorSummaries: errors.length > 0 ? errors : listings.length > 0 ? [] : [`${config.companyName}: TurboHire returned no roles`],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      const source = listing.rawMetadata as { job?: TurboHireJob } | undefined;
      const job = source?.job || {};
      let detailHtml = '';
      try {
        detailHtml = await fetchText(fetcher, listing.detailUrl, 'text/html');
      } catch {
        // The public Apply URL is still usable when TurboHire temporarily
        // blocks the detail shell. Keep the discovered role visible.
      }
      const title = stringValue(job.JobTitle) || extractHeading(detailHtml) || listing.title;
      const location = locationText(job.Location) || listing.location || 'India';
      const description = htmlToText(stringValue(job.Description) || stringValue(job.JobDescription) || extractDescription(detailHtml) || title);
      const applyUrl = stringValue(job.ApplyUrl) || listing.detailUrl;
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId: listing.sourceExternalId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: stringValue(job.Department),
        postedAt: parseDate(stringValue(job.PostedDate)),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: { platform: 'turbohire', jobType: stringValue(job.JobType) },
      } satisfies HydratedSourceObservation;
    },
  };
}

export function parseTurboHireResponse(payload: TurboHireResponse, config: TurboHireConfig): { jobs: TurboHireJob[]; total: number | null } {
  const jobs = Array.isArray(payload.Jobs) ? payload.Jobs : [];
  const total = numberValue(payload.Total) ?? numberValue(payload.TotalJobs) ?? numberValue(payload.TotalCount);
  return { jobs, total };
}

function toListing(job: TurboHireJob, config: TurboHireConfig, connectorId: string): InventoryListing | null {
  const id = stringValue(job.JobId);
  const title = stringValue(job.JobTitle);
  if (!id || !title) return null;
  const applyUrl = absoluteUrl(stringValue(job.ApplyUrl), config.publicJobHost) || `${config.publicJobHost}/job/publicjobs/${encodeURIComponent(id)}`;
  const location = locationText(job.Location) || 'India';
  return {
    connectorId,
    sourceExternalId: id,
    company: config.companyName,
    title,
    location,
    category: stringValue(job.Department) || null,
    department: stringValue(job.Department) || null,
    detailUrl: applyUrl,
    listingMetadataHash: hashText([id, title, location, stringValue(job.ApplyUrl), stringValue(job.JobType)].join('\u0000')),
    rawMetadata: { platform: 'turbohire', job },
  };
}

async function searchPage(fetcher: JobFetch, config: TurboHireConfig, skip: number) {
  const response = await fetcher(config.jobsApiUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://www.pinelabs.com',
      Referer: config.careerPageUrl,
      'User-Agent': 'first-look-job-monitor/1.0 (+personal use)',
    },
    body: JSON.stringify({
      Skip: skip,
      Top: PAGE_SIZE,
      SortBy: 'None',
      Filters: { Departments: [], Locations: [], JobTypes: [], SearchString: '' },
      GetFiltersData: true,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`TurboHire fetch failed: HTTP ${response.status}`);
  if (text.length > MAX_BODY_BYTES) throw new Error(`TurboHire response exceeded ${MAX_BODY_BYTES} bytes`);
  try {
    return parseTurboHireResponse(JSON.parse(text) as TurboHireResponse, config);
  } catch {
    throw new Error('TurboHire returned invalid JSON');
  }
}

async function fetchText(fetcher: JobFetch, url: string, accept: string): Promise<string> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: accept, 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)' },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`TurboHire detail fetch failed: HTTP ${response.status}`);
  if (text.length > MAX_BODY_BYTES) throw new Error(`TurboHire response exceeded ${MAX_BODY_BYTES} bytes`);
  return text;
}

function extractHeading(html: string): string {
  return htmlToText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function extractDescription(html: string): string {
  const block = html.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1]
    || html.match(/(?:job-description|description)[^>]*>([\s\S]{0,20000})<\//i)?.[1]
    || '';
  return htmlToText(block).slice(0, 20_000);
}

function locationText(value: unknown): string {
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.Address, record.City, record.State, record.Country, record.Location].map(locationText).filter(Boolean).join(', ');
  }
  const text = stringValue(value);
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== value) return locationText(parsed);
  } catch { /* plain location text */ }
  return text.replace(/[\[\]{}"']/g, '').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value: string, baseUrl: string): string {
  try { return value ? new URL(value, baseUrl).href : ''; } catch { return ''; }
}

function stringValue(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function numberValue(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function parseDate(value: string): string | null { const timestamp = Date.parse(value); return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString(); }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
function errorSummary(url: string, error: unknown): string { return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500); }
