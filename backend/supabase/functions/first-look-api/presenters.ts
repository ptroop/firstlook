import type { MatchTier, SourceType } from './types.ts';

export interface JobRow {
  id: string;
  company: string;
  official_detail_url: string | null;
  official_apply_url: string | null;
  title: string;
  location: string;
  description: string;
  first_seen_at: string;
  last_seen_at: string;
  posted_at: string | null;
  match_tier: MatchTier;
  classification_method: string;
  location_status: string;
  finance_status: string;
  experience_status: string;
  minimum_years: number | null;
  maximum_years: number | null;
  classified_at: string | null;
}

export interface SourceRow {
  id: number;
  job_id: string;
  connector_id: string;
  source_type: SourceType | string;
  source_name: string;
  source_external_id: string | null;
  listing_url: string;
  detail_url: string | null;
  apply_url: string | null;
  is_official: boolean;
  last_verified_at: string | null;
  active: boolean;
  hydration_status: string;
}

export interface HealthRow {
  connector_id: string;
  run_type: string;
  status: string;
  finished_at: string;
}

export type PresentedJob = ReturnType<typeof presentJob>;

export function presentJob(row: JobRow, sourceRows: SourceRow[] = [], healthRows: HealthRow[] = []) {
  const sources = sourceRows
    .filter((source) => source.job_id === row.id && source.active)
    .sort((left, right) => Number(right.is_official) - Number(left.is_official) || dateValue(right.last_verified_at) - dateValue(left.last_verified_at))
    .map((source) => ({
      id: source.id,
      type: source.source_type,
      name: source.source_name,
      externalId: source.source_external_id,
      listingUrl: source.listing_url,
      detailUrl: source.detail_url,
      applyUrl: source.apply_url,
      official: source.is_official,
      verifiedAt: source.last_verified_at,
      hydrationStatus: source.hydration_status,
    }));
  const officialSource = sources.find((source) => source.official);
  const fallbackSource = sources.find((source) => source.applyUrl || source.detailUrl || source.listingUrl);
  const applyUrl = row.official_apply_url
    || officialSource?.applyUrl
    || officialSource?.detailUrl
    || fallbackSource?.applyUrl
    || fallbackSource?.detailUrl
    || fallbackSource?.listingUrl
    || null;
  const applySourceType = row.official_apply_url || officialSource ? 'official_career' : fallbackSource?.type ?? null;
  const connectorIds = new Set(sourceRows.filter((source) => source.job_id === row.id).map((source) => source.connector_id));
  const relevantHealth = healthRows.filter((health) => connectorIds.has(health.connector_id));
  const watchFreshness = newestComplete(relevantHealth, 'watch');
  const reconcileFreshness = newestComplete(relevantHealth, 'reconcile');
  const sourceHealthState = worstHealth(relevantHealth);
  const officialVerified = Boolean(officialSource?.verifiedAt);

  return {
    id: row.id,
    company: row.company,
    title: row.title,
    location: row.location,
    description: row.description,
    applyUrl,
    applySourceType,
    officialDetailUrl: row.official_detail_url,
    officialApplyUrl: row.official_apply_url,
    officialVerified,
    verificationNote: officialVerified ? null : 'Official listing not yet verified',
    matchTier: row.match_tier,
    classificationMethod: row.classification_method,
    eligibilityNote: row.match_tier === 'possible' ? 'Experience or relevance unconfirmed' : null,
    evidence: conciseEvidence(row),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    postedAt: row.posted_at,
    classifiedAt: row.classified_at,
    newestVerificationAt: newestDate(sources.map((source) => source.verifiedAt)),
    watchFreshness,
    reconcileFreshness,
    sourceHealthState,
    sources,
  };
}

export function sortPresentedJobs<T extends { matchTier: MatchTier; firstSeenAt: string }>(jobs: T[]): T[] {
  const rank: Record<MatchTier, number> = { exact: 0, possible: 1, not_targeted: 2 };
  return [...jobs].sort((left, right) => rank[left.matchTier] - rank[right.matchTier]
    || dateValue(right.firstSeenAt) - dateValue(left.firstSeenAt));
}

