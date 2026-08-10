import type {
  ConnectorRunRequest,
  HydratedSourceObservation,
  InventoryListing,
  JobFetch,
} from '../types.ts';
import type { OfficialJobConnector, InventoryResult } from './contract.ts';

export interface WorkdayConfig {
  companyName: string;
  baseUrl: string;
  tenant: string;
  siteName: string;
  connectorIdPrefix: string;
}

// Verified live 2026-08-06 against the public CXS endpoints: each of these
// returns HTTP 200 with { total, jobPostings }. The earlier tenant/site values
// returned 404/422 and were silently dropping whole companies from the feed.
export const ACCENTURE_CONFIG: WorkdayConfig = { companyName: 'Accenture', baseUrl: 'https://accenture.wd103.myworkdayjobs.com/AccentureCareers', tenant: 'accenture', siteName: 'AccentureCareers', connectorIdPrefix: 'accenture' };
export const PWC_CONFIG: WorkdayConfig = { companyName: 'PwC', baseUrl: 'https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers', tenant: 'pwc', siteName: 'Global_Experienced_Careers', connectorIdPrefix: 'pwc' };
export const WELLS_FARGO_CONFIG: WorkdayConfig = { companyName: 'Wells Fargo', baseUrl: 'https://wf.wd1.myworkdayjobs.com/WellsFargoJobs', tenant: 'wf', siteName: 'WellsFargoJobs', connectorIdPrefix: 'wells-fargo' };
export const DEUTSCHE_BANK_CONFIG: WorkdayConfig = { companyName: 'Deutsche Bank', baseUrl: 'https://db.wd3.myworkdayjobs.com/DBWebsite', tenant: 'db', siteName: 'DBWebsite', connectorIdPrefix: 'deutsche-bank' };
export const BANK_OF_AMERICA_CONFIG: WorkdayConfig = { companyName: 'Bank of America', baseUrl: 'https://ghr.wd1.myworkdayjobs.com/lateral-ba_continuum', tenant: 'ghr', siteName: 'lateral-ba_continuum', connectorIdPrefix: 'bank-of-america' };
export const NATWEST_CONFIG: WorkdayConfig = { companyName: 'NatWest', baseUrl: 'https://rbs.wd3.myworkdayjobs.com/RBS', tenant: 'rbs', siteName: 'RBS', connectorIdPrefix: 'natwest' };
export const FIDELITY_CONFIG: WorkdayConfig = { companyName: 'Fidelity', baseUrl: 'https://fmr.wd1.myworkdayjobs.com/FidelityCareers', tenant: 'fmr', siteName: 'FidelityCareers', connectorIdPrefix: 'fidelity' };
export const GE_HEALTHCARE_CONFIG: WorkdayConfig = { companyName: 'GE HealthCare', baseUrl: 'https://gehc.wd5.myworkdayjobs.com/GEHC_ExternalSite', tenant: 'gehc', siteName: 'GEHC_ExternalSite', connectorIdPrefix: 'ge-healthcare' };
export const DIAGEO_CONFIG: WorkdayConfig = { companyName: 'Diageo', baseUrl: 'https://diageo.wd3.myworkdayjobs.com/Diageo_Careers', tenant: 'diageo', siteName: 'Diageo_Careers', connectorIdPrefix: 'diageo' };
export const SP_GLOBAL_CONFIG: WorkdayConfig = { companyName: 'S&P Global', baseUrl: 'https://spglobal.wd5.myworkdayjobs.com/SPGlobal_Careers', tenant: 'spglobal', siteName: 'SPGlobal_Careers', connectorIdPrefix: 'sp-global' };
export const MORNINGSTAR_CONFIG: WorkdayConfig = { companyName: 'Morningstar', baseUrl: 'https://morningstar.wd5.myworkdayjobs.com/morningstar', tenant: 'morningstar', siteName: 'morningstar', connectorIdPrefix: 'morningstar' };
export const MORGAN_STANLEY_CONFIG: WorkdayConfig = { companyName: 'Morgan Stanley', baseUrl: 'https://ms.wd5.myworkdayjobs.com/External', tenant: 'ms', siteName: 'External', connectorIdPrefix: 'morgan-stanley' };
export const PAYPAL_CONFIG: WorkdayConfig = { companyName: 'PayPal', baseUrl: 'https://paypal.wd1.myworkdayjobs.com/jobs', tenant: 'paypal', siteName: 'jobs', connectorIdPrefix: 'paypal' };
export const SHELL_CONFIG: WorkdayConfig = { companyName: 'Shell', baseUrl: 'https://shell.wd3.myworkdayjobs.com/ShellCareers', tenant: 'shell', siteName: 'ShellCareers', connectorIdPrefix: 'shell' };
export const SIEMENS_CONFIG: WorkdayConfig = { companyName: 'Siemens', baseUrl: 'https://siemens.wd3.myworkdayjobs.com/External_Careers', tenant: 'siemens', siteName: 'External_Careers', connectorIdPrefix: 'siemens' };
// These RCV employers expose public Workday job pages. Keep them on the
// structured CXS connector so Firecrawl remains a fallback for employers
// without a stable public feed.
export const STATE_STREET_CONFIG: WorkdayConfig = { companyName: 'State Street', baseUrl: 'https://statestreet.wd1.myworkdayjobs.com/Global', tenant: 'statestreet', siteName: 'Global', connectorIdPrefix: 'state-street' };
export const NORTHERN_TRUST_CONFIG: WorkdayConfig = { companyName: 'Northern Trust', baseUrl: 'https://ntrs.wd1.myworkdayjobs.com/en-US/northerntrust', tenant: 'ntrs', siteName: 'northerntrust', connectorIdPrefix: 'northern-trust' };
export const MASTERCARD_CONFIG: WorkdayConfig = { companyName: 'Mastercard', baseUrl: 'https://mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers', tenant: 'mastercard', siteName: 'CorporateCareers', connectorIdPrefix: 'mastercard' };
export const VISA_CONFIG: WorkdayConfig = { companyName: 'Visa', baseUrl: 'https://visa.wd5.myworkdayjobs.com/en-US/Visa', tenant: 'visa', siteName: 'Visa', connectorIdPrefix: 'visa' };
export const FACTSET_CONFIG: WorkdayConfig = { companyName: 'FactSet', baseUrl: 'https://factset.wd108.myworkdayjobs.com/en-US/FactSetCareers', tenant: 'factset', siteName: 'FactSetCareers', connectorIdPrefix: 'factset' };
export const BLOOMBERG_CONFIG: WorkdayConfig = { companyName: 'Bloomberg', baseUrl: 'https://bloomberg.wd1.myworkdayjobs.com/en-US/Bloombergindustrygroup_External_Career_Site', tenant: 'bloomberg', siteName: 'Bloombergindustrygroup_External_Career_Site', connectorIdPrefix: 'bloomberg' };

