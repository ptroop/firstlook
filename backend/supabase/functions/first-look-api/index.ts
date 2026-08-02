const SOURCES: Array<[string, string]> = [
  ['Goldman Sachs', 'https://www.goldmansachs.com/careers'],
  ['JPMorgan Chase', 'https://careers.jpmorgan.com/global/en/home'],
  ["Moody's", 'https://careers.moodys.com/en/search_jobs'],
  ['KPMG', 'https://kpmg.com/in/en/careers.html'],
  ['Deloitte', 'https://southasiacareers.deloitte.com/'],
  ['BlackRock', 'https://careers.blackrock.com/job/'],
  ['HSBC', 'https://www.hsbc.com/careers/find-a-job'],
  ['D. E. Shaw', 'https://www.deshawindia.com/careers'],
  ['Accenture', 'https://www.accenture.com/in-en/careers/jobsearch'],
  ['PwC', 'https://www.pwc.in/careers/job-search.html'],
  ['Wells Fargo', 'https://www.wellsfargojobs.com/'],
  ['Citi', 'https://jobs.citi.com/search-jobs'],
  ['Barclays', 'https://search.jobs.barclays/'],
  ['Deutsche Bank', 'https://careers.db.com/professionals/search-roles/index?language_id=1'],
  ['Morgan Stanley', 'https://www.morganstanley.com/careers/career-opportunities-search/'],
  ['Bank of America', 'https://careers.bankofamerica.com/en-us/job-search'],
  ['American Express', 'https://www.americanexpress.com/en-us/careers/'],
  ['PayPal', 'https://careers.pypl.com/'],
  ['NatWest', 'https://jobs.natwestgroup.com/'],
  ['Piramal Finance', 'https://www.piramalfinance.com/careers'],
  ['Fidelity', 'https://jobs.fidelity.com/in/']
];

const FINANCE_WORDS = /finance|financial|banking|investment|credit|risk|treasury|valuation|accounting|audit|advisory|markets|corporate development|business analyst|fp&a/i;
const EARLY_CAREER_WORDS = /analyst|associate|graduate|entry.level|early.career|0.?2 years|mba|pgdm|campus/i;

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { headers });

  const url = new URL(request.url);
  const route = url.pathname.replace(/\/$/, '');

  try {
    if (route.endsWith('/health')) return json({ ok: true, service: 'first-look-job-monitor' }, headers);
    if (route.endsWith('/jobs') && request.method === 'GET') return getJobs(headers);
    if (route.endsWith('/push/subscribe') && request.method === 'POST') return saveSubscription(request, headers);
    if (route.endsWith('/scan') && request.method === 'POST') {
      if (Deno.env.get('SCAN_TOKEN') && request.headers.get('Authorization') !== `Bearer ${Deno.env.get('SCAN_TOKEN')}`) {
        return json({ error: 'Unauthorized' }, headers, 401);
      }
      return json(await scanSources(), headers);
    }
    return json({ error: 'Not found' }, headers, 404);
  } catch (error) {
    console.error(error);
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
  const response = await supabaseFetch('/rest/v1/jobs?active=eq.true&select=id,source_company,source_url,apply_url,title,location,description,first_seen_at&order=first_seen_at.desc&limit=100');
  return new Response(JSON.stringify({ jobs: response }), { headers });
}

async function saveSubscription(request: Request, headers: Record<string, string>) {
  const subscription = await request.json();
  if (!subscription?.endpoint || !subscription?.keys) return json({ error: 'Invalid push subscription' }, headers, 400);
  const now = new Date().toISOString();
  await supabaseFetch('/rest/v1/push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ endpoint: subscription.endpoint, subscription_json: subscription, last_seen_at: now })
  });
  return json({ saved: true }, headers);
}

async function scanSources() {
  const startedAt = new Date().toISOString();
  const run = await supabaseFetch('/rest/v1/scan_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ started_at: startedAt })
  });
  const runId = run[0]?.id;
  let jobsFound = 0;
  let errorCount = 0;

  const results = await Promise.all(SOURCES.map(async ([company, sourceUrl]) => {
    try {
      const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'first-look-job-monitor/0.1 (+personal use)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return extractJobs(await response.text(), company, sourceUrl);
    } catch (_error) {
      errorCount += 1;
      return [];
    }
  }));

  const now = new Date().toISOString();
  for (const job of results.flat()) {
    jobsFound += 1;
    await supabaseFetch('/rest/v1/jobs?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ ...job, first_seen_at: now, last_seen_at: now, active: true })
    });
  }

  await supabaseFetch(`/rest/v1/jobs?last_seen_at=lt.${encodeURIComponent(now)}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  if (runId) await supabaseFetch(`/rest/v1/scan_runs?id=eq.${runId}`, { method: 'PATCH', body: JSON.stringify({ finished_at: now, sources_checked: SOURCES.length, jobs_found: jobsFound, error_count: errorCount }) });
  return { ok: true, sourcesChecked: SOURCES.length, jobsFound, errorCount };
}

function extractJobs(html: string, company: string, sourceUrl: string) {
  const jobs: Array<Record<string, string>> = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    try {
      const raw = script.replace(/^<[\s\S]*?>|<\/script>$/gi, '').trim();
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
      for (const candidate of candidates) {
        if (candidate['@type'] !== 'JobPosting') continue;
        const title = String(candidate.title || '').trim();
        const description = stripHtml(String(candidate.description || '')).trim();
        const location = formatLocation(candidate.jobLocation);
        const text = `${title} ${description} ${location}`;
        if (!title || !FINANCE_WORDS.test(text) || !EARLY_CAREER_WORDS.test(text)) continue;
        const applyUrl = candidate.url || (typeof candidate.directApply === 'string' ? candidate.directApply : sourceUrl);
        jobs.push({ id: stableId(`${company}|${title}|${applyUrl}`), source_company: company, source_url: sourceUrl, apply_url: applyUrl, title, location, description: description.slice(0, 4000) });
      }
    } catch (_error) {
      // Ignore one malformed JSON-LD block and continue with the source.
    }
  }
  return jobs;
}

function formatLocation(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(formatLocation).filter(Boolean).join('; ');
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const item = value as Record<string, unknown>;
    if (item.address) return formatLocation(item.address);
    return [item.addressLocality, item.addressRegion, item.addressCountry].filter(Boolean).join(', ');
  }
  return '';
}

function stripHtml(value: string) { return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `job_${(hash >>> 0).toString(16)}`;
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}${path}`, {
    ...options,
    headers: {
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function json(body: unknown, headers: Record<string, string>, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }
