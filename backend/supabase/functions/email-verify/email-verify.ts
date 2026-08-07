export type VerifyStatus =
  | 'invalid_format'
  | 'role_account'
  | 'disposable'
  | 'domain_no_mx'
  | 'accepts_mail'
  | 'unknown';

export interface EmailVerdict {
  email: string;
  status: VerifyStatus;
  label: string;
  provider: string;
  mxHosts: string[];
  checkedAt: string;
}

export interface VerifyDeps {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}

// Addresses that land in a shared inbox nobody reads. Sending to these is not
// wrong, but the app should flag them as low-value outreach targets.
export const ROLE_PREFIXES = [
  'info', 'hr', 'careers', 'jobs', 'job', 'recruiting', 'recruiter', 'talent',
  'support', 'contact', 'admin', 'sales', 'hello', 'team', 'office', 'mail',
  'postmaster', 'abuse', 'no-reply', 'noreply', 'webmaster', 'help', 'service',
  'enquiry', 'enquiries', 'inquiries', 'notifications', 'newsletter', 'reply',
];

// Well-known throwaway/temporary providers. A compact curated list, not a
// claim of completeness.
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'yopmail.com', 'guerrillamail.com', 'guerrillamail.org',
  'tempmail.com', 'temp-mail.org', '10minutemail.com', 'throwaway.email',
  'maildrop.cc', 'getnada.com', 'nada.email', 'trashmail.com', 'sharklasers.com',
  'mozmail.com', 'emailondeck.com', 'fakeinbox.com', 'mailnesia.com',
  'spamgourmet.com', 'dispostable.com', 'mailcatch.com', 'tempinbox.com',
  'mytemp.email', 'tmail.ws', 'inboxbear.com', 'discard.email', 'spam4.me',
  'mintemail.com', 'mailnull.com', 'jetable.org', 'mailexpire.com',
]);

// Provider hints matched against the MX hostname. Cosmetic context, not a
// verdict.
const PROVIDER_HINTS: Array<[RegExp, string]> = [
  [/google(mail)?\.com$/i, 'Google Workspace'],
  [/googlemail\.com$/i, 'Google Workspace'],
  [/outlook\.com$/i, 'Microsoft 365'],
  [/protection\.outlook\.com$/i, 'Microsoft 365'],
  [/mail\.protection\.outlook\.com$/i, 'Microsoft 365'],
  [/secureserver\.net$/i, 'GoDaddy'],
  [/amazonses\.com$/i, 'AWS WorkMail'],
  [/protonmail\.ch$/i, 'Proton'],
  [/zoho\.com$/i, 'Zoho'],
  [/mail\.ru$/i, 'Mail.ru'],
];

const EMAIL_LENGTH_LIMIT = 254;
const LOCAL_LENGTH_LIMIT = 64;

export function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

export function isRoleAccount(local: string): boolean {
  const prefix = local.toLowerCase().split(/[._+-]/)[0];
  return ROLE_PREFIXES.includes(prefix);
}

export function isDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

export function looksLikeEmail(email: string): boolean {
  const cleaned = email.trim().toLowerCase();
  if (cleaned.length < 6 || cleaned.length > EMAIL_LENGTH_LIMIT) return false;
  const parts = splitEmail(cleaned);
  if (!parts || parts.local.length === 0 || parts.local.length > LOCAL_LENGTH_LIMIT) return false;
  if (!/^[a-z0-9._%+-]+$/.test(parts.local)) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(parts.domain)) return false;
  return true;
}

export function parseMxAnswers(data: unknown): string[] {
  const answers = Array.isArray((data as { Answer?: unknown })?.Answer) ? (data as { Answer: Array<Record<string, unknown>> }).Answer : [];
  return answers
    .filter((answer) => Number(answer.type) === 15 && typeof answer.exchange === 'string')
    .map((answer) => String(answer.exchange).replace(/\.$/, '').toLowerCase());
}

