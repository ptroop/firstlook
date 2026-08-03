import type { HydratedSourceObservation } from './types.ts';

export interface CanonicalCandidate {
  id: string;
  company: string;
  employerJobId: string | null;
  title: string;
  location: string;
  postedAt: string | null;
  officialDetailUrl: string | null;
  officialApplyUrl: string | null;
  descriptionHash: string | null;
  officialVerifiedAt: string | null;
  description?: string;
  jobCategory?: string;
}

export interface CanonicalLinkDecision {
  status: 'linked' | 'pending' | 'conflict';
  jobId: string | null;
  matchedBy: 'employer_job_id' | 'official_url' | 'fingerprint' | null;
}

export function decideCanonicalLink(
  observation: HydratedSourceObservation,
  candidates: CanonicalCandidate[],
): CanonicalLinkDecision {
  const company = normalizeText(observation.company);
  const sameCompany = candidates.filter((candidate) => normalizeText(candidate.company) === company);
  const observationUrls = new Set([observation.detailUrl, observation.applyUrl].filter(Boolean).map(canonicalUrl));

  const urlMatches = sameCompany.filter((candidate) => [candidate.officialDetailUrl, candidate.officialApplyUrl]
    .filter(Boolean)
    .map(canonicalUrl)
    .some((url) => observationUrls.has(url)));
  // D. E. Shaw's ApplicationPage1 URL is a shared application bundle, not a
  // role identity. The detail-page employer ID must win, otherwise every
  // distinct listing conflicts with the first role using that bundle URL.
  const identityUrlMatches = isSharedApplicationUrl(observation.applyUrl) ? [] : urlMatches;
  if (identityUrlMatches.some((candidate) => identifiersConflict(observation.employerJobId, candidate.employerJobId))) {
    return { status: 'conflict', jobId: null, matchedBy: null };
  }

  if (observation.employerJobId) {
    const idMatch = sameCompany.find((candidate) => candidate.employerJobId === observation.employerJobId);
    if (idMatch) return { status: 'linked', jobId: idMatch.id, matchedBy: 'employer_job_id' };
  }

  if (identityUrlMatches.length === 1) {
    return { status: 'linked', jobId: identityUrlMatches[0].id, matchedBy: 'official_url' };
  }
  if (identityUrlMatches.length > 1) return { status: 'conflict', jobId: null, matchedBy: null };

  const fingerprintMatches = sameCompany.filter((candidate) =>
    normalizeText(candidate.title) === normalizeText(observation.title)
      && normalizeText(candidate.location) === normalizeText(observation.location)
      && dateOnly(candidate.postedAt) === dateOnly(observation.postedAt));
  if (fingerprintMatches.length === 1) {
    return { status: 'linked', jobId: fingerprintMatches[0].id, matchedBy: 'fingerprint' };
  }
  if (fingerprintMatches.length > 1) return { status: 'conflict', jobId: null, matchedBy: null };
  return { status: 'pending', jobId: null, matchedBy: null };
}

export function mergeCanonicalJob(
  existing: CanonicalCandidate & { description?: string; jobCategory?: string },
  incoming: HydratedSourceObservation,
  verifiedAt: string,
): CanonicalCandidate & { description: string; jobCategory: string } {
  const officialMayReplace = incoming.isOfficial
    && (!existing.officialVerifiedAt || verifiedAt >= existing.officialVerifiedAt);
  const choose = (current: string | null | undefined, next: string | null | undefined) =>
    officialMayReplace ? (next || current || '') : (current || next || '');

  return {
    ...existing,
    employerJobId: officialMayReplace ? (incoming.employerJobId || existing.employerJobId) : existing.employerJobId,
    title: choose(existing.title, incoming.title),
    location: choose(existing.location, incoming.location),
    postedAt: officialMayReplace ? (incoming.postedAt || existing.postedAt) : existing.postedAt,
    officialDetailUrl: incoming.isOfficial
      ? choose(existing.officialDetailUrl, incoming.detailUrl)
      : existing.officialDetailUrl,
    officialApplyUrl: incoming.isOfficial
      ? choose(existing.officialApplyUrl, incoming.applyUrl)
      : existing.officialApplyUrl,
    officialVerifiedAt: incoming.isOfficial && officialMayReplace ? verifiedAt : existing.officialVerifiedAt,
    description: choose(existing.description, incoming.description),
    jobCategory: choose(existing.jobCategory, incoming.jobCategory),
    descriptionHash: officialMayReplace ? incoming.contentHash : existing.descriptionHash,
  };
}

export function makeCanonicalJobId(observation: HydratedSourceObservation): string {
  const identity = observation.employerJobId
    || canonicalUrl(observation.detailUrl)
    || `${observation.title}\u0000${observation.location}\u0000${observation.postedAt ?? ''}`;
  return `${slug(observation.company)}_${stableHash(identity).toString(16)}`;
}

function identifiersConflict(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left !== right);
}

function canonicalUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|source$|src$|ref$|trk$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\?$/, '').toLowerCase();
  } catch {
    return input.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function isSharedApplicationUrl(input: string | null): boolean {
  if (!input) return false;
  try {
    const url = new URL(input);
    const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
    return url.hostname.toLowerCase().replace(/^www\./, '') === 'apply.deshawindia.com'
      && url.pathname.toLowerCase() === '/applicationpage1.html'
      && url.searchParams.get('entity')?.toUpperCase() === 'DESIS'
      && keys.every((key) => key === 'entity');
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateOnly(value: string | null): string {
  return value?.slice(0, 10) ?? '';
}

function slug(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
