import { loadRuntimeConfig } from './config.ts';
import { createOfficialConnectorRegistry, selectConnectorGroup, supportedOfficialConnectorIds } from './connectors/registry.ts';
import { parseScanRequest, safePublicError } from './http.ts';
import { checkJobStatusUrl, pickRoleStatusUrl } from './job-status.ts';
import { sendPushMessage, type PushSendResult, type PushSubscriptionRecord, type VapidConfig } from './push/web-push.ts';
import { createSourceAwareStore, createSupabaseRestClient } from './persistence/store.ts';
import {
  presentCoverage,
  presentJob,
  sortPresentedJobs,
  type CoverageRow,
  type HealthRow,
  type JobRow,
  type SourceRow,
} from './presenters.ts';
import { runSourceAwareScan } from './scan.ts';
import { isStrictZeroToTwoExperience, parseExperience } from './classification/experience.ts';
import { classifyFinance, classifyLocation, isNoiseTitle } from './classification/taxonomy.ts';
import { extractJobLink } from './job-link.ts';

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/$/, '');

  try {
    if (route.endsWith('/health')) return json({ ok: true, service: 'first-look-job-monitor' }, headers);
    if (route.endsWith('/jobs') && request.method === 'GET') return getJobs(headers);
    if (route.endsWith('/roles') && request.method === 'GET') return getAllRoles(headers);
    if (route.endsWith('/resume') && request.method === 'POST') return saveResumeCopy(request, headers);
    if (route.endsWith('/resume/list') && request.method === 'GET') return listResumeCopies(request, headers);
    if (route.endsWith('/resume/download') && request.method === 'GET') return downloadResumeCopy(request, url, headers);
    if (route.endsWith('/candidates') && request.method === 'GET') return getCandidates(headers);
    if (route.endsWith('/job-status') && request.method === 'GET') return getJobStatus(url, headers);
    if (route.endsWith('/job-link') && request.method === 'GET') return getJobLink(url, headers);
    if (route.endsWith('/coverage') && request.method === 'GET') return getCoverage(headers);
    if (route.endsWith('/push/subscribe') && request.method === 'POST') return saveSubscription(request, headers);
    if (route.endsWith('/push/send') && request.method === 'POST') return sendPushWorker(request, headers);
    if (route.endsWith('/scan') && request.method === 'POST') {
      const scanToken = Deno.env.get('SCAN_TOKEN');
      if (!scanToken || request.headers.get('Authorization') !== `Bearer ${scanToken}`) {
        return json({ error: 'Unauthorized' }, headers, 401);
      }

      let scanRequest: ReturnType<typeof parseScanRequest>;
      try {
        scanRequest = parseScanRequest(url);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Invalid scan request' }, headers, 400);
      }
      const connectors = selectConnectorGroup(createOfficialConnectorRegistry(), scanRequest.group);
      if (connectors.length === 0) return json({ error: 'Unknown scan group' }, headers, 400);

      const config = runtimeConfig();
      const result = await runSourceAwareScan(connectors, createSourceAwareStore(supabaseClient()), {
        runType: scanRequest.runType,
        detailBatchSize: config.detailBatchSize,
        detailConcurrency: config.detailConcurrency,
        deferredAuditLimit: config.deferredAuditLimit,
        openRouter: config.openRouter,
        now: new Date(),
      });
      return json(result, headers);
    }
    return json({ error: 'Not found' }, headers, 404);
  } catch (error) {
    console.error(error instanceof Error ? error.message.slice(0, 500) : 'Unhandled request error');
    return json(safePublicError(error), headers, 500);
  }
});

function corsHeaders(origin: string | null) {
  const allowedOrigins = [
    'https://ptroop.github.io',
    ...(Deno.env.get('ALLOWED_ORIGIN') ? [Deno.env.get('ALLOWED_ORIGIN')!] : []),
  ];
  const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const isAllowed = origin && (allowedOrigins.includes(origin) || isLocalhost);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (allowedOrigins[0] || '*'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-resume-inbox-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Content-Type': 'application/json',
  };
}