export interface CoverageRow extends HealthRow {
  source_company: string;
  source_type: string;
  run_type: 'watch' | 'reconcile' | 'hydrate';
  hydration_status: string;
  reported_total: number | null;
  pages_expected: number | null;
  pages_fetched: number;
  listings_discovered: number;
  details_due: number;
  details_fetched: number;
  details_backlogged: number;
  apply_urls_resolved: number;
  error_summary: unknown;
  [key: string]: unknown;
}

export function presentCoverage(rows: CoverageRow[]) {
  const groups = new Map<string, CoverageRow[]>();
  for (const row of rows) {
    const list = groups.get(row.connector_id) ?? [];
    list.push(row);
    groups.set(row.connector_id, list);
  }
  return [...groups.entries()].map(([connectorId, entries]) => {
    const ordered = [...entries].sort((left, right) => dateValue(right.finished_at) - dateValue(left.finished_at));
    const latest = ordered[0];
    const watch = ordered.find((item) => item.run_type === 'watch') ?? null;
    const reconcile = ordered.find((item) => item.run_type === 'reconcile') ?? null;
    const incomplete = ordered.find((item) => item.status !== 'complete' && boundedErrors(item.error_summary).length > 0);
    return {
      connectorId,
      company: latest.source_company,
      sourceType: latest.source_type,
      latestStatus: latest.status,
      latestHydrationStatus: latest.hydration_status,
      lastCompleteWatchAt: completedAt(ordered, 'watch'),
      lastCompleteReconcileAt: completedAt(ordered, 'reconcile'),
      reportedTotal: latest.reported_total,
      candidateBacklog: latest.details_backlogged,
      watch: watch ? coverageProgress(watch) : null,
      reconcile: reconcile ? coverageProgress(reconcile) : null,
      anomalySummary: incomplete ? boundedErrors(incomplete.error_summary).join('; ').slice(0, 500) : null,
    };
  }).sort((left, right) => left.company.localeCompare(right.company));
}

function coverageProgress(row: CoverageRow) {
  return {
    status: row.status,
    hydrationStatus: row.hydration_status,
    finishedAt: row.finished_at,
    reportedTotal: row.reported_total,
    listingsDiscovered: row.listings_discovered,
    pagesExpected: row.pages_expected,
    pagesFetched: row.pages_fetched,
    detailsDue: row.details_due,
    detailsFetched: row.details_fetched,
    detailsBacklogged: row.details_backlogged,
    applyUrlsResolved: row.apply_urls_resolved,
    unresolvedApplyUrls: Math.max(0, row.details_fetched - row.apply_urls_resolved),
  };
}

function conciseEvidence(row: JobRow): string[] {
  const evidence: string[] = [];
  if (row.location_status === 'india') evidence.push('India location');
  if (row.finance_status === 'exact') evidence.push('Finance relevance confirmed');
  else if (row.finance_status === 'likely') evidence.push('Finance relevance likely');
  if (row.experience_status === 'zero_to_two') evidence.push(formatExperience(row.minimum_years, row.maximum_years));
  else if (row.experience_status === 'ambiguous') evidence.push('Experience requirement unclear');
  return evidence.slice(0, 3);
}

function formatExperience(minimum: number | null, maximum: number | null): string {
  if (minimum !== null && maximum !== null) return `${minimum}-${maximum} years`;
  if (maximum !== null) return `Up to ${maximum} years`;
  return 'Entry-level experience wording';
}

function newestComplete(rows: HealthRow[], runType: string): string | null {
  return newestDate(rows.filter((row) => row.run_type === runType && row.status === 'complete').map((row) => row.finished_at));
}

function completedAt(rows: CoverageRow[], runType: string): string | null {
  return rows.find((row) => row.run_type === runType && row.status === 'complete')?.finished_at ?? null;
}

function newestDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort((left, right) => dateValue(right) - dateValue(left))[0] ?? null;
}

function worstHealth(rows: HealthRow[]): string {
  if (rows.length === 0) return 'unknown';
  const rank: Record<string, number> = { complete: 0, partial: 1, unsupported: 2, anomalous: 3, failed: 4 };
  return [...rows].sort((left, right) => (rank[right.status] ?? 4) - (rank[left.status] ?? 4))[0].status;
}

function boundedErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, 3).map((item) => item.slice(0, 200));
}

function dateValue(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}
