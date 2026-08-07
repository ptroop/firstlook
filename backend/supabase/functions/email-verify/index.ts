import { verifyEmail } from './email-verify.ts';

// In-memory guards. The route is public and keyless, so a small global cap
// prevents it being used as a free DNS oracle while staying generous for the
// app's own per-kit checks.
const EMAIL_COOLDOWN_MS = 30_000;
const GLOBAL_PER_MINUTE_LIMIT = 120;
const IP_PER_MINUTE_LIMIT = 40;
const GLOBAL_WINDOW_MS = 60_000;
const cooldownByEmail = new Map<string, number>();
const recentChecks: number[] = [];
const recentByIp = new Map<string, number[]>();

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('Origin'));
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, headers, 405);

  const url = new URL(request.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ error: 'A valid email address is required' }, headers, 400);
  }

  const now = Date.now();
  const lastChecked = cooldownByEmail.get(email);
  if (lastChecked && now - lastChecked < EMAIL_COOLDOWN_MS) {
    return json({ error: 'Checked very recently; try again shortly.' }, headers, 429);
  }
  while (recentChecks.length && now - recentChecks[0] > GLOBAL_WINDOW_MS) recentChecks.shift();
  if (recentChecks.length >= GLOBAL_PER_MINUTE_LIMIT) {
    return json({ error: 'Verification limit reached for this minute; try again shortly.' }, headers, 429);
  }
  recentChecks.push(now);
  if (recentByIp.size > 5000) recentByIp.clear();
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipTimes = (recentByIp.get(clientIp) || []).filter((stamp) => now - stamp < GLOBAL_WINDOW_MS);
  if (ipTimes.length >= IP_PER_MINUTE_LIMIT) {
    return json({ error: 'Too many checks from this address; try again shortly.' }, headers, 429);
  }
  ipTimes.push(now);
  recentByIp.set(clientIp, ipTimes);

  try {
    const verdict = await verifyEmail(email);
    cooldownByEmail.set(email, now);
    return json(verdict, headers);
  } catch (error) {
    console.error(error instanceof Error ? error.message.slice(0, 200) : 'Verification failed');
    return json({ error: 'Verification failed; the DNS provider may be unavailable. Try again shortly.' }, headers, 502);
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