const RESUME_BUCKET = 'resume-intake';
const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const RESUME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
};

interface ResumeUser {
  id: string;
  email: string;
}

type ResumeAuth = { user: ResumeUser } | { response: Response };

async function authenticateResumeUser(request: Request, headers: Record<string, string>): Promise<ResumeAuth> {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const baseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !baseUrl || !serviceKey) return { response: json({ error: 'Unauthorized' }, headers, 401) };

  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { response: json({ error: 'Unauthorized' }, headers, 401) };
  const user = await response.json() as { id?: unknown; email?: unknown };
  if (typeof user.id !== 'string' || typeof user.email !== 'string' || !user.email.trim()) {
    return { response: json({ error: 'Unauthorized' }, headers, 401) };
  }
  return { user: { id: user.id, email: user.email.trim().toLowerCase() } };
}

function requireResumeInboxToken(request: Request, headers: Record<string, string>): Response | null {
  const expected = Deno.env.get('RESUME_INBOX_TOKEN') || '';
  if (!expected) return json({ error: 'Resume inbox is not configured' }, headers, 503);
  const supplied = request.headers.get('X-Resume-Inbox-Token') || '';
  if (!constantTimeSecretEqual(supplied, expected)) return json({ error: 'Invalid inbox token' }, headers, 401);
  return null;
}

function constantTimeSecretEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

function storagePath(path: string): string | null {
  const value = String(path || '').trim();
  if (!/^resume-intake\/[a-zA-Z0-9._-]+$/.test(value) || value.includes('..')) return null;
  return value;
}

