import {
  decodeHtml,
  extractBodyText,
  extractExperience,
  findApplyUrl,
  htmlToText,
  jsonLdLocation,
  parseDate,
  parseJsonLdPostings,
} from './connectors/official-page.ts';

export type JobLinkSource = 'jsonld' | 'meta' | 'title';
export type JobLinkConfidence = 'high' | 'medium' | 'low';

export interface JobLinkExtract {
  url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string | null;
  detailUrl: string;
  postedAt: string | null;
  source: JobLinkSource;
  confidence: JobLinkConfidence;
  note: string;
}

export interface JobLinkDeps {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
  // Resolves a hostname to its A records so the SSRF guard can reject names
  // that resolve to private/metadata addresses (DNS-rebinding defense).
  resolveHost?: (hostname: string) => Promise<string[]>;
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 8_000_000;
const MAX_REDIRECTS = 3;

// SSRF guard: this route fetches a caller-supplied URL server-side, so it must
// refuse private, loopback, link-local and metadata hosts before any request.
export function validateJobUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, error: 'A role link is required' };
  if (value.length > 2048) return { ok: false, error: 'Role link is too long' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'That does not look like a valid link' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) links are supported' };
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, error: 'Local addresses are not allowed' };
  }
  const ip = ipLiteral(hostname);
  if (ip) {
    if (isPrivateIp(ip)) return { ok: false, error: 'Private network addresses are not allowed' };
    return { ok: true, url };
  }
  if (/^(?:[\w-]+\.)*[\w-]+$/.test(hostname) === false) {
    return { ok: false, error: 'That host name is not valid' };
  }
  return { ok: true, url };
}

function ipLiteral(hostname: string): string | null {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return hostname;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return hostname.slice(1, -1);
  return null;
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4) return true; // IPv6 or malformed: not allowed on this route
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Fetches a pasted role link and extracts structured data. Extraction is
 * best-effort and honest: it reports where the data came from (structured
 * JSON-LD, page metadata, or page title) and a confidence label, so the user
 * can review before building an application kit. It never claims a role is
 * verified — the caller decides how to treat it.
 */
export async function extractJobLink(rawUrl: string, deps: JobLinkDeps = {}): Promise<JobLinkExtract> {
  const fetcher = deps.fetcher || ((url: string, init?: RequestInit) => fetch(url, init));
  const now = deps.now || (() => new Date());
  const resolveHost = deps.resolveHost || defaultResolveHost;
  const validated = await validateJobUrlWithDns(rawUrl, resolveHost);
  if (!validated.ok) throw new Error(validated.error);

  const html = await fetchWithRedirectGuard(fetcher, validated.url.href, resolveHost);
  const posting = parseJsonLdPostings(html)[0] ?? {};
  const meta = readMetaTags(html);

  const jsonLdTitle = stringValue(posting.title);
  const jsonLdCompany = stringValue(posting.hiringOrganization?.name)
    || stringValue(posting.employerOverview?.name)
    || stringValue(posting.hiringOrganization);
  const jsonLdLocationValue = jsonLdLocation(posting.jobLocation);
  const jsonLdDescription = jsonLdDescriptionOf(posting);

  const title = jsonLdTitle || meta.title || titleFromDocument(html) || titleFromUrl(validated.url);
  // Prefer the brand over the JSON-LD legal entity: Workday postings name the
  // internal legal entity ("77-7777356 Default Company for India") rather than
  // the employer brand the user recognizes.
  const company = pickCompany([
    meta.siteName,
    jsonLdCompany,
    atsPathCompany(validated.url),
    companyFromHostname(validated.url.hostname),
  ]);
  const urlPathLocation = locationFromUrlPath(validated.url);
  const structuredLocation = cleanLocation(jsonLdLocationValue || meta.location || '');
  // Workday puts the city in the URL path but a campus/building in JSON-LD;
  // prefer the path when it names a recognizable location.
  const location = urlPathLocation || structuredLocation;
  const description = jsonLdDescription || meta.description || extractBodyText(html);
  const detailUrl = stringValue(posting.url) || validated.url.href;
  const explicitApply = stringValue(posting.directApply) || findApplyUrl(html, detailUrl);
  // A job-detail page is where the employer's Apply flow lives even when no
  // separate link is exposed; the detail URL is the honest fallback.
  const applyUrl = explicitApply || detailUrl;
  const postedAt = parseDate(stringValue(posting.datePosted));

  const hasStructured = Boolean(jsonLdTitle && (jsonLdDescription || jsonLdLocation));
  const hasMeta = Boolean(meta.title && meta.description);
  const source: JobLinkSource = hasStructured ? 'jsonld' : hasMeta ? 'meta' : 'title';
  const confidence: JobLinkConfidence = hasStructured ? 'high' : hasMeta ? 'medium' : 'low';
  const note = source === 'jsonld'
    ? 'Structured posting data was found on the page.'
    : source === 'meta'
      ? 'No structured posting data; details come from page metadata. Review before using.'
      : 'Only a page title was found. Review every field before building a kit.';

  return {
    url: validated.url.href,
    title: title.slice(0, 200),
    company: company.slice(0, 120),
    location: location.slice(0, 160),
    description: description.slice(0, 20_000),
    applyUrl,
    detailUrl,
    postedAt,
    source,
    confidence,
    note,
  };
}

