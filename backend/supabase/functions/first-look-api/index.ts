import { createConnectorRegistry } from './connectors/registry.ts';
import { createLegacyScanStore, createSupabaseRestClient } from './persistence/store.ts';
import { presentJob, type JobRow } from './presenters.ts';
import { runScan, type ScanStore } from './scan.ts';

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
  return createLegacyScanStore(createSupabaseRestClient({
    baseUrl: Deno.env.get('SUPABASE_URL') || '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  }));
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  return createSupabaseRestClient({
    baseUrl: Deno.env.get('SUPABASE_URL') || '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  }).request(path, options);
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
