export const HUNTER_API_BASE = 'https://api.hunter.io/v2';

export interface ContactLookupInput {
  firstName: string;
  lastName: string;
  domain: string;
}

export interface ContactLookupResult {
  email: string;
  confidence: number;
  verification: 'valid' | 'accept_all' | 'webmail' | 'disposable' | 'invalid' | 'unknown';
  source: string;
  observedAt: string;
}

export interface LookupDeps {
  apiKey: string;
  fetcher?: (url: string) => Promise<Response>;
  now?: () => Date;
}

export function normalizeVerification(value: string): ContactLookupResult['verification'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'valid') return 'valid';
  if (normalized === 'accept_all') return 'accept_all';
  if (normalized === 'webmail') return 'webmail';
  if (normalized === 'disposable') return 'disposable';
  if (normalized === 'invalid') return 'invalid';
  return 'unknown';
}

/**
 * Runs Hunter Email Finder for one named person on one employer domain and
 * returns the result with its confidence, verification and evidence source.
 *
 * Boundaries (see docs/hunter-contact-lookup.md): this never runs Domain
 * Search, never returns a bulk employee list, and never infers an address
 * from a name pattern when Hunter has no result (returns null instead).
 */
export async function lookupContactEmail(
  input: ContactLookupInput,
  deps: LookupDeps,
): Promise<ContactLookupResult | null> {
  const fetcher = deps.fetcher || ((url: string) => fetch(url));
  const now = deps.now || (() => new Date());
  const query = [
    `domain=${encodeURIComponent(input.domain)}`,
    `first_name=${encodeURIComponent(input.firstName)}`,
    `last_name=${encodeURIComponent(input.lastName)}`,
    `api_key=${encodeURIComponent(deps.apiKey)}`,
  ].join('&');
  const response = await fetcher(`${HUNTER_API_BASE}/email-finder?${query}`);
  if (!response.ok) throw new Error(`Hunter request failed with ${response.status}`);
  const payload = await response.json();
  const data = payload?.data;
  const email = typeof data?.email === 'string' && data.email ? data.email.trim() : '';
  if (!email) return null;

  const sources = Array.isArray(data.sources) ? data.sources : [];
  const source = String(sources[0]?.uri || sources[0]?.website || '').trim().slice(0, 500);
  return {
    email,
    confidence: Number.isFinite(Number(data.score)) ? Math.round(Number(data.score)) : 0,
    verification: normalizeVerification(String(data.verification?.status || '')),
    source,
    observedAt: now().toISOString(),
  };
}

export function cleanName(value: unknown): string {
  return String(value || '')
    .replace(/[^A-Za-z\-. ']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function cleanDomain(value: unknown): string {
  const candidate = String(value || '').trim().toLowerCase().slice(0, 253);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(candidate)) return '';
  return candidate;
}

/**
 * Decodes the `sub` (user id) from a validated Supabase JWT. The deployed
 * function runs with verify_jwt = true, so the platform has already rejected
 * missing or invalid tokens; this only reads the identity claim back out.
 */
export function decodeJwtSubject(authorization: string): string {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : '';
  } catch (_error) {
    return '';
  }
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}
