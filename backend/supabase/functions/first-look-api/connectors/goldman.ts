import type { InventoryListing, JobFetch } from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';
import type { ConnectorRunRequest, HydratedSourceObservation } from '../types.ts';

const COMPANY = 'Goldman Sachs';
const CONNECTOR_ID = 'goldman-sachs-official-india';
const CONNECTOR_VERSION = 'goldman-v2';
const GRAPHQL_URL = 'https://api-higher.gs.com/gateway/api/v1/graphql';
const ROLE_BASE_URL = 'https://higher.gs.com/roles/';
const PAGE_SIZE = 20;
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 12_000_000;

const GET_ROLES_QUERY = `query GetRoles($searchQueryInput: RoleSearchQueryInput!) {
  roleSearch(searchQueryInput: $searchQueryInput) {
    totalCount
    items {
      roleId
      corporateTitle
      jobTitle
      jobFunction
      locations { primary state country city }
      status
      division
      skills
      jobType { code description }
      externalSource { sourceId }
      educationLevel
      startDate
      gradDegreeStartDate
      gradDegreeEndDate
    }
  }
}`;

type GoldmanRole = {
  roleId?: string;
  corporateTitle?: string;
  jobTitle?: string;
  jobFunction?: string;
  locations?: GoldmanLocation[];
  status?: string;
  division?: string;
  skills?: string[];
  jobType?: { code?: string; description?: string };
  externalSource?: { sourceId?: string };
  educationLevel?: string;
  startDate?: string;
  gradDegreeStartDate?: string;
  gradDegreeEndDate?: string;
};

type GoldmanLocation = {
  primary?: boolean;
  state?: string;
  country?: string;
  city?: string;
};

type GoldmanRoleDetail = GoldmanRole & {
  descriptionHtml?: string;
  applyActive?: boolean;
  externalSource?: {
    sourceId?: string;
    applyInExternalSource?: boolean;
    externalApplicationUrl?: string;
    secondarySourceId?: string;
  };
};

type GraphqlResponse = {
  data?: { roleSearch?: { totalCount?: number; items?: GoldmanRole[] } };
  errors?: Array<{ message?: string }>;
};

export function createGoldmanConnector(
  fetcher: JobFetch = fetch,
  scanGroup = 'goldman-reconcile',
): OfficialJobConnector {
  return {
    connectorId: CONNECTOR_ID,
    connectorVersion: CONNECTOR_VERSION,
    company: COMPANY,
    scanGroup,
    async enumerate() {
      return enumerateGoldman(fetcher);
    },
    async hydrate(listing) {
      const parsed = parseGoldmanJob(await fetchText(fetcher, listing.detailUrl), listing.detailUrl);
      return {
        connectorId: CONNECTOR_ID,
        sourceType: 'official_career',
        sourceName: 'Goldman Sachs Careers',
        sourceExternalId: listing.sourceExternalId,
        company: COMPANY,
        employerJobId: parsed.employerJobId,
        listingUrl: listing.detailUrl,
        detailUrl: listing.detailUrl,
        applyUrl: parsed.applyUrl,
        isOfficial: true,
        title: parsed.title,
        location: parsed.location,
        description: parsed.description,
        experienceText: parsed.experienceText,
        jobCategory: parsed.jobCategory,
        postedAt: parsed.postedAt,
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${CONNECTOR_VERSION}\u0000${parsed.title}\u0000${parsed.location}\u0000${parsed.description}`),
        rawMetadata: parsed.rawMetadata,
      } satisfies HydratedSourceObservation;
    },
  };
}

export async function enumerateGoldman(fetcher: JobFetch = fetch): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  let reportedTotal: number | null = null;
  let pagesFetched = 0;
  let pagesExpected: number | null = null;

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
    try {
      const response = await fetchGoldmanRoles(fetcher, pageNumber);
      const result = response.data?.roleSearch;
      if (!result) throw new Error('Goldman response did not contain roleSearch data');
      if (reportedTotal === null && typeof result.totalCount === 'number') {
        reportedTotal = result.totalCount;
        pagesExpected = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
      }
      const pageListings = (result.items || []).map(toInventoryListing).filter(Boolean) as InventoryListing[];
      listings.push(...pageListings);
      pagesFetched += 1;

      if (pageListings.length === 0 || (pagesExpected !== null && pageNumber + 1 >= pagesExpected)) break;
    } catch (error) {
      errors.push(`page ${pageNumber + 1}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500));
      break;
    }
  }

  const uniqueListings = uniqueBy(listings, (listing) => listing.sourceExternalId);
  if (pagesExpected === null) errors.push('Goldman response did not report totalCount');
  if (pagesExpected !== null && pagesFetched < pagesExpected) {
    errors.push(`Expected ${pagesExpected} pages but fetched ${pagesFetched}`);
  }
  if (reportedTotal !== null && uniqueListings.length !== reportedTotal) {
    errors.push(`Reported ${reportedTotal} listings but discovered ${uniqueListings.length}`);
  }
  if (pagesExpected !== null && pagesExpected >= MAX_PAGES && pagesFetched >= MAX_PAGES) {
    errors.push(`Pagination exceeded ${MAX_PAGES} pages`);
  }

  return {
    listings: uniqueListings,
    diagnostic: {
      status: errors.length === 0 ? 'complete' : pagesFetched === 0 ? 'failed' : 'partial',
      reportedTotal,
      pagesExpected,
      pagesFetched,
      errorSummaries: errors,
    },
  };
}

