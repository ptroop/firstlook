import type { ConnectorRunRequest, HydratedSourceObservation, InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

const AMAZON_API_BASE = 'https://www.amazon.jobs/en/search.json?loc_query=India';
const AMAZON_PUBLIC_BASE = 'https://www.amazon.jobs';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export function createAmazonConnector(fetcher: JobFetch = fetch, runType: 'watch' | 'reconcile'): OfficialJobConnector {
  const connectorId = 'amazon-official-india';
  return {
    connectorId,
    connectorVersion: 'amazon-jobs-v1',
    scanGroup: `${connectorId}-${runType}`,
    company: 'Amazon',
    async enumerate(request) {
      return enumerateAmazon(fetcher, connectorId, runType, request);
    },
    async hydrate(listing) {
      const raw = listing.rawMetadata || {};
      const title = listing.title;
      const location = listing.location;
      const description = stringValue(raw.description) || stringValue(raw.basic_qualifications) || title;
      const applyUrl = stringValue(raw.url_next_step) || `${AMAZON_PUBLIC_BASE}${listing.sourceExternalId}/apply`;
      const detailUrl = listing.detailUrl || `${AMAZON_PUBLIC_BASE}${listing.sourceExternalId}`;

      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: 'Amazon Careers',
        sourceExternalId: listing.sourceExternalId,
        company: 'Amazon',
        employerJobId: stringValue(raw.id_icims) || stringValue(raw.id) || listing.sourceExternalId,
        listingUrl: detailUrl,
        detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description: cleanDescription(description),
        experienceText: extractExperience(description),
        jobCategory: stringValue(raw.job_category),
        postedAt: parsePostedDate(stringValue(raw.posted_date)),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: raw,
      } satisfies HydratedSourceObservation;
    },
  };
}

async function enumerateAmazon(
  fetcher: JobFetch,
  connectorId: string,
  runType: 'watch' | 'reconcile',
  _request?: ConnectorRunRequest,
): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  const maxPages = runType === 'watch' ? 5 : MAX_PAGES;

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * PAGE_SIZE;
    const url = `${AMAZON_API_BASE}&result_limit=${PAGE_SIZE}&offset=${offset}`;
    try {
      const response = await fetcher(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!response.ok) throw new Error(`Amazon API returned ${response.status}`);
      const data = await response.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      if (data?.hits && typeof data.hits === 'number') total = data.hits;

      if (jobs.length === 0) break;

      for (const job of jobs) {
        const path = stringValue(job.job_path) || stringValue(job.id);
        const title = stringValue(job.title);
        const location = stringValue(job.normalized_location) || stringValue(job.location) || 'India';
        if (!path || !title || seen.has(path)) continue;
        seen.add(path);

        const fullUrl = path.startsWith('http') ? path : `${AMAZON_PUBLIC_BASE}${path}`;

        listings.push({
          connectorId,
          sourceExternalId: path,
          company: 'Amazon',
          title,
          location,
          category: stringValue(job.job_category),
          department: stringValue(job.job_family),
          detailUrl: fullUrl,
          listingMetadataHash: hashText(`${path}\u0000${title}\u0000${location}`),
          rawMetadata: job,
        });
      }

      if (jobs.length < PAGE_SIZE) break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Amazon fetch failed');
      break;
    }
  }

  return {
    listings,
    diagnostic: {
      status: errors.length > 0 ? (listings.length > 0 ? 'partial' : 'failed') : 'complete',
      reportedTotal: total ?? listings.length,
      pagesExpected: total ? Math.ceil(total / PAGE_SIZE) : 1,
      pagesFetched: Math.ceil(listings.length / PAGE_SIZE),
      errorSummaries: errors,
    },
  };
}

function cleanDescription(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function extractExperience(text: string): string {
  return text.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
}

function parsePostedDate(value: string): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