const INDIA_LOCATIONS = /\b(?:india|bengaluru|bangalore|gurgaon|gurugram|mumbai|pune|hyderabad|delhi|noida|chennai|kolkata|coimbatore|ahmedabad|jaipur|thiruvananthapuram|kochi|chandigarh)\b/i;
const REQUEST_TIMEOUT_MS = 35_000;
const MAX_REQUEST_ATTEMPTS = 3;
const PAGE_SIZE = 20;
const MAX_PAGES = 500;

export function createWorkdayConnector(
  config: WorkdayConfig,
  fetcher: JobFetch = fetch,
  runType: 'watch' | 'reconcile',
): OfficialJobConnector {
  const connectorId = `${config.connectorIdPrefix}-official-india`;
  const scanGroup = `${config.connectorIdPrefix}-${runType}`;

  return {
    connectorId,
    connectorVersion: 'workday-cxs-v2',
    scanGroup,
    company: config.companyName,
    async enumerate(request) {
      return enumerateWorkday(config, connectorId, fetcher, request);
    },
    async hydrate(listing) {
      const detailUrl = publicJobUrl(config, listing.sourceExternalId);
      const detailPath = listing.sourceExternalId.startsWith('/') ? listing.sourceExternalId : `/${listing.sourceExternalId}`;
      const data = await fetchJson(fetcher, `${apiBaseUrl(config)}${detailPath}`);
      const info = isRecord(data.jobPostingInfo) ? data.jobPostingInfo : {};
      const title = stringValue(info.title) || listing.title;
      const location = stringValue(info.location) || listing.location || '';
      const description = stringValue(info.jobDescription);
      const employerJobId = stringValue(info.jobReqId) || stringValue(info.jobPostingId) || listing.sourceExternalId;
      if (!title || !location || !description) {
        throw new Error(`Missing required ${config.companyName} Workday job fields`);
      }
      const applyUrl = stringValue(info.externalUrl) ? `${detailUrl}/apply` : `${detailUrl}/apply`;
      return {
        connectorId,
        sourceType: 'official_career',
        sourceName: `${config.companyName} Careers`,
        sourceExternalId: listing.sourceExternalId,
        company: config.companyName,
        employerJobId,
        listingUrl: detailUrl,
        detailUrl,
        applyUrl,
        isOfficial: true,
        title,
        location,
        description,
        experienceText: extractExperience(description),
        jobCategory: listing.category || '',
        postedAt: parsePostedDate(stringValue(info.startDate) || stringValue(info.postedOn)),
        listingMetadataHash: listing.listingMetadataHash,
        contentHash: hashText(`${title}\u0000${location}\u0000${description}`),
        rawMetadata: {
          jobPostingId: stringValue(info.jobPostingId),
          jobPostingSiteId: stringValue(info.jobPostingSiteId),
          canApply: info.canApply === true,
        },
      } satisfies HydratedSourceObservation;
    },
  };
}