async function storageApiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const baseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  if (!serviceKey || !baseUrl) throw new Error('Storage is not configured');
  return fetch(`${baseUrl}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers || {}),
    },
  });
}

async function storageRequest(path: string, options: RequestInit = {}): Promise<Response> {
  return storageApiRequest(`object/${RESUME_BUCKET}/${path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`, options);
}

function resumeFilename(path: string): string {
  const raw = path.split('/').pop() || 'resume';
  return raw.replace(/^\d+-[0-9a-f-]{36}-/i, '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'resume';
}

async function saveResumeCopy(request: Request, headers: Record<string, string>) {
  const auth = await authenticateResumeUser(request, headers);
  if ('response' in auth) return auth.response;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > RESUME_MAX_BYTES + 64_000) return json({ error: 'Resume is too large' }, headers, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch (_error) {
    return json({ error: 'Upload could not be read' }, headers, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose a resume file' }, headers, 400);
  if (file.size <= 0 || file.size > RESUME_MAX_BYTES) return json({ error: 'Resume must be between 1 byte and 10 MB' }, headers, 413);

  const extension = file.name.toLowerCase().split('.').pop() || '';
  const contentType = RESUME_TYPES[extension];
  if (!contentType) return json({ error: 'Use PDF, DOCX, TXT, MD or HTML' }, headers, 415);
  const safeStem = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim()
    .slice(0, 80) || 'resume';
  const path = `resume-intake/${Date.now()}-${crypto.randomUUID()}-${safeStem}.${extension}`;
  const response = await storageRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
    body: await file.arrayBuffer(),
  });
  if (!response.ok) {
    console.error(`Resume storage upload failed with HTTP ${response.status} for ${auth.user.id}`);
    return json({ error: 'Resume could not be saved' }, headers, 502);
  }
  return json({ saved: true, name: resumeFilename(path) }, headers, 201);
}

async function listResumeCopies(request: Request, headers: Record<string, string>) {
  const denied = requireResumeInboxToken(request, headers);
  if (denied) return denied;
  const response = await storageApiRequest(`object/list/${RESUME_BUCKET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  if (!response.ok) return json({ error: 'Resume inbox is unavailable' }, headers, 502);
  const objects = await response.json() as Array<{ name?: unknown; created_at?: unknown; updated_at?: unknown; metadata?: unknown }>;
  const copies = (Array.isArray(objects) ? objects : [])
    .filter((item) => typeof item.name === 'string')
    .map((item) => {
      const name = String(item.name).replace(/^resume-intake\//, '');
      const path = storagePath(`resume-intake/${name}`);
      return path ? {
        path,
        name: resumeFilename(path),
        createdAt: typeof item.created_at === 'string' ? item.created_at : (typeof item.updated_at === 'string' ? item.updated_at : null),
      } : null;
    })
    .filter((item): item is { path: string; name: string; createdAt: string | null } => Boolean(item));
  return json({ copies }, headers);
}

async function downloadResumeCopy(request: Request, url: URL, headers: Record<string, string>) {
  const denied = requireResumeInboxToken(request, headers);
  if (denied) return denied;
  const path = storagePath(url.searchParams.get('path') || '');
  if (!path) return json({ error: 'Invalid resume path' }, headers, 400);
  const response = await storageRequest(path);
  if (!response.ok || !response.body) return json({ error: 'Resume not found' }, headers, response.status === 404 ? 404 : 502);
  const downloadHeaders = new Headers(headers);
  downloadHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream');
  downloadHeaders.set('Content-Disposition', `attachment; filename="${resumeFilename(path).replace(/"/g, '')}"`);
  return new Response(response.body, { status: 200, headers: downloadHeaders });
}

function isSeniorOrNonFinanceTitle(title: string): boolean {
  return isNoiseTitle(title);
}

async function getJobs(headers: Record<string, string>) {
  const select = 'id,company,official_detail_url,official_apply_url,title,location,description,experience_text,first_seen_at,last_seen_at,posted_at,match_tier,classification_method,location_status,finance_status,experience_status,minimum_years,maximum_years,classified_at';
  // Strict 0-2 feed: DB prefilter keeps confirmed zero_to_two rows plus rows the
  // classifier stored as ambiguous ("at least 1", "2+", blank wording) so the
  // in-memory re-parse below can promote the qualifying ones, then every row is
  // re-parsed from title+description so stale or open-ended wording (3+, senior
  // bands) cannot reach the UI.
  // Newest-first ordering makes the 2000-row cap deterministic: the in-memory
  // re-parse and the freshness-first feed both start from the most recent rows.
  const rows = ((await supabaseClient().request(`/rest/v1/jobs?active=eq.true&location_status=eq.india&finance_status=in.(exact,likely)&match_tier=in.(exact,possible)&experience_status=in.(zero_to_two,ambiguous)&select=${select}&order=last_seen_at.desc&limit=2000`)) as JobRow[])
    .filter((row) => !isSeniorOrNonFinanceTitle(row.title)
      && classifyFinance({ title: row.title, jobCategory: '', description: row.description }).status !== 'unrelated')
    // Re-parse every row once and serve the confirmed band, so ambiguous rows
    // whose wording qualifies ("at least 1", "2+") surface with accurate
    // experience evidence while stale/senior wording cannot reach the UI. The
    // structured experience_text (extracted by the connector at scan time) is
    // included because some ATS feeds keep the experience band only there.
    .map((row) => {
      const parsed = parseExperience(`${row.title}\n${row.experience_text || ''}\n${row.description}`);
      if (!isStrictZeroToTwoExperience(parsed)) return null;
      // Guard stored year columns too, in case classification lags the parser.
      if (row.minimum_years !== null && (row.minimum_years < 0 || row.minimum_years > 2)) return null;
      if (row.maximum_years !== null && (row.maximum_years < 0 || row.maximum_years > 2)) return null;
      return {
        ...row,
        experience_status: parsed.status,
        minimum_years: parsed.minimumYears,
        maximum_years: parsed.maximumYears,
      };
    })
    .filter((row): row is JobRow => row !== null);
  if (rows.length === 0) return json({ jobs: [], snapshotAt: null }, headers);

  const ids = rows.map((row) => encodeURIComponent(row.id)).join(',');
  const sourceSelect = 'id,job_id,connector_id,source_type,source_name,source_external_id,listing_url,detail_url,apply_url,is_official,last_verified_at,active,hydration_status';
  const sources = (await supabaseClient().request(`/rest/v1/job_sources?job_id=in.(${ids})&active=eq.true&select=${sourceSelect}&limit=5000`)) as SourceRow[];
  const connectorIds = [...new Set(sources.map((source) => source.connector_id))];
  const health = connectorIds.length > 0
    ? (await supabaseClient().request(`/rest/v1/source_scan_runs?connector_id=in.(${connectorIds.map(encodeURIComponent).join(',')})&select=connector_id,run_type,status,finished_at&order=finished_at.desc&limit=200`)) as HealthRow[]
    : [];
  const snapshotAt = newestDate([
    ...health.map((row) => row.finished_at),
    ...sources.map((source) => source.last_verified_at),
  ]);
  return json({ jobs: sortPresentedJobs(rows.map((row) => presentJob(row, sources, health))), snapshotAt }, headers);
}

async function getAllRoles(headers: Record<string, string>) {
  const select = 'connector_id,source_external_id,company,title,location,detail_url,last_seen_at,candidate_status,candidate_reasons';
  const pageSize = 1000;
  const rows: InventoryRoleRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = (await supabaseClient().request(
      `/rest/v1/source_inventory?active=eq.true&select=${select}&order=last_seen_at.desc&limit=${pageSize}&offset=${offset}`,
    )) as InventoryRoleRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const roles = rows
    .filter((row) => row.title?.trim() && row.detail_url?.trim())
    .map((row) => ({
      id: `inventory:${row.connector_id}:${row.source_external_id}`.slice(0, 180),
      company: row.company,
      title: row.title,
      location: row.location || 'Location not listed',
      description: '',
      officialDetailUrl: row.detail_url,
      officialApplyUrl: null,
      officialVerified: true,
      matchTier: 'not_targeted',
      inventoryRole: true,
      inventoryStatus: row.candidate_status,
      candidateReasons: Array.isArray(row.candidate_reasons) ? row.candidate_reasons.slice(0, 8) : [],
      firstSeenAt: row.last_seen_at,
      newestVerificationAt: row.last_seen_at,
      sources: [{
        type: 'official_career',
        name: `${row.company} Careers`,
        listingUrl: row.detail_url,
        detailUrl: row.detail_url,
        applyUrl: null,
        official: true,
        verifiedAt: row.last_seen_at,
      }],
    }));

  return json({ roles, snapshotAt: newestDate(rows.map((row) => row.last_seen_at)) }, headers);
}

async function getCandidates(headers: Record<string, string>) {
  const select = 'connector_id,source_external_id,company,title,location,category,department,detail_url,last_seen_at,candidate_reasons';
  const rows = (await supabaseClient().request(
    `/rest/v1/source_inventory?active=eq.true&candidate_status=in.(hydrate,audit)&select=${select}&order=last_seen_at.desc&limit=2000`,
  )) as CandidateInventoryRow[];

  const candidates = rows
    .filter((row) => {
      const title = String(row.title || '').trim();
      const location = String(row.location || '').trim();
      if (!title || !row.detail_url || isNoiseTitle(title) || /\bsenior\b|\bmanager\b|\blead\b/i.test(title)) return false;
      if (classifyLocation(location).status !== 'india') return false;
      const metadata = `${title} ${row.category || ''} ${row.department || ''}`;
      const finance = classifyFinance({ title, jobCategory: metadata, description: '' });
      const earlyCareer = /\b(?:analyst|associate|officer|executive|specialist|research|trainee|apprentice|intern|graduate|coordinator|advisor)\b/i.test(title);
      return finance.status !== 'unrelated' || earlyCareer;
    })
    .slice(0, 250)
    .map((row) => ({
      id: `candidate:${row.connector_id}:${row.source_external_id}`.slice(0, 180),
      company: row.company,
      title: row.title,
      location: row.location || 'India',
      description: '',
      officialDetailUrl: row.detail_url,
      officialApplyUrl: null,
      officialVerified: true,
      matchTier: 'possible',
      eligibilityNote: 'Official role candidate found; full posting detail is still being checked for finance relevance and 0–2 years.',
      candidateStatus: 'awaiting_detail',
      candidateReasons: Array.isArray(row.candidate_reasons) ? row.candidate_reasons.slice(0, 8) : [],
      newestVerificationAt: row.last_seen_at,
      sources: [{
        type: 'official_career',
        name: `${row.company} Careers`,
        listingUrl: row.detail_url,
        detailUrl: row.detail_url,
        applyUrl: null,
        official: true,
        verifiedAt: row.last_seen_at,
      }],
    }));

  return json({ candidates, candidateBacklog: candidates.length, snapshotAt: newestDate(rows.map((row) => row.last_seen_at)) }, headers);
}

interface CandidateInventoryRow {
  connector_id: string;
  source_external_id: string;
  company: string;
  title: string;
  location: string | null;
  category: string | null;
  department: string | null;
  detail_url: string | null;
  last_seen_at: string;
  candidate_reasons: unknown;
}

interface InventoryRoleRow {
  connector_id: string;
  source_external_id: string;
  company: string;
  title: string;
  location: string | null;
  detail_url: string;
  last_seen_at: string;
  candidate_status: string;
  candidate_reasons: unknown;
}

function newestDate(values: Array<string | null>): string | null {
  const parsed = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => right - left);
  return parsed.length > 0 ? new Date(parsed[0]).toISOString() : null;
}

const jobLinkCooldown = new Map<string, number>();
const JOB_LINK_COOLDOWN_MS = 20_000;
const JOB_LINK_GLOBAL_PER_MINUTE = 60;
const JOB_LINK_IP_PER_MINUTE = 20;
const jobLinkRecent: number[] = [];
const jobLinkRecentByIp = new Map<string, number[]>();

// Public, keyless role-link import. SSRF-safe fetch is inside extractJobLink;
// this handler only guards volume so the route is not a free fetch proxy.
async function getJobLink(url: URL, headers: Record<string, string>) {
  const rawUrl = url.searchParams.get('url') || '';
  const now = Date.now();
  const cooldownKey = rawUrl.slice(0, 512);
  const lastChecked = jobLinkCooldown.get(cooldownKey);
  if (lastChecked && now - lastChecked < JOB_LINK_COOLDOWN_MS) {
    return json({ error: 'That link was checked very recently; try again shortly.' }, headers, 429);
  }
  while (jobLinkRecent.length && now - jobLinkRecent[0] < 60_000) jobLinkRecent.shift();
  if (jobLinkRecent.length >= JOB_LINK_GLOBAL_PER_MINUTE) {
    return json({ error: 'Import limit reached for this minute; try again shortly.' }, headers, 429);
  }
  jobLinkRecent.push(now);
  if (jobLinkRecentByIp.size > 5000) jobLinkRecentByIp.clear();
  const clientIp = requestIp(headers) || 'unknown';
  const ipTimes = (jobLinkRecentByIp.get(clientIp) || []).filter((stamp) => now - stamp < 60_000);
  if (ipTimes.length >= JOB_LINK_IP_PER_MINUTE) {
    return json({ error: 'Too many imports from this address; try again shortly.' }, headers, 429);
  }
  ipTimes.push(now);
  jobLinkRecentByIp.set(clientIp, ipTimes);

  try {
    const result = await extractJobLink(rawUrl);
    jobLinkCooldown.set(cooldownKey, now);
    return json({ ok: true, ...result }, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import that role link';
    return json({ ok: false, error: message }, headers, 422);
  }
}

function requestIp(headers: Record<string, string>): string {
  const forwarded = headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : '';
}

const jobStatusCooldown = new Map<string, number>();
const JOB_STATUS_COOLDOWN_MS = 60_000;

async function getJobStatus(url: URL, headers: Record<string, string>) {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(id) || id.length > 120) {
    return json({ error: 'Invalid job id' }, headers, 400);
  }
  const lastChecked = jobStatusCooldown.get(id);
  if (lastChecked && Date.now() - lastChecked < JOB_STATUS_COOLDOWN_MS) {
    return json({ error: 'Checked very recently; try again shortly.' }, headers, 429);
  }
  jobStatusCooldown.set(id, Date.now());
  const select = 'id,company,official_detail_url,official_apply_url';
  const rows = (await supabaseClient().request(`/rest/v1/jobs?id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`)) as Array<{
    id: string;
    company: string;
    official_detail_url: string | null;
    official_apply_url: string | null;
  }>;
  const row = rows?.[0];
  if (!row) return json({ error: 'Unknown job' }, headers, 404);

  const sourceSelect = 'detail_url,listing_url,apply_url,is_official';
  const sources = (await supabaseClient().request(`/rest/v1/job_sources?job_id=eq.${encodeURIComponent(id)}&active=eq.true&select=${sourceSelect}&limit=25`)) as Array<{
    detail_url: string | null;
    listing_url: string | null;
    apply_url: string | null;
    is_official: boolean | null;
  }>;
  const targetUrl = pickRoleStatusUrl(row, sources);
  if (!targetUrl) {
    return json({
      id,
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      note: 'No role-level URL is available to verify this listing.',
    }, headers);
  }
  const result = await checkJobStatusUrl(targetUrl);
  return json({ id, ...result }, headers);
}

async function getCoverage(headers: Record<string, string>) {
  const select = 'connector_id,source_company,source_type,run_type,status,hydration_status,reported_total,pages_expected,pages_fetched,listings_discovered,details_due,details_fetched,details_backlogged,apply_urls_resolved,error_summary,finished_at';
  const connectorIds = supportedOfficialConnectorIds().map(encodeURIComponent).join(',');
  const rows = (await supabaseClient().request(`/rest/v1/source_scan_runs?connector_id=in.(${connectorIds})&select=${select}&order=finished_at.desc&limit=300`)) as CoverageRow[];
  return json({
    sources: presentCoverage(rows),
    portalGaps: { portalOnlyJobs: 0, note: 'Portal ingestion is not configured in this release' },
  }, headers);
}

async function saveSubscription(request: Request, headers: Record<string, string>) {
  const subscription = await request.json();
  if (!subscription?.endpoint || !subscription?.keys) return json({ error: 'Invalid push subscription' }, headers, 400);
  await supabaseClient().request('/rest/v1/push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      subscription_json: subscription,
      last_seen_at: new Date().toISOString(),
    }),
  });
  return json({ saved: true }, headers);
}

