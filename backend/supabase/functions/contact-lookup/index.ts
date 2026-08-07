import {
  cleanDomain,
  cleanName,
  decodeJwtSubject,
  lookupContactEmail,
} from './contact-lookup.ts';

// Per-user in-memory guards. Edge function instances are ephemeral, so these
// bound burst abuse without pretending to be a durable quota.
const LOOKUP_COOLDOWN_MS = 60_000;
const USER_HOURLY_LIMIT = 10;
const USER_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const cooldownByKey = new Map<string, number>();
const lookupTimesByUser = new Map<string, number[]>();

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, headers, 405);

  const userId = decodeJwtSubject(request.headers.get('Authorization') || '');
  if (!userId) return json({ error: 'Unauthorized' }, headers, 401);

  const apiKey = Deno.env.get('HUNTER_API_KEY')?.trim() || '';
  if (!apiKey) return json({ error: 'Recruiter lookup is not configured on the server' }, headers, 503);

  let body: { firstName?: unknown; lastName?: unknown; domain?: unknown };
  try {
    body = await request.json();
  } catch (_error) {
    return json({ error: 'Invalid JSON body' }, headers, 400);
  }

  const firstName = cleanName(body.firstName);
  const lastName = cleanName(body.lastName);
  const domain = cleanDomain(body.domain);
  if (!firstName || !lastName || !domain) {
    return json({ error: 'firstName, lastName and a valid employer domain are required' }, headers, 400);
  }

  const now = Date.now();
  const cooldownKey = `${userId}|${firstName.toLowerCase()}|${lastName.toLowerCase()}|${domain}`;
  const lastChecked = cooldownByKey.get(cooldownKey);
  if (lastChecked && now - lastChecked < LOOKUP_COOLDOWN_MS) {
    return json({ error: 'Checked very recently; try again shortly.' }, headers, 429);
  }
  const recent = (lookupTimesByUser.get(userId) || []).filter((stamp) => now - stamp < USER_HOURLY_WINDOW_MS);
  if (recent.length >= USER_HOURLY_LIMIT) {
    return json({ error: 'Lookup limit reached for this hour. Outreach works best one person at a time.' }, headers, 429);
  }
  recent.push(now);
  lookupTimesByUser.set(userId, recent);

  try {
    const result = await lookupContactEmail({ firstName, lastName, domain }, { apiKey });
    cooldownByKey.set(cooldownKey, now);
    if (!result) {
      return json({
        error: 'no_result',
        note: 'Hunter found no email for this person. No address was inferred from a name pattern.',
      }, headers);
    }
    return json(result, headers);
  } catch (error) {
    console.error(error instanceof Error ? error.message.slice(0, 300) : 'Contact lookup failed');
    return json({ error: 'Contact lookup failed; the provider may be unavailable. Try again shortly.' }, headers, 502);
  }
});

function corsHeaders(origin: string | null) {
  const allowedOrigins = [
    'https://ptroop.github.io',
    ...(Deno.env.get('ALLOWED_ORIGIN') ? [Deno.env.get('ALLOWED_ORIGIN')!] : []),
  ];
  const isLocalhost = origin && /^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(origin);
  const isAllowed = origin && (allowedOrigins.includes(origin) || isLocalhost);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (allowedOrigins[0] || '*'),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
