export type ExclusionReason =
  | 'not_india'
  | 'not_finance'
  | 'experience_over_limit'
  | 'experience_unknown';

export type Classification = 'match' | ExclusionReason;
export type ConnectorStatus = 'success' | 'partial' | 'failed' | 'unsupported';

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