async function enumerateWorkday(
  config: WorkdayConfig,
  connectorId: string,
  fetcher: JobFetch,
  request: ConnectorRunRequest,
): Promise<InventoryResult> {
  const listings: InventoryListing[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let offset = 0;
  let pagesFetched = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${apiBaseUrl(config)}/jobs`;
    try {
      const data = await fetchJson(fetcher, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
      });
      const postings = Array.isArray(data.jobPostings) ? data.jobPostings : [];
      const pageTotal = numberValue(data.total) ?? numberValue(data.totalCount);
      if (pageTotal !== null && (total === null || pageTotal > 0)) total = pageTotal;
      pagesFetched += 1;

      for (const job of postings) {
        const externalPath = stringValue(job.externalPath);
        const title = stringValue(job.title);
        const location = stringValue(job.locationsText);
        if (!externalPath || !title || !location || !INDIA_LOCATIONS.test(location) || seen.has(externalPath)) continue;
        seen.add(externalPath);
        listings.push({
          connectorId,
          sourceExternalId: externalPath,
          company: config.companyName,
          title,
          location,
          category: null,
          department: null,
          detailUrl: publicJobUrl(config, externalPath),
          listingMetadataHash: hashText([externalPath, title, location, stringValue(job.postedOn)].join('\u0000')),
          rawMetadata: {},
        });
      }

      offset += postings.length;
      if (postings.length === 0 || (total !== null && offset >= total) || postings.length < PAGE_SIZE) break;
    } catch (error) {
      errors.push(errorSummary(url, error));
      break;
    }
  }

  const expectedPages = total === null ? null : Math.ceil(total / PAGE_SIZE);
  if (total !== null && pagesFetched < expectedPages! && errors.length === 0) {
    errors.push(`Fetched ${pagesFetched} of ${expectedPages} advertised Workday pages`);
  }
  const status = errors.length > 0 ? (pagesFetched > 0 ? 'partial' : 'failed') : 'complete';
  return {
    listings,
    diagnostic: {
      status,
      reportedTotal: total,
      pagesExpected: expectedPages,
      pagesFetched,
      errorSummaries: errors,
    },
  };
}

function apiBaseUrl(config: WorkdayConfig): string {
  const origin = new URL(config.baseUrl).origin;
  return `${origin}/wday/cxs/${encodeURIComponent(config.tenant)}/${encodeURIComponent(config.siteName)}`;
}

function publicJobUrl(config: WorkdayConfig, externalPath: string): string {
  return `${config.baseUrl.replace(/\/$/, '')}/${externalPath.replace(/^\//, '')}`;
}

async function fetchJson(fetcher: JobFetch, url: string, init: RequestInit = {}): Promise<Record<string, any>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(url, { ...init, signal: init.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { 'User-Agent': 'first-look-job-monitor/1.0 (+personal use)', ...(init.headers || {}) } });
      const text = await response.text();
      if (!response.ok) {
        if (/maintenance-page|maintenance|temporarily unavailable/i.test(text)) throw new Error(`Workday maintenance page (${response.status})`);
        throw new Error(`Workday fetch failed: ${response.status} ${response.statusText}`);
      }
      if (/^\s*</.test(text) || /maintenance-page|temporarily unavailable/i.test(text)) throw new Error('Workday returned a maintenance page instead of JSON');
      try { return JSON.parse(text) as Record<string, any>; } catch { throw new Error('Workday returned invalid JSON'); }
    } catch (error) {
      lastError = error;
      if (attempt < MAX_REQUEST_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Workday request failed');
}

function extractExperience(description: string): string {
  return description.match(/[^.]*\b(?:\d+\s*(?:-|to)\s*\d+\s+years?|\d+\+?\s+years?|freshers?|no prior experience)[^.]*\.?/i)?.[0]?.trim() || '';
}

function parsePostedDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function numberValue(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function hashText(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
function errorSummary(url: string, error: unknown): string { return `${url}: ${error instanceof Error ? error.message : 'request failed'}`.slice(0, 500); }
