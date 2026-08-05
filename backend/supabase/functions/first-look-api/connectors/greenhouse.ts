import type { HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

type GreenhouseConfig = {
  connectorId: string;
  company: string;
  sourceName: string;
  boardSlug: string;
};

type GreenhouseJob = {
  id?: number | string;
  internal_job_id?: number | string;
  requisition_id?: string | null;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  metadata?: Array<{ name?: string; value?: string | string[] }>;
  content?: string;
  first_published?: string | null;
  updated_at?: string | null;
  departments?: Array<{ name?: string }>;
};

type GreenhouseResponse = { jobs?: GreenhouseJob[] };

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 8_000_000;

export const RAZORPAY_CONFIG: GreenhouseConfig = {
  connectorId: 'razorpay-official-india',
  company: 'Razorpay',
  sourceName: 'Razorpay Careers',
  boardSlug: 'razorpaysoftwareprivatelimited',
};

export const GROWW_CONFIG: GreenhouseConfig = {
  connectorId: 'groww-official-india',
  company: 'Groww',
  sourceName: 'Groww Careers',
  boardSlug: 'groww',
};

export const PHONEPE_CONFIG: GreenhouseConfig = {
  connectorId: 'phonepe-official-india',
  company: 'PhonePe',
  sourceName: 'PhonePe Careers',
  boardSlug: 'phonepe',
};

export function createGreenhouseConnector(
  config: GreenhouseConfig,
  fetcher: JobFetch = fetch,
  scanGroup = `${config.connectorId}-reconcile`,
): OfficialJobConnector {
  return {
    connectorId: config.connectorId,
    connectorVersion: 'greenhouse-v1',
    company: config.company,
    scanGroup,
    async enumerate() {
      const jobs = await fetchJson(fetcher, `https://boards-api.greenhouse.io/v1/boards/${config.boardSlug}/jobs?content=false`);
      const listings = (jobs.jobs ?? [])
        .map((job) => toInventoryListing(job, config))
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
      const detailApiUrl = `https://boards-api.greenhouse.io/v1/boards/${config.boardSlug}/jobs/${encodeURIComponent(listing.sourceExternalId)}?content=true`;
      const job = await fetchJson(fetcher, detailApiUrl) as GreenhouseJob;
      const parsed = parseGreenhouseJob(job, config);
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
        rawMetadata: { requisitionId: parsed.requisitionId },
      } satisfies HydratedSourceObservation;
    },
  };
}

function toInventoryListing(job: GreenhouseJob, config: GreenhouseConfig): InventoryListing | null {
  const id = String(job.id ?? '').trim();
  const title = String(job.title ?? '').trim();
  const detailUrl = String(job.absolute_url ?? '').trim();
  const location = greenhouseLocation(job);
  if (!id || !title || !/^https?:\/\//i.test(detailUrl) || !isIndia(location)) return null;
  const detailApiUrl = `https://boards-api.greenhouse.io/v1/boards/${config.boardSlug}/jobs/${encodeURIComponent(id)}?content=true`;
  return {
    connectorId: config.connectorId,
    sourceExternalId: id,
    company: config.company,
    title,
    location,
    category: greenhouseMetadata(job, 'Department') || null,
    department: greenhouseMetadata(job, 'Department') || null,
    detailUrl,
    listingMetadataHash: hashText([id, title, location, detailUrl, String(job.updated_at ?? '')].join('\u0000')),
    rawMetadata: { detailApiUrl, requisitionId: job.requisition_id ?? null },
  };
}

export function parseGreenhouseJob(job: GreenhouseJob, config: GreenhouseConfig) {
  const employerJobId = String(job.requisition_id ?? job.id ?? '').trim();
  const title = String(job.title ?? '').trim();
  const location = greenhouseLocation(job);
  const description = htmlToText(String(job.content ?? ''));
  const listingUrl = String(job.absolute_url ?? '').trim();
  const experienceText = description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
  if (!employerJobId || !title || !location || !description || !/^https?:\/\//i.test(listingUrl)) {
    throw new Error(`Missing required ${config.company} Greenhouse job fields`);
  }
  return {
    employerJobId,
    requisitionId: job.requisition_id ?? null,
    title,
    location,
    description,
    listingUrl,
    applyUrl: listingUrl,
    experienceText,
    jobCategory: greenhouseMetadata(job, 'Department') || greenhouseMetadata(job, 'Team') || '',
    postedAt: parseDate(job.first_published ?? job.updated_at),
  };
}

async function fetchJson(fetcher: JobFetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'first-look-job-monitor/0.6 (+personal use)', Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  return JSON.parse(text);
}

function greenhouseLocation(job: GreenhouseJob): string {
  const metadata = (job.metadata ?? [])
    .filter((item) => /location/i.test(String(item.name ?? '')))
    .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value ?? ''])
    .map(String);
  return [...new Set([job.location?.name ?? '', ...metadata].filter(Boolean))].join(', ');
}

function greenhouseMetadata(job: GreenhouseJob, name: string): string {
  const item = (job.metadata ?? []).find((entry) => String(entry.name ?? '').toLowerCase() === name.toLowerCase());
  return Array.isArray(item?.value) ? item.value.join(', ') : String(item?.value ?? '');
}

function isIndia(location: string): boolean {
  return /\b(?:india|bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|delhi|noida|chennai)\b/i.test(location);
}

function parseDate(value: string | null | undefined): string | null {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number.parseInt(d, 10)));
}

function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => { const key = identity(value); if (seen.has(key)) return false; seen.add(key); return true; });
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
