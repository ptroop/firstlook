import type { HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export type LeverConfig = {
  connectorId: string;
  company: string;
  sourceName: string;
  site: string;
};

type LeverJob = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;
  categories?: {
    location?: string;
    allLocations?: string[];
    team?: string;
    department?: string;
  };
  createdAt?: number;
  updatedAt?: number;
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 8_000_000;

export const PAYTM_LEVER_CONFIG: LeverConfig = {
  connectorId: 'paytm-official-india',
  company: 'Paytm',
  sourceName: 'Paytm Careers',
  site: 'paytm',
};

// Verified live 2026-08-07: careers.cred.club is Lever-hosted and
// api.lever.co/v0/postings/cred?mode=json returns 6 India postings.
export const CRED_LEVER_CONFIG: LeverConfig = {
  connectorId: 'cred-official-india',
  company: 'CRED',
  sourceName: 'CRED Careers',
  site: 'cred',
};

export function createLeverConnector(
  config: LeverConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-reconcile`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'lever-v1',
    company: config.company,
    scanGroup,
    async enumerate() {
      const jobs = await fetchJson(fetcher, `https://api.lever.co/v0/postings/${encodeURIComponent(config.site)}?mode=json`);
      const listings = (Array.isArray(jobs) ? jobs : [])
        .map((job) => toInventoryListing(job as LeverJob, config))
        .filter((listing): listing is InventoryListing => listing !== null);
      return {
        listings: uniqueBy(listings, (listing) => listing.sourceExternalId),
        diagnostic: {
          status: 'complete',
          reportedTotal: listings.length,
          pagesExpected: 1,
          pagesFetched: 1,
          errorSummaries: [],
        },
      } satisfies InventoryResult;
    },
    async hydrate(listing) {
      const job = await fetchJson(fetcher, `https://api.lever.co/v0/postings/${encodeURIComponent(config.site)}/${encodeURIComponent(listing.sourceExternalId)}?mode=json`) as LeverJob;
      const parsed = parseLeverJob(job, config);
      return {
        connectorId: config.connectorId,
        sourceType: 'official_career',
        sourceName: config.sourceName,
        sourceExternalId: listing.sourceExternalId,
        company: config.company,
        employerJobId: parsed.employerJobId,
        listingUrl: parsed.listingUrl,
        detailUrl: parsed.listingUrl,
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
        rawMetadata: {},
      } satisfies HydratedSourceObservation;
    },
  };
}

function toInventoryListing(job: LeverJob, config: LeverConfig): InventoryListing | null {
  const id = String(job.id ?? '').trim();
  const title = String(job.text ?? '').trim();
  const location = leverLocation(job);
  const detailUrl = String(job.hostedUrl ?? '').trim();
  if (!id || !title || !location || !/^https?:\/\//i.test(detailUrl) || !isIndia(location)) return null;
  return {
    connectorId: config.connectorId,
    sourceExternalId: id,
    company: config.company,
    title,
    location,
    category: String(job.categories?.department ?? job.categories?.team ?? '').trim() || null,
    department: String(job.categories?.department ?? '').trim() || null,
    detailUrl,
    listingMetadataHash: hashText([id, title, location, detailUrl, String(job.updatedAt ?? '')].join('\u0000')),
    rawMetadata: {},
  };
}

export function parseLeverJob(job: LeverJob, config: LeverConfig) {
  const employerJobId = String(job.id ?? '').trim();
  const title = String(job.text ?? '').trim();
  const location = leverLocation(job);
  const listingUrl = String(job.hostedUrl ?? '').trim();
  const applyUrl = String(job.applyUrl ?? '').trim();
  const description = String(job.descriptionPlain ?? htmlToText(String(job.description ?? ''))).trim();
  const experienceText = description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
  if (!employerJobId || !title || !location || !description || !/^https?:\/\//i.test(listingUrl) || !/^https?:\/\//i.test(applyUrl)) {
    throw new Error(`Missing required ${config.company} Lever job fields`);
  }
  return {
    employerJobId,
    title,
    location,
    description,
    listingUrl,
    applyUrl,
    experienceText,
    jobCategory: String(job.categories?.department ?? job.categories?.team ?? '').trim(),
    postedAt: parseDate(job.createdAt ?? job.updatedAt),
  };
}

function leverLocation(job: LeverJob): string {
  return [...new Set([job.categories?.location ?? '', ...(job.categories?.allLocations ?? [])].map(String).filter(Boolean))].join(', ');
}

function isIndia(location: string): boolean {
  return /\b(?:india|bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|delhi|noida|chennai|kolkata|coimbatore|ahmedabad|jaipur|kochi)\b/i.test(location);
}

async function fetchJson(fetcher: JobFetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)', Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  return JSON.parse(text);
}

function parseDate(value: number | undefined): string | null {
  const timestamp = typeof value === 'number' ? value : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function htmlToText(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => { const key = identity(value); if (seen.has(key)) return false; seen.add(key); return true; });
}

function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