async function sendPushWorker(request: Request, headers: Record<string, string>) {
  const pushToken = Deno.env.get('PUSH_TOKEN');
  const scanToken = Deno.env.get('SCAN_TOKEN');
  const authorized = (pushToken && request.headers.get('Authorization') === `Bearer ${pushToken}`)
    || (scanToken && request.headers.get('Authorization') === `Bearer ${scanToken}`);
  if (!authorized) return json({ error: 'Unauthorized' }, headers, 401);

  const vapid = vapidConfig();
  if (!vapid) return json({ error: 'VAPID is not configured' }, headers, 503);

  const now = new Date();
  const pending = (await supabaseClient().request(
    '/rest/v1/notification_outbox?status=eq.pending&next_attempt_at=lte.' + encodeURIComponent(now.toISOString()) + '&select=id,job_id,title,company,payload,attempts&order=created_at.asc&limit=10',
  )) as Array<{ id: number; job_id: string; title: string; company: string; payload: Record<string, unknown>; attempts: number }>;
  if (pending.length === 0) return json({ sent: 0, skipped: 0 }, headers);

  const subscriptions = (await supabaseClient().request('/rest/v1/push_subscriptions?select=endpoint,subscription_json&limit=500')) as Array<{ endpoint: string; subscription_json: PushSubscriptionRecord }>;
  const targets = (subscriptions ?? []).map((row) => row.subscription_json || { endpoint: row.endpoint });

  const MAX_ATTEMPTS = 5; // bounded retries: give up after five drains
  let sent = 0;
  let skipped = 0;
  for (const row of pending) {
    const payload = JSON.stringify({ ...(row.payload || {}), jobId: row.job_id, title: row.title, company: row.company });
    const results = await sendWithConcurrency(targets, payload, vapid, now);
    let delivered = false;
    let goneCount = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const result = results[index];
      if (result.gone) {
        goneCount += 1;
        await supabaseClient().request(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(targets[index].endpoint)}`, {
          method: 'DELETE',
        });
      } else if (result.ok) {
        delivered = true;
      }
    }
    const attempts = row.attempts + 1;
    if (delivered) {
      await supabaseClient().request(`/rest/v1/notification_outbox?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'sent', attempts, sent_at: now.toISOString(), last_error: null }),
      });
      sent += 1;
    } else if (targets.length === 0 || goneCount === targets.length || attempts >= MAX_ATTEMPTS) {
      await supabaseClient().request(`/rest/v1/notification_outbox?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          attempts,
          last_error: targets.length === 0 ? 'No deliverable subscription' : 'Max push attempts reached',
        }),
      });
      skipped += 1;
    } else {
      await supabaseClient().request(`/rest/v1/notification_outbox?id=eq.${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ attempts, last_error: 'Push delivery failed; will retry', next_attempt_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString() }),
      });
      skipped += 1;
    }
  }
  return json({ sent, skipped }, headers);
}