export function parseGoldmanJob(html: string, detailUrl: string) {
  const role = parseNextRole(html) || parseJsonLdRole(html);
  if (!role) throw new Error('Missing Goldman role payload');

  const employerJobId = role.externalSource?.sourceId || role.roleId?.match(/^([^_]+)/)?.[1] || detailUrl.match(/\/roles\/([^/?#]+)/i)?.[1] || '';
  const title = role.jobTitle?.trim() || '';
  const location = normalizeLocation(role.locations);
  const description = htmlToText(role.descriptionHtml || '');
  const applyUrl = role.externalSource?.externalApplicationUrl?.trim() || '';
  const jobCategory = role.jobFunction?.trim() || role.division?.trim() || '';
  const experienceText = description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|one\s*(?:-|to)\s*two\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';

  if (!employerJobId || !title || !location || !description || !/^https?:\/\//i.test(applyUrl)) {
    throw new Error('Missing required Goldman job fields or direct apply URL');
  }

  return {
    employerJobId,
    title,
    location,
    description,
    experienceText,
    jobCategory,
    postedAt: parsePostedDate(role.startDate),
    applyUrl,
    rawMetadata: {
      roleId: role.roleId || null,
      corporateTitle: role.corporateTitle || null,
      jobFunction: role.jobFunction || null,
      division: role.division || null,
      status: role.status || null,
      skills: role.skills || [],
      jobType: role.jobType || null,
      educationLevel: role.educationLevel || null,
      applyActive: role.applyActive ?? null,
      secondarySourceId: role.externalSource?.secondarySourceId || null,
    },
  };
}

async function fetchGoldmanRoles(fetcher: JobFetch, pageNumber: number): Promise<GraphqlResponse> {
  const body = JSON.stringify({
    operationName: 'GetRoles',
    query: GET_ROLES_QUERY,
    variables: {
      searchQueryInput: {
        page: { pageSize: PAGE_SIZE, pageNumber },
        sort: { sortStrategy: 'RELEVANCE', sortOrder: 'DESC' },
        filters: [{ filterCategoryType: 'LOCATION', filters: [{ filter: 'India', subFilters: [] }] }],
        experiences: ['PROFESSIONAL', 'EARLY_CAREER'],
        searchTerm: '',
      },
    },
  });
  const response = await fetcher(GRAPHQL_URL, {
    method: 'POST',
    signal: timeoutSignal(),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-higher-request-id': crypto.randomUUID(),
    },
    body,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  const parsed = JSON.parse(text) as GraphqlResponse;
  if (parsed.errors?.length) throw new Error(parsed.errors.map((error) => error.message || 'GraphQL error').join('; '));
  return parsed;
}

async function fetchText(fetcher: JobFetch, url: string): Promise<string> {
  const response = await fetcher(url, {
    signal: timeoutSignal(),
    headers: { 'User-Agent': 'first-look-job-monitor/0.4 (+personal use)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error(`Response exceeded ${MAX_BODY_BYTES} bytes`);
  return text;
}

function toInventoryListing(role: GoldmanRole): InventoryListing | null {
  const sourceExternalId = role.externalSource?.sourceId || role.roleId?.match(/^([^_]+)/)?.[1] || '';
  const title = role.jobTitle?.trim() || '';
  if (!sourceExternalId || !title) return null;
  const location = normalizeLocation(role.locations) || null;
  const category = role.jobFunction?.trim() || null;
  const department = role.division?.trim() || null;
  const detailUrl = `${ROLE_BASE_URL}${encodeURIComponent(sourceExternalId)}`;
  return {
    connectorId: CONNECTOR_ID,
    sourceExternalId,
    company: COMPANY,
    title,
    location,
    category,
    department,
    detailUrl,
    listingMetadataHash: hashText([sourceExternalId, title, location, category, department, detailUrl].join('\u0000')),
    rawMetadata: {
      roleId: role.roleId || null,
      corporateTitle: role.corporateTitle || null,
      status: role.status || null,
      skills: role.skills || [],
      jobType: role.jobType || null,
      locations: role.locations || [],
      educationLevel: role.educationLevel || null,
      startDate: role.startDate || null,
    },
  };
}

function parseNextRole(html: string): GoldmanRoleDetail | null {
  const script = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) return null;
  try {
    const data = JSON.parse(decodeHtml(script)) as { props?: { pageProps?: { role?: GoldmanRoleDetail } } };
    return data.props?.pageProps?.role || null;
  } catch {
    return null;
  }
}

function parseJsonLdRole(html: string): GoldmanRoleDetail | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1].trim()) as Record<string, unknown>;
      if (value['@type'] !== 'JobPosting') continue;
      const location = value.jobLocation && typeof value.jobLocation === 'object' ? value.jobLocation as Record<string, unknown> : {};
      const address = location.address && typeof location.address === 'object' ? location.address as Record<string, unknown> : {};
      return {
        roleId: typeof value.identifier === 'string' ? value.identifier : undefined,
        jobTitle: typeof value.title === 'string' ? value.title : undefined,
        descriptionHtml: typeof value.description === 'string' ? value.description : undefined,
        locations: [{
          city: typeof address.addressLocality === 'string' ? address.addressLocality : undefined,
          state: typeof address.addressRegion === 'string' ? address.addressRegion : undefined,
          country: typeof address.addressCountry === 'string' ? address.addressCountry : undefined,
        }],
        startDate: typeof value.datePosted === 'string' ? value.datePosted : undefined,
        externalSource: { externalApplicationUrl: typeof value.url === 'string' ? value.url : undefined },
      };
    } catch {
      // Continue to the next structured-data block.
    }
  }
  return null;
}

function normalizeLocation(locations: GoldmanLocation[] | undefined): string {
  const values = (locations || [])
    .slice()
    .sort((left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary)))
    .map((location) => [location.city, location.state, location.country].filter(Boolean).join(', '))
    .filter(Boolean);
  return [...new Set(values)].join(' / ');
}

function parsePostedDate(value: string | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' '))
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

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function uniqueBy<T>(values: T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = identity(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hashText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