// DNS-rebinding defense: the hostname string may pass the syntax check while
// resolving to a private/metadata address. Resolve A records and re-validate
// each resolved IP before any fetch.
async function validateJobUrlWithDns(
  raw: string,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  const checked = validateJobUrl(raw);
  if (!checked.ok) return checked;
  const { hostname } = checked.url;
  if (ipLiteral(hostname)) return checked; // literal IPs are validated directly
  try {
    const addresses = await resolveHost(hostname);
    if (addresses.some((address) => isPrivateIp(address))) {
      return { ok: false, error: 'That host resolves to a private network address and is not allowed' };
    }
  } catch {
    // Resolution failure is treated as blocked: a role link whose host cannot
    // be resolved cannot be fetched safely on this route.
    return { ok: false, error: 'That host could not be resolved; the link was not fetched' };
  }
  return checked;
}

function defaultResolveHost(hostname: string): Promise<string[]> {
  // Deno-only API; in a non-Deno test harness the guard falls back to the
  // syntax check only (tests inject a resolver to exercise the DNS path).
  const runtime = (globalThis as Record<string, unknown>).Deno as
    | { resolveDns?: (name: string, type: 'A') => Promise<string[]> }
    | undefined;
  if (!runtime?.resolveDns) return Promise.resolve([]);
  return runtime.resolveDns(hostname, 'A');
}

// Manual redirect handling re-validates each hop (syntax + DNS) so a redirect
// cannot smuggle the fetch to a private or metadata host after the first check.
async function fetchWithRedirectGuard(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetcher(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'User-Agent': 'first-look-job-monitor/1.0 (+personal role import)',
        Accept: 'text/html, application/xhtml+xml, application/xml;q=0.9',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === MAX_REDIRECTS) throw new Error('The role link redirected too many times');
      const next = new URL(location, current).href;
      const checked = await validateJobUrlWithDns(next, resolveHost);
      if (!checked.ok) throw new Error(checked.error);
      current = next;
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`The role page could not be fetched (HTTP ${response.status})`);
    if (text.length > MAX_BODY_BYTES) throw new Error('The role page is too large to import');
    return text;
  }
  throw new Error('The role link redirected too many times');
}

function readMetaTags(html: string): { title: string; description: string; siteName: string; location: string } {
  const title = metaContent(html, 'property="og:title"') || metaContent(html, 'name="twitter:title"') || '';
  const description = metaContent(html, 'property="og:description"') || metaContent(html, 'name="description"') || metaContent(html, 'name="twitter:description"') || '';
  const siteName = metaContent(html, 'property="og:site_name"') || '';
  const location = metaContent(html, 'name="jobLocation"') || metaContent(html, 'name="location"') || '';
  return { title, description, siteName, location };
}

function metaContent(html: string, needle: string): string {
  // Match a <meta ... property|name="needle" ... content="..."> where the
  // attribute order is unknown. `needle` is always a quoted attribute value
  // like property="og:title", so it is inserted literally into the pattern.
  const pattern = new RegExp(`<meta\\b[^>]*\\b${needle}[^>]*content\\s*=\\s*["']([^"']*)["']`, 'i');
  return decodeHtml(html.match(pattern)?.[1] || '').trim();
}

function jsonLdDescriptionOf(posting: Record<string, any>): string {
  return htmlToText(stringValue(posting.description));
}

