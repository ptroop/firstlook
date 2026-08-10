import type { ConnectorRunRequest, HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import { extractExperience, htmlToText } from './official-page.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export interface RippleHireConfig {
  companyName: string;
  connectorId: string;
  careerPageUrl: string;
  source: string;
}

export const HDFC_BANK_RIPPLEHIRE_CONFIG: RippleHireConfig = {
  companyName: 'HDFC Bank',
  connectorId: 'hdfc-bank-ripplehire-india',
  careerPageUrl: 'https://hdfcbank.ripplehire.com/candidate/careers',
  source: 'CAREERSITE',
};

export const AXIS_BANK_RIPPLEHIRE_CONFIG: RippleHireConfig = {
  companyName: 'Axis Bank',
  connectorId: 'axis-bank-ripplehire-india',
  careerPageUrl: 'https://axisbank.ripplehire.com/candidate/?token=WIXhCuz0XRZ7H0GZCwjJ&source=CAREERSITE',
  source: 'CAREERSITE',
};

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8_000_000;

interface RippleHireJob {
  jobSeq?: string | number;
  jobId?: string | number;
  jobTitle?: string;
  jobDesc?: string | null;
  jobLocation?: string | null;
  locations?: string | null;
  jobReqExp?: string | null;
  jobPostingDate?: string | null;
  jobStatus?: string | null;
  bussinessUnit?: string | null;
  jobPrimarySkills?: string | null;
  jobSecondarySkills?: string | null;
  [key: string]: unknown;
}

interface RippleHireSearchResponse {
  totalJobCount?: number | string;
  jobVoList?: RippleHireJob[];
}

