export type ExclusionReason =
  | 'not_india'
  | 'not_finance'
  | 'experience_over_limit'
  | 'experience_unknown';

export type Classification = 'match' | ExclusionReason;
export type ConnectorStatus = 'success' | 'partial' | 'failed' | 'unsupported';
export type SourceType =
  | 'official_career'
  | 'linkedin'
  | 'naukri'
  | 'iimjobs'
  | 'indeed'
  | 'other';
export type ScanRunType = 'watch' | 'reconcile' | 'hydrate';
export type EnumerationStatus = 'complete' | 'partial' | 'failed' | 'unsupported' | 'anomalous';
export type HydrationStatus = 'complete' | 'backlog' | 'degraded';
export type CandidateStatus = 'hydrate' | 'defer' | 'hydrated' | 'audit';
export type CandidateReason =
  | 'finance_metadata'
  | 'early_career_title'
  | 'generic_title'
  | 'missing_category'
  | 'missing_department'
  | 'education_signal'
  | 'portal_corroborated'
  | 'connector_rule'
  | 'insufficient_exclusion_evidence'
  | 'strong_non_finance_category';
export type LocationStatus = 'india' | 'not_india' | 'uncertain';
export type FinanceStatus = 'exact' | 'likely' | 'unrelated' | 'unclassified';
export type ExperienceStatus = 'zero_to_two' | 'ambiguous' | 'over_two' | 'unclassified';
export type MatchTier = 'exact' | 'possible' | 'not_targeted';
export type ClassificationMethod = 'deterministic' | 'openrouter' | 'mixed' | 'pending';

export interface InventoryListing {
  connectorId: string;
  sourceExternalId: string;
  company: string;
  title: string;
  location: string | null;
  category: string | null;
  department: string | null;
  detailUrl: string;
  listingMetadataHash: string;
  rawMetadata: Record<string, unknown>;
}

export interface CandidateDecision {
  status: 'hydrate' | 'defer';
  reasons: CandidateReason[];
}

export interface HydratedSourceObservation {
  connectorId: string;
  sourceType: SourceType;
  sourceName: string;
  sourceExternalId: string | null;
  company: string;
  employerJobId: string | null;
  listingUrl: string;
  detailUrl: string;
  applyUrl: string | null;
  isOfficial: boolean;
  title: string;
  location: string;
  description: string;
  jobCategory: string;
  postedAt: string | null;
  listingMetadataHash: string;
  contentHash: string;
  rawMetadata: Record<string, unknown>;
}

export interface CanonicalJobInput {
  company: string;
  employerJobId: string | null;
  title: string;
  location: string;
  description: string;
  jobCategory: string;
  postedAt: string | null;
  officialDetailUrl: string | null;
  officialApplyUrl: string | null;
  descriptionHash: string;
}

export interface SourceConnectorDiagnostic {
  company: string;
  connectorId: string;
  connectorVersion: string;
  sourceType: SourceType;
  runType: ScanRunType;
  status: EnumerationStatus;
  hydrationStatus: HydrationStatus;
  reportedTotal: number | null;
  pagesExpected: number | null;
  pagesFetched: number;
  listingsDiscovered: number;
  inventoryCreated: number;
  inventoryChanged: number;
  candidatesSelected: number;
  detailsDue: number;
  detailsFetched: number;
  detailsBacklogged: number;
  applyUrlsResolved: number;
  candidateObservationsPersisted: number;
  newObservations: number;
  changedObservations: number;
  canonicalJobsCreated: number;
  excluded: Record<string, number>;
  errorSummaries: string[];
  startedAt: string;
  finishedAt: string;
}

export interface ConnectorRunRequest {
  runType: ScanRunType;
  detailBatchSize: number;
  now: Date;
}

export interface ConnectorRunResult {
  connectorId: string;
  runType: ScanRunType;
  inventory: InventoryListing[];
  observations: HydratedSourceObservation[];
  diagnostic: SourceConnectorDiagnostic;
}

export interface NormalizedJob {
  id: string;
  employerJobId: string;
  company: string;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  location: string;
  description: string;
  experienceText: string;
  jobCategory: string;
  postedAt: string | null;
}

export interface ConnectorDiagnostic {
  company: string;
  status: ConnectorStatus;
  discoveredCount: number;
  fetchedCount: number;
  matchingCount: number;
  excluded: Partial<Record<ExclusionReason | 'malformed', number>>;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface ConnectorResult {
  jobs: NormalizedJob[];
  diagnostic: ConnectorDiagnostic;
}

export type JobFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface JobConnector {
  company: string;
  run: () => Promise<ConnectorResult>;
}