export function detectProvider(mxHosts: string[]): string {
  for (const host of mxHosts) {
    for (const [regex, name] of PROVIDER_HINTS) {
      if (regex.test(host)) return name;
    }
  }
  return '';
}

export function statusLabel(status: VerifyStatus, provider: string): string {
  switch (status) {
    case 'invalid_format': return 'Not a valid email address';
    case 'role_account': return 'Looks like a shared role account (info@, hr@) — low reply rate';
    case 'disposable': return 'Disposable/temporary address — avoid sending there';
    case 'domain_no_mx': return 'Domain does not accept mail (no MX records)';
    case 'accepts_mail': return provider ? `Domain accepts mail · ${provider}` : 'Domain accepts mail';
    default: return 'Could not verify right now';
  }
}

/**
 * DNS-level verification only. SMTP mailbox probing is deliberately not part
 * of this: Edge Functions cannot open raw TCP connections, and enterprise mail
 * servers (banks especially) return catch-all or fake accept responses to SMTP
 * enumeration anyway. The verdicts stay honest: format, role, disposable and
 * "domain accepts mail" — never a false claim of mailbox-level validity.
 */
export async function verifyEmail(email: string, deps: VerifyDeps = {}): Promise<EmailVerdict> {
  const fetcher = deps.fetcher || ((url: string, init?: RequestInit) => fetch(url, init));
  const now = deps.now || (() => new Date());
  const cleaned = email.trim().toLowerCase();

  if (!looksLikeEmail(cleaned)) {
    return { email: cleaned, status: 'invalid_format', label: statusLabel('invalid_format', ''), provider: '', mxHosts: [], checkedAt: now().toISOString() };
  }
  const parts = splitEmail(cleaned) as { local: string; domain: string };

  if (isRoleAccount(parts.local)) {
    return { email: cleaned, status: 'role_account', label: statusLabel('role_account', ''), provider: '', mxHosts: [], checkedAt: now().toISOString() };
  }
  if (isDisposable(parts.domain)) {
    return { email: cleaned, status: 'disposable', label: statusLabel('disposable', ''), provider: '', mxHosts: [], checkedAt: now().toISOString() };
  }

  let mxHosts: string[] | null = null;
  try {
    mxHosts = await mxHostsOf(parts.domain, fetcher);
  } catch (_error) {
    return { email: cleaned, status: 'unknown', label: statusLabel('unknown', ''), provider: '', mxHosts: [], checkedAt: now().toISOString() };
  }
  if (mxHosts === null || mxHosts.length === 0) {
    return { email: cleaned, status: 'domain_no_mx', label: statusLabel('domain_no_mx', ''), provider: '', mxHosts: [], checkedAt: now().toISOString() };
  }
  const provider = detectProvider(mxHosts);
  return {
    email: cleaned,
    status: 'accepts_mail',
    label: statusLabel('accepts_mail', provider),
    provider,
    mxHosts,
    checkedAt: now().toISOString(),
  };
}

// DNS-over-HTTPS with a Google primary and Cloudflare fallback. Both are free,
// keyless JSON endpoints. An RFC 1035 Status of 0 (NOERROR) or 3 (NXDOMAIN)
// is authoritative; SERVFAIL (2) and other error statuses are lookup failures
// and fall through to the second provider instead of being misread as
// "domain does not accept mail".
async function mxHostsOf(
  domain: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string[] | null> {
  const attempts: Array<{ url: string; init?: RequestInit }> = [
    { url: `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX` },
    { url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, init: { headers: { Accept: 'application/dns-json' } } },
  ];
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const response = await fetcher(attempt.url, attempt.init);
      if (!response.ok) {
        lastError = new Error(`DoH responded ${response.status}`);
        continue;
      }
      const data = await response.json();
      const status = Number((data as { Status?: unknown })?.Status);
      const hosts = parseMxAnswers(data);
      const authoritative = status === 0 || status === 3;
      if (authoritative) return hosts;
      lastError = new Error(`DoH returned status ${status}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}