export function createRippleHireConnector(
  config: RippleHireConfig,
  fetcher: JobFetch = fetch,
  runType: 'watch' | 'reconcile',
): OfficialJobConnector {
  const scanGroup = `${config.connectorId}-${runType}`;
  let access: RippleHireAccess | null = null;

  return {
    connectorId: config.connectorId,
    connectorVersion: 'ripplehire-v1',
    company: config.companyName,
    scanGroup,
    async enumerate() {
      access = await resolveAccess(fetcher, config);
      const listings: InventoryListing[] = [];
      const errors: string[] = [];
      const seen = new Set<string>();
      let total: number | null = null;
      let pagesFetched = 0;
      const maxPages = runType === 'watch' ? 5 : MAX_PAGES;

      for (let page = 0; page < maxPages; page += 1) {
        try {
          const result = await searchPage(fetcher, config, access, page);
          pagesFetched += 1;
          if (result.totalJobCount !== null) total = result.totalJobCount;
          for (const job of result.jobs) {
            const listing = toListing(job, config, access);
            if (listing && !seen.has(listing.sourceExternalId)) {
              seen.add(listing.sourceExternalId);
              listings.push(listing);
            }
          }
          if (result.jobs.length < PAGE_SIZE || (total !== null && listings.length >= total)) break;
        } catch (error) {
          errors.push(errorSummary(`page=${page}`, error));
          break;
        }
      }

      const pagesExpected = total === null ? null : Math.ceil(total / PAGE_SIZE);
      if (pagesExpected !== null && pagesFetched < pagesExpected && errors.length === 0) {
        errors.push(`Fetched ${pagesFetched} of ${pagesExpected} advertised RippleHire pages`);
      }
      const status = errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : 'complete';
      return {
        listings,
        diagnostic: {
          status,
          reportedTotal: total ?? listings.length,
          pagesExpected,
          pagesFetched,
          errorSummaries: errors,
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      const resolvedAccess = access ?? await resolveAccess(fetcher, config);
      const detail = await fetchJson<RippleHireDetailResponse>(fetcher, `${resolvedAccess.baseUrl}/candidate/candidatejobdetail?token=${encodeURIComponent(resolvedAccess.token)}&jobSeq=${encodeURIComponent(listing.sourceExternalId)}&source=${encodeURIComponent(resolvedAccess.source)}&lang=en`);
      const job = detail.jobVO || {};
      const title = stringValue(job.jobTitle) || listing.title;
      const location = stringValue(job.locations) || stringValue(job.jobLocation) || listing.location || '';
      const description = htmlToText(stringValue(job.jobDesc));
      if (!title || !location || !description) throw new Error(`Missing required ${config.companyName} RippleHire job fields`);
      const detailUrl = roleUrl(resolvedAccess, listing.sourceExternalId, 'detail');
      const applyUrl = roleUrl(resolvedAccess, listing.sourceExternalId, 'apply');
      const experienceText = stringValue(job.jobReqExp) || extractExperience(description);
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId: stringValue(job.jobId) || listing.sourceExternalId,
        listingUrl: detailUrl,
        detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description,
        experienceText,
        jobCategory: stringValue(job.bussinessUnit),
        postedAt: parseDate(stringValue(job.jobPostingDate)),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: {
          jobCode: stringValue(job.jobCode),
          primarySkills: stringValue(job.jobPrimarySkills),
          secondarySkills: stringValue(job.jobSecondarySkills),
        },
      } satisfies HydratedSourceObservation;
    },
  };
}

interface RippleHireAccess {
  baseUrl: string;
  token: string;
  source: string;
}

interface RippleHireDetailResponse {
  jobVO?: RippleHireJob;
}

async function resolveAccess(fetcher: JobFetch, config: RippleHireConfig): Promise<RippleHireAccess> {
  const page = await fetchText(fetcher, config.careerPageUrl);
  const pageUrl = new URL(config.careerPageUrl);
  const token = inputValue(page, 'token') || pageUrl.searchParams.get('token') || '';
  const source = inputValue(page, 'source') || pageUrl.searchParams.get('source') || config.source;
  if (!token || !source) throw new Error(`${config.companyName}: RippleHire page did not expose its public career token`);
  return { baseUrl: pageUrl.origin, token, source };
}

async function searchPage(fetcher: JobFetch, config: RippleHireConfig, access: RippleHireAccess, page: number) {
  const params = {
    page,
    search: '*:*',
    token: access.token,
    source: access.source,
    pagesize: PAGE_SIZE,
  };
  const form = new URLSearchParams({
    careerSiteUrlParams: JSON.stringify(params),
    lang: 'en',
  });
  const payload = await fetchJson<RippleHireSearchResponse>(fetcher, `${access.baseUrl}/candidate/candidatejobsearch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: form,
  });
  return {
    jobs: Array.isArray(payload.jobVoList) ? payload.jobVoList : [],
    totalJobCount: numberValue(payload.totalJobCount),
  };
}

function toListing(job: RippleHireJob, config: RippleHireConfig, access: RippleHireAccess): InventoryListing | null {
  const id = stringValue(job.jobSeq) || stringValue(job.jobId);
  const title = stringValue(job.jobTitle);
  const location = stringValue(job.locations) || stringValue(job.jobLocation) || 'India';
  if (!id || !title) return null;
  const detailUrl = roleUrl(access, id, 'detail');
  return {
    connectorId: config.connectorId,
    sourceExternalId: id,
    company: config.companyName,
    title,
    location,
    category: stringValue(job.bussinessUnit) || null,
    department: null,
    detailUrl,
    listingMetadataHash: hashText([id, title, location, stringValue(job.jobPostingDate), stringValue(job.jobReqExp)].join('\u0000')),
    rawMetadata: { job },
  };
}

function roleUrl(access: RippleHireAccess, jobSeq: string, action: 'detail' | 'apply'): string {
  const hash = action === 'apply' ? `apply/job/${encodeURIComponent(jobSeq)}` : `detail/job/${encodeURIComponent(jobSeq)}`;
  return `${access.baseUrl}/candidate/?token=${encodeURIComponent(access.token)}&source=${encodeURIComponent(access.source)}#${hash}`;
}

async function fetchText(fetcher: JobFetch, url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetcher(url, {
    ...init,
    signal: init.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)', Accept: 'text/html, application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`RippleHire fetch failed: HTTP ${response.status}`);
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  return text;
}

async function fetchJson<T>(fetcher: JobFetch, url: string, init: RequestInit = {}): Promise<T> {
  const text = await fetchText(fetcher, url, init);
  try { return JSON.parse(text) as T; } catch { throw new Error('RippleHire returned invalid JSON'); }
}

function inputValue(html: string, id: string): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<input\\b[^>]*\\bid=["']${escapedId}["'][^>]*\\bvalue=["']([^"']*)`, 'i'),
    new RegExp(`<input\\b[^>]*\\bvalue=["']([^"']*)["'][^>]*\\bid=["']${escapedId}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return '';
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringValue(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }

function parseDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function errorSummary(page: string, error: unknown): string {
  return `${page}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500);
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