// Send one message to many subscriptions with a bounded concurrency pool so
// a large subscriber list cannot exceed the edge-function time limit.
async function sendWithConcurrency(
  targets: PushSubscriptionRecord[],
  payload: string,
  vapid: VapidConfig,
  now: Date,
): Promise<PushSendResult[]> {
  const results = new Array<PushSendResult>(targets.length);
  const poolSize = Math.min(8, targets.length);
  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const index = next;
      next += 1;
      results[index] = await sendPushMessage(targets[index], payload, vapid, { now: () => now });
    }
  }
  await Promise.all(Array.from({ length: poolSize }, worker));
  return results;
}

function vapidConfig(): VapidConfig | null {
  const subject = Deno.env.get('VAPID_SUBJECT');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!subject || !publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

function runtimeConfig() {
  return loadRuntimeConfig({
    DETAIL_BATCH_SIZE: Deno.env.get('DETAIL_BATCH_SIZE'),
    REQUEST_TIMEOUT_MS: Deno.env.get('REQUEST_TIMEOUT_MS'),
    CONNECTOR_CONCURRENCY: Deno.env.get('CONNECTOR_CONCURRENCY'),
    DEFERRED_AUDIT_LIMIT: Deno.env.get('DEFERRED_AUDIT_LIMIT'),
    MAX_RESPONSE_BYTES: Deno.env.get('MAX_RESPONSE_BYTES'),
    OPENROUTER_API_KEY: Deno.env.get('OPENROUTER_API_KEY'),
    OPENROUTER_MODEL: Deno.env.get('OPENROUTER_MODEL'),
    OPENROUTER_FALLBACK_MODELS: Deno.env.get('OPENROUTER_FALLBACK_MODELS'),
    OPENROUTER_PROMPT_VERSION: Deno.env.get('OPENROUTER_PROMPT_VERSION'),
  });
}

function supabaseClient() {
  return createSupabaseRestClient({
    baseUrl: Deno.env.get('SUPABASE_URL') || '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  });
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
