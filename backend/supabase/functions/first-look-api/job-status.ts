export type JobStatusVerdict = 'open' | 'closed' | 'unknown';

export interface JobStatusCheckResult {
  id: string;
  status: JobStatusVerdict;
  checkedAt: string;
  note: string;
}

interface StatusRow {
  official_detail_url?: string | null;
  official_apply_url?: string | null;
}

interface StatusSource {
  detail_url?: string | null;
  listing_url?: string | null;
  apply_url?: string | null;
  is_official?: boolean | null;
}

const CLOSED_PAGE_PATTERN = /(?:no longer (?:available|accepting|open|active|in effect)|(?:job|position|posting|requisition|vacancy|opening|role|listing)[^.!?\n]{0,80}(?:is|has|was)[^.!?\n]{0,40}(?:closed|filled|removed|expired|deleted|cancelled|canceled|unavailable|inactive)|(?:this|the) (?:job|position|posting|requisition|opening)[^.!?\n]{0,50}(?:has been|is now)[^.!?\n]{0,30}(?:closed|filled|removed)|job (?:not found|posting has been removed)|position (?:not found|no longer exists|filled)|no (?:open )?vacanc|(?:we'?re|we are|sorry)[^.!?\n]{0,80}(?:cannot|could not) be found|page (?:you )?requested[^.!?\n]{0,30}(?:cannot|could not) be found|page not found|opportunity no longer|no longer accept(?:ing|s) applications?|not currently accepting applications?|job expired|this role (?:is|has been) (?:closed|filled|removed)|position has been filled|unable to find (?:the )?(?:job|position|posting|requested page))/i;

function isGenericCareerUrl(url: string | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (/^\/(?:careers|jobs|work-with-us|search|index\.html)\/?$/i.test(parsed.pathname)) return true;
    if (/\.myworkdayjobs\.com\/careers\/?$/i.test(parsed.pathname)) return true;
    // D. E. Shaw's ApplicationPage1 URL is a shared application bundle, not a role-specific page.
    if (parsed.hostname.replace(/^www\./i, '').toLowerCase() === 'apply.deshawindia.com'
      && parsed.pathname.toLowerCase() === '/applicationpage1.html'
      && parsed.searchParams.get('entity')?.toUpperCase() === 'DESIS') return true;
    return false;
  } catch {
    return true;
  }
}

export function pickRoleStatusUrl(row: StatusRow, sources: StatusSource[] = []): string | null {
  const official = sources.find((source) => source.is_official);
  const candidates = [
    row.official_detail_url,
    row.official_apply_url,
    official?.detail_url,
    official?.apply_url,
    official?.listing_url,
    ...sources.map((source) => source.detail_url ?? source.listing_url ?? source.apply_url),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (isGenericCareerUrl(candidate)) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:') continue;
      return parsed.href;
    } catch {
      continue;
    }
  }
  return null;
}

export function classifyJobStatusPage(input: {
  httpStatus: number | null;
  finalUrl: string;
  body: string;
  contentType?: string | null;
}): { status: JobStatusVerdict; note: string } {
  const { httpStatus, finalUrl, body, contentType } = input;

  if (httpStatus === 404 || httpStatus === 410) {
    return { status: 'closed', note: 'The posting page returned 404 — it appears closed.' };
  }
  if (httpStatus === null || httpStatus >= 500) {
    return { status: 'unknown', note: 'The employer site could not be reached.' };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: 'unknown', note: 'The employer site blocked the check.' };
  }
  if (httpStatus === 301 || httpStatus === 302 || httpStatus === 307 || httpStatus === 308) {
    return { status: 'unknown', note: 'The posting redirected; the destination could not be confirmed.' };
  }
  if (httpStatus !== 200) {
    return { status: 'unknown', note: `Unexpected response (HTTP ${httpStatus}).` };
  }

  const isHtml = !contentType || /text\/html|application\/xhtml|application\/pdf/i.test(contentType);
  if (!isHtml) {
    return { status: 'open', note: 'The posting responded normally.' };
  }

  const raw = body.slice(0, 150_000);
  const title = raw.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
  const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Closed-wording only counts when it appears in the title or the top of the
  // page. Footer/sidebar boilerplate like "Can't find the job you're looking
  // for? Join our talent community" must not mislabel a live posting as closed.
  const head = `${title} ${text.slice(0, 2500)}`;

  if (CLOSED_PAGE_PATTERN.test(head)) {
    return { status: 'closed', note: 'The posting says it is no longer available.' };
  }
  if (text.length < 200) {
    return { status: 'unknown', note: 'The page did not contain readable content; it could not be confirmed.' };
  }
  if (isGenericCareerUrl(finalUrl)) {
    return { status: 'unknown', note: 'The check landed on a generic page; the role could not be confirmed.' };
  }
  return { status: 'open', note: 'The posting page is live.' };
}

export async function checkJobStatusUrl(
  url: string,
  deps: { fetcher?: typeof fetch; now?: () => Date } = {},
): Promise<{ status: JobStatusVerdict; checkedAt: string; note: string }> {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? (() => new Date());
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetcher(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);
    const contentType = response.headers.get('content-type');
    const body = await response.text().catch(() => '');
    const classification = classifyJobStatusPage({
      httpStatus: response.status,
      finalUrl: response.url || url,
      body,
      contentType,
    });
    return { status: classification.status, checkedAt: now().toISOString(), note: classification.note };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      status: 'unknown',
      checkedAt: now().toISOString(),
      note: timedOut ? 'The employer site took too long to respond.' : 'The employer site could not be reached.',
    };
  }
}
