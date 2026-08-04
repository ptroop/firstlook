import { loadRuntimeConfig } from './config.ts';
import { createOfficialConnectorRegistry, selectConnectorGroup, supportedOfficialConnectorIds } from './connectors/registry.ts';
import { parseScanRequest, safePublicError } from './http.ts';
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

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/$/, '');

  try {
    if (route.endsWith('/health')) return json({ ok: true, service: 'first-look-job-monitor' }, headers);
    if (route.endsWith('/jobs') && request.method === 'GET') return getJobs(headers);
    if (route.endsWith('/coverage') && request.method === 'GET') return getCoverage(headers);
    if (route.endsWith('/push/subscribe') && request.method === 'POST') return saveSubscription(request, headers);
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
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';
  const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowValue = (origin && (origin === allowedOrigin || isLocalhost)) ? origin : allowedOrigin;
  return {
    'Access-Control-Allow-Origin': allowValue,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

async function getJobs(headers: Record<string, string>) {
  const select = 'id,company,official_detail_url,official_apply_url,title,location,description,first_seen_at,last_seen_at,posted_at,match_tier,classification_method,location_status,finance_status,experience_status,minimum_years,maximum_years,classified_at';
  const rows = (await supabaseClient().request(`/rest/v1/jobs?active=eq.true&match_tier=in.(exact,possible)&select=${select}&limit=200`)) as JobRow[];
  if (rows.length === 0) return json({ jobs: [] }, headers);

  const ids = rows.map((row) => encodeURIComponent(row.id)).join(',');
  const sourceSelect = 'id,job_id,connector_id,source_type,source_name,source_external_id,listing_url,detail_url,apply_url,is_official,last_verified_at,active,hydration_status';
  const sources = (await supabaseClient().request(`/rest/v1/job_sources?job_id=in.(${ids})&active=eq.true&select=${sourceSelect}&limit=1000`)) as SourceRow[];
  const connectorIds = [...new Set(sources.map((source) => source.connector_id))];
  const health = connectorIds.length > 0
    ? (await supabaseClient().request(`/rest/v1/source_scan_runs?connector_id=in.(${connectorIds.map(encodeURIComponent).join(',')})&select=connector_id,run_type,status,finished_at&order=finished_at.desc&limit=200`)) as HealthRow[]
    : [];
  return json({ jobs: sortPresentedJobs(rows.map((row) => presentJob(row, sources, health))) }, headers);
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