function titleFromDocument(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return htmlToText(title)
    .replace(/\s*[|–—-]\s*(?:[^|–—-]{0,60}?)?\s*(?:careers?|jobs?|job search|hiring|apply now?)\s*$/i, '')
    .trim();
}

function titleFromUrl(url: URL): string {
  const part = url.pathname.split('/').filter(Boolean).pop() || '';
  return decodeURIComponent(part).replace(/[-_]+/g, ' ').replace(/\b\d{3,}\b/g, '').trim() || 'Role listing';
}

// ATS hosts bury the brand (wf.wd1.myworkdayjobs.com/WellsFargoJobs). Prefer
// the brand segment in the path when present, then skip known ATS/generic
// labels to recover a recognizable employer name.
const ATS_LABELS = /(?:myworkdayjobs|greenhouse|lever|smartrecruiters|icims|oraclecloud|sapsf|successfactors|taleo|avature|workable|bamboohr|recruit|recruiting|talent|careers|jobs|external|internal|students|apply|wd\d?|www|com)$/i;

function atsPathCompany(url: URL): string {
  const segment = url.pathname.split('/').filter(Boolean)[0] || '';
  const cleaned = segment.replace(/(?:jobs|careers|talent)(?:portal)?$/i, '');
  return cleaned.length > 2
    ? cleaned.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function companyFromHostname(hostname: string): string {
  const labels = hostname.replace(/^www\./i, '').split('.');
  const core = labels.find((label) => !ATS_LABELS.test(label) && label.length > 2) || labels[0] || hostname;
  return core.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pick the most recognizable employer brand. JSON-LD hiringOrganization is a
// legal entity ("77-7777356 Default Company for India"), so strip registration
// noise and prefer the longest surviving non-generic candidate.
const GENERIC_COMPANY = /^(?:external|internal|students|apply|careers|jobs|talent|career|job|lateral ba continuum|default company(?:.*)?)$/i;

function pickCompany(candidates: string[]): string {
  const cleaned = candidates
    .map((value) => cleanLegalEntity(value))
    .filter((value) => {
      if (value.length < 3) return false;
      if (GENERIC_COMPANY.test(value)) return false;
      if (/^[\d-]+$/.test(value)) return false;
      return true;
    });
  if (cleaned.length === 0) return '';
  return cleaned.sort((left, right) => right.length - left.length)[0];
}

function cleanLegalEntity(value: string): string {
  return String(value || '')
    .replace(/^[a-z]*\d[\d -]*/i, ' ')                       // leading ids: "77-7777356 ", "I16 "
    .replace(/\b(?:private|pvt|limited|ltd|llc|inc\.?|advantage svcs|advantage services|international solutions|services|solutions|default company(?: for [a-z]+)?)\b.*$/i, '')
    .replace(/\b(?:company|corporation|corp|group|holding)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Workday locations embed address blocks ("111442-IND-BENGALURU-INTL BLR BLK
// B3 PETUNIA, India"). Collapse to the recognizable city when one is present.
const INDIA_CITIES = /\b(?:bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|delhi|noida|chennai|kolkata|ahmedabad|jaipur|kochi|thiruvananthapuram|indore|lucknow|coimbatore|vadodara|nagpur|visakhapatnam|surat|bhopal|chandigarh)\b/i;

function locationFromUrlPath(url: URL): string {
  const match = url.pathname.match(/\/([a-z-]+)-(?:india)(?:\/|$)/i)
    || url.pathname.match(/\/(?:job|jobs)\/([a-z-]+)(?:\/|$)/i);
  if (!match) return '';
  const label = match[1].replace(/[-_]+/g, ' ').trim();
  return label.length > 2 ? `${label}, India` : '';
}

function cleanLocation(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const city = value.match(INDIA_CITIES)?.[0];
  if (city) {
    return `${city.charAt(0).toUpperCase() + city.slice(1).toLowerCase()}, India`;
  }
  return value
    .replace(/\s*\b(?:IN|IND|MH|KA|TN|DL|UP|TS|WB|GJ|RJ|KL|HR)\b\s*/gi, ' ')
    .replace(/,+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && 'name' in (value as Record<string, unknown>)) {
    return stringValue((value as Record<string, unknown>).name);
  }
  return '';
}
