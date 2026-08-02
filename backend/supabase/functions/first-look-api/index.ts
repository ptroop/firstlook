import { createConnectorRegistry } from './connectors/registry.ts';
import { readJsonBody } from './http.ts';
import { presentJob, type JobRow } from './presenters.ts';
import { runScan, type ScanStore } from './scan.ts';
import type { ConnectorDiagnostic, NormalizedJob } from './types.ts';

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  const route = new URL(request.url).pathname.replace(/\/$/, '');

  try {
    if (route.endsWith('/health')) return json({ ok: true, service: 'first-look-job-monitor' }, headers);
    if (route.endsWith('/jobs') && request.method === 'GET') return getJobs(headers);
    if (route.endsWith('/push/subscribe') && request.method === 'POST') return saveSubscription(request, headers);
    if (route.endsWith('/scan') && request.method === 'POST') {
      const scanToken = Deno.env.get('SCAN_TOKEN');
      if (!scanToken || request.headers.get('Authorization') !== `Bearer ${scanToken}`) {
        return json({ error: 'Unauthorized' }, headers, 401);
      }
      try {
        return json(await runScan(createConnectorRegistry(), createSupabaseStore()), headers);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown scan failure';
        console.error(detail);
        return json({ error: 'Scan failed', detail }, headers, 500);
      }
    }
    return json({ error: 'Not found' }, headers, 404);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unhandled request error');
    return json({ error: 'Internal error' }, headers, 500);
  }
});

function corsHeaders(origin: string | null) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';
  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : allowedOrigin === '*' ? '*' : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

async function getJobs(headers: Record<string, string>) {
  const rows = await supabaseFetch('/rest/v1/jobs?active=eq.true&select=id,source_company,source_url,apply_url,title,location,description,first_seen_at,posted_at&order=first_seen_at.desc&limit=100');
  return new Response(JSON.stringify({ jobs: (rows as JobRow[]).map(presentJob) }), { headers });
}

async function saveSubscription(request: Request, headers: Record<string, string>) {
  const subscription = await request.json();
  if (!subscription?.endpoint || !subscription?.keys) return json({ error: 'Invalid push subscription' }, headers, 400);
  await supabaseFetch('/rest/v1/push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ endpoint: subscription.endpoint, subscription_json: subscription, last_seen_at: new Date().toISOString() })
  });
  return json({ saved: true }, headers);
}

function createSupabaseStore(): ScanStore {
  return {
    async startRun(startedAt) {
      const rows = await supabaseFetch('/rest/v1/scan_runs', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ started_at: startedAt })
      });
      return rows[0]?.id || null;
    },

    async upsertJob(job, seenAt) {
      await supabaseFetch('/rest/v1/jobs?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(jobRow(job, seenAt))
      });
    },

    async deactivateMissingForSource(company, activeIds) {
      await supabaseFetch('/rest/v1/rpc/deactivate_missing_jobs', {
        method: 'POST',
        body: JSON.stringify({ p_source_company: company, p_active_ids: activeIds })
      });
    },

    async recordSourceResult(runId, diagnostic) {
      await supabaseFetch('/rest/v1/source_scan_runs', {
        method: 'POST',
        body: JSON.stringify(sourceDiagnosticRow(runId, diagnostic))
      });
    },

    async finishRun(runId, summary, finishedAt) {
      if (!runId) return;
      await supabaseFetch(`/rest/v1/scan_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          finished_at: finishedAt,
          sources_checked: summary.sourcesChecked,
          jobs_found: summary.jobsFound,
          error_count: summary.errorCount
        })
      });
    }
  };
}

function jobRow(job: NormalizedJob, seenAt: string) {
  return {
    id: job.id,
    employer_job_id: job.employerJobId,
    source_company: job.company,
    source_url: job.sourceUrl,
    apply_url: job.applyUrl,
    title: job.title,
    location: job.location,
    description: job.description.slice(0, 4000),
    experience_text: job.experienceText,
    job_category: job.jobCategory,
    posted_at: job.postedAt,
    last_seen_at: seenAt,
    active: true
  };
}

function sourceDiagnosticRow(runId: number | null, item: ConnectorDiagnostic) {
  return {
    scan_run_id: runId,
    source_company: item.company,
    status: item.status,
    discovered_count: item.discoveredCount,
    fetched_count: item.fetchedCount,
    matching_count: item.matchingCount,
    excluded_json: item.excluded,
    error_message: item.errorMessage,
    started_at: item.startedAt,
    finished_at: item.finishedAt
  };
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const method = options.method || 'GET';
    const resource = path.split('?')[0];
    throw new Error(`Supabase ${method} ${resource} failed with HTTP ${response.status}`);
  }
  return readJsonBody(response);
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
