import type {
  CandidateDecision,
  CanonicalJobInput,
  ConnectorDiagnostic,
  HydratedSourceObservation,
  InventoryListing,
  NormalizedJob,
  SourceConnectorDiagnostic,
} from '../types.ts';
import type { DeterministicClassification } from '../classification/deterministic.ts';
import type { OpenRouterClassification } from '../classification/openrouter.ts';
import type { CanonicalCandidate } from '../canonicalize.ts';
import { readJsonBody } from '../http.ts';
import type { ScanStore } from '../scan.ts';

export interface RestClient {
  request(path: string, options?: RequestInit): Promise<any>;
}

export function createSupabaseRestClient(options: {
  baseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}): RestClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async request(path, requestOptions = {}) {
      const response = await fetchImpl(`${options.baseUrl}${path}`, {
        ...requestOptions,
        headers: {
          apikey: options.serviceRoleKey,
          Authorization: `Bearer ${options.serviceRoleKey}`,
          'Content-Type': 'application/json',
          ...(requestOptions.headers || {}),
        },
      });
      if (!response.ok) {
        const method = requestOptions.method || 'GET';
        const resource = path.split('?')[0];
        throw new Error(`Supabase ${method} ${resource} failed with HTTP ${response.status}`);
      }
      return readJsonBody(response);
    },
  };
}

export function createLegacyScanStore(client: RestClient): ScanStore {
  return {
    async startRun(startedAt) {
      const rows = await client.request('/rest/v1/scan_runs', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ started_at: startedAt }),
      });
      return rows[0]?.id || null;
    },
    async upsertJob(job, seenAt) {
      await client.request('/rest/v1/jobs?on_conflict=id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(legacyJobRow(job, seenAt)),
      });
    },
    async deactivateMissingForSource(company, activeIds) {
      await client.request('/rest/v1/rpc/deactivate_missing_jobs', {
        method: 'POST', body: JSON.stringify({ p_source_company: company, p_active_ids: activeIds }),
      });
    },
    async recordSourceResult(runId, diagnostic) {
      await client.request('/rest/v1/source_scan_runs', {
        method: 'POST', body: JSON.stringify(legacyDiagnosticRow(runId, diagnostic)),
      });
    },
    async finishRun(runId, summary, finishedAt) {
      if (!runId) return;
      await client.request(`/rest/v1/scan_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          finished_at: finishedAt,
          sources_checked: summary.sourcesChecked,
          jobs_found: summary.jobsFound,
          error_count: summary.errorCount,
        }),
      });
    },
  };
}

export interface SelectedInventory {
  listing: InventoryListing;
  decision: CandidateDecision;
}

export interface StartRunInput {
  connectorId: string;
  connectorVersion: string;
  company: string;
  runType: 'watch' | 'reconcile' | 'hydrate';
  sourceType?: string;
  startedAt: string;
  scanRunId?: number | null;
}

export interface SourceAwareStore {
  startRun(input: StartRunInput): Promise<number>;
  upsertInventory(runId: number, rows: SelectedInventory[], seenAt: string): Promise<void>;
  dueCandidates(connectorId: string, limit: number): Promise<InventoryListing[]>;
  persistObservation(runId: number, observation: HydratedSourceObservation, seenAt: string): Promise<number>;
  markInventoryHydrated(connectorId: string, sourceExternalId: string, metadataHash: string, hydratedAt: string): Promise<void>;
  findCanonicalCandidates(company: string): Promise<CanonicalCandidate[]>;
  getCachedClassification?(jobId: string, descriptionHash: string, version: string): Promise<OpenRouterClassification | null>;
  upsertCanonicalJob(jobId: string, job: CanonicalJobInput, classification: DeterministicClassification, seenAt: string): Promise<void>;
  enqueueNotification?(jobId: string, title: string, company: string, payload: Record<string, unknown>): Promise<void>;
  linkObservation(sourceId: number, jobId: string | null, status: 'linked' | 'pending' | 'conflict'): Promise<void>;
  saveClassification(jobId: string, record: Record<string, unknown>): Promise<void>;
  finishRun(runId: number, diagnostic: SourceConnectorDiagnostic): Promise<void>;
  finalizeCompleteReconciliation(connectorId: string, runId: number): Promise<void>;
}

export function createSourceAwareStore(client: RestClient): SourceAwareStore {
  return {
    async startRun(input) {
      const rows = await client.request('/rest/v1/source_scan_runs', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          scan_run_id: input.scanRunId ?? null,
          source_company: input.company,
          source_type: input.sourceType ?? 'official_career',
          connector_id: input.connectorId,
          connector_version: input.connectorVersion,
          run_type: input.runType,
          status: 'partial',
          hydration_status: 'backlog',
          started_at: input.startedAt,
          finished_at: input.startedAt,
        }),
      });
      const id = Number(rows?.[0]?.id);
      if (!Number.isFinite(id)) throw new Error(`Source run was not created for ${input.connectorId}`);
      return id;
    },

    async upsertInventory(runId, rows, seenAt) {
      if (rows.length === 0) return;
      const connectorId = rows[0].listing.connectorId;
      const existingRows = await client.request(`/rest/v1/source_inventory?connector_id=eq.${encodeURIComponent(connectorId)}&select=source_external_id,candidate_status,last_hydrated_at,hydrated_metadata_hash&limit=5000`);
      const existingById = new Map((existingRows ?? []).map((row: Record<string, unknown>) => [String(row.source_external_id), row]));
      const payload = rows.map(({ listing, decision }) => {
        const existing = existingById.get(listing.sourceExternalId);
        const remainsHydrated = existing?.candidate_status === 'hydrated'
          && existing.hydrated_metadata_hash === listing.listingMetadataHash;
        return {
        connector_id: listing.connectorId,
        source_external_id: listing.sourceExternalId,
        company: listing.company,
        title: listing.title,
        location: listing.location,
        category: listing.category,
        department: listing.department,
        detail_url: listing.detailUrl,
        listing_metadata_hash: listing.listingMetadataHash,
        last_seen_at: seenAt,
        last_scan_run_id: runId,
        candidate_status: remainsHydrated ? 'hydrated' : decision.status,
        candidate_reasons: decision.reasons,
        consecutive_complete_misses: 0,
        active: true,
        last_hydrated_at: remainsHydrated ? existing.last_hydrated_at : null,
        hydrated_metadata_hash: remainsHydrated ? existing.hydrated_metadata_hash : null,
      };
      });
      await client.request('/rest/v1/source_inventory?on_conflict=connector_id,source_external_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(payload),
      });
    },

    async dueCandidates(connectorId, limit) {
      const boundedLimit = Math.max(0, Math.min(500, Math.floor(limit)));
      const path = `/rest/v1/source_inventory?connector_id=eq.${encodeURIComponent(connectorId)}&active=eq.true&candidate_status=in.(hydrate,audit)&select=*&order=last_hydrated_at.asc.nullsfirst,first_seen_at.desc&limit=${boundedLimit}`;
      const rows = await client.request(path);
      return (rows ?? []).map(inventoryFromRow);
    },

    async persistObservation(runId, observation, seenAt) {
      const path = observation.sourceExternalId
        ? '/rest/v1/job_sources?on_conflict=source_type,source_name,source_external_id'
        : '/rest/v1/job_sources?on_conflict=source_type,source_name,url_fingerprint';
      const rows = await client.request(path, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          connector_id: observation.connectorId,
          canonicalization_status: 'pending',
          source_type: observation.sourceType,
          source_name: observation.sourceName,
          source_external_id: observation.sourceExternalId,
          url_fingerprint: stableHash(canonicalUrl(observation.detailUrl || observation.listingUrl)).toString(16),
          listing_url: observation.listingUrl,
          detail_url: observation.detailUrl,
          apply_url: observation.applyUrl,
          is_official: observation.isOfficial,
          last_seen_at: seenAt,
          last_verified_at: seenAt,
          active: true,
          consecutive_complete_misses: 0,
          listing_metadata_hash: observation.listingMetadataHash,
          content_hash: observation.contentHash,
          hydration_status: 'complete',
          detail_checked_at: seenAt,
          next_detail_check_at: new Date(Date.parse(seenAt) + 24 * 60 * 60 * 1000).toISOString(),
          first_scan_run_id: runId,
          last_scan_run_id: runId,
          raw_metadata: boundJson(observation.rawMetadata),
        }),
      });
      const id = Number(rows?.[0]?.id);
      if (!Number.isFinite(id)) throw new Error(`Source observation was not persisted for ${observation.sourceName}`);
      return id;
    },

    async markInventoryHydrated(connectorId, sourceExternalId, metadataHash, hydratedAt) {
      await client.request(`/rest/v1/source_inventory?connector_id=eq.${encodeURIComponent(connectorId)}&source_external_id=eq.${encodeURIComponent(sourceExternalId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          candidate_status: 'hydrated',
          hydrated_metadata_hash: metadataHash,
          last_hydrated_at: hydratedAt,
        }),
      });
    },

    async findCanonicalCandidates(company) {
      const rows = await client.request(`/rest/v1/jobs?company=eq.${encodeURIComponent(company)}&select=id,company,employer_job_id,title,location,posted_at,official_detail_url,official_apply_url,description_hash,description,job_category`);
      return (rows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        company: String(row.company),
        employerJobId: typeof row.employer_job_id === 'string' ? row.employer_job_id : null,
        title: String(row.title),
        location: String(row.location ?? ''),
        postedAt: typeof row.posted_at === 'string' ? row.posted_at : null,
        officialDetailUrl: typeof row.official_detail_url === 'string' ? row.official_detail_url : null,
        officialApplyUrl: typeof row.official_apply_url === 'string' ? row.official_apply_url : null,
        descriptionHash: typeof row.description_hash === 'string' ? row.description_hash : null,
        officialVerifiedAt: null,
        description: String(row.description ?? ''),
        jobCategory: String(row.job_category ?? ''),
      }));
    },

    async getCachedClassification(jobId, descriptionHash, version) {
      const path = `/rest/v1/job_classifications?job_id=eq.${encodeURIComponent(jobId)}&description_hash=eq.${encodeURIComponent(descriptionHash)}&classification_version=eq.${encodeURIComponent(version)}&select=final_result,model_result,requested_model_id,actual_model_id,confidence,validation_errors&limit=1`;
      const rows = await client.request(path);
      const row = rows?.[0];
      if (!isRecord(row) || !isRecord(row.final_result)) return null;
      return {
        finalResult: row.final_result as unknown as DeterministicClassification,
        modelResult: isRecord(row.model_result) ? row.model_result as OpenRouterClassification['modelResult'] : null,
        requestedModelId: typeof row.requested_model_id === 'string' ? row.requested_model_id : null,
        actualModelId: typeof row.actual_model_id === 'string' ? row.actual_model_id : null,
        confidence: typeof row.confidence === 'number' ? row.confidence : Number(row.confidence ?? 0.6),
        validationErrors: Array.isArray(row.validation_errors)
          ? row.validation_errors.filter((item): item is string => typeof item === 'string').slice(0, 10)
          : [],
        cacheHit: false,
      };
    },

    async upsertCanonicalJob(jobId, job, classification, seenAt) {
      await client.request('/rest/v1/jobs?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id: jobId,
          company: job.company,
          source_company: job.company,
          employer_job_id: job.employerJobId,
          source_url: job.officialDetailUrl || job.officialApplyUrl || '',
          apply_url: job.officialApplyUrl || job.officialDetailUrl || '',
          official_detail_url: job.officialDetailUrl,
          official_apply_url: job.officialApplyUrl,
          title: job.title,
          location: job.location,
          description: job.description.slice(0, 20_000),
          experience_text: classification.evidence.experience.join('; '),
          job_category: job.jobCategory,
          posted_at: job.postedAt,
          location_status: classification.locationStatus,
          finance_status: classification.financeStatus,
          experience_status: classification.experienceStatus,
          minimum_years: classification.minimumYears,
          maximum_years: classification.maximumYears,
          match_tier: classification.matchTier,
          classification_method: classification.classificationMethod,
          classification_version: 'deterministic-v1',
          description_hash: job.descriptionHash,
          classified_at: seenAt,
          last_seen_at: seenAt,
          active: true,
          consecutive_complete_misses: 0,
          closed_at: null,
        }),
      });
    },

    async enqueueNotification(jobId, title, company, payload) {
      await client.request('/rest/v1/notification_outbox?on_conflict=job_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ job_id: jobId, title, company, payload, status: 'pending' }),
      });
    },

    async linkObservation(sourceId, jobId, status) {
      await client.request(`/rest/v1/job_sources?id=eq.${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ job_id: jobId, canonicalization_status: status }),
      });
    },

    async saveClassification(jobId, record) {
      await client.request('/rest/v1/job_classifications?on_conflict=job_id,description_hash,classification_version', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ ...record, job_id: jobId }),
      });
    },

    async finishRun(runId, diagnostic) {
      await client.request(`/rest/v1/source_scan_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify(diagnosticRow(diagnostic)),
      });
    },

    async finalizeCompleteReconciliation(connectorId, runId) {
      await client.request('/rest/v1/rpc/finalize_complete_reconciliation', {
        method: 'POST',
        body: JSON.stringify({ p_connector_id: connectorId, p_run_id: runId }),
      });
    },
  };
}

function inventoryFromRow(row: Record<string, unknown>): InventoryListing {
  return {
    connectorId: String(row.connector_id),
    sourceExternalId: String(row.source_external_id),
    company: String(row.company),
    title: String(row.title),
    location: typeof row.location === 'string' ? row.location : null,
    category: typeof row.category === 'string' ? row.category : null,
    department: typeof row.department === 'string' ? row.department : null,
    detailUrl: String(row.detail_url),
    listingMetadataHash: String(row.listing_metadata_hash),
    rawMetadata: isRecord(row.raw_metadata) ? row.raw_metadata : {},
  };
}

function diagnosticRow(item: SourceConnectorDiagnostic): Record<string, unknown> {
  return {
    status: item.status,
    hydration_status: item.hydrationStatus,
    reported_total: item.reportedTotal,
    pages_expected: item.pagesExpected,
    pages_fetched: item.pagesFetched,
    listings_discovered: item.listingsDiscovered,
    inventory_created: item.inventoryCreated,
    inventory_changed: item.inventoryChanged,
    candidates_selected: item.candidatesSelected,
    details_due: item.detailsDue,
    details_fetched: item.detailsFetched,
    details_backlogged: item.detailsBacklogged,
    apply_urls_resolved: item.applyUrlsResolved,
    candidate_observations_persisted: item.candidateObservationsPersisted,
    new_observations: item.newObservations,
    changed_observations: item.changedObservations,
    canonical_jobs_created: item.canonicalJobsCreated,
    excluded_json: item.excluded,
    error_summary: item.errorSummaries,
    error_message: item.errorSummaries[0] ?? null,
    finished_at: item.finishedAt,
  };
}

function boundJson(value: Record<string, unknown>): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 32_000) return value;
    return { truncated: true, preview: serialized.slice(0, 31_900) };
  } catch {
    return { invalid: true };
  }
}

function canonicalUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = '';
    return url.toString().toLowerCase();
  } catch {
    return input.trim().toLowerCase();
  }
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function legacyJobRow(job: NormalizedJob, seenAt: string) {
  return {
    id: job.id,
    employer_job_id: job.employerJobId,
    source_company: job.company,
    source_url: job.sourceUrl,
    apply_url: job.applyUrl,
    title: job.title,
    location: job.location,
    description: job.description.slice(0, 4000),
    experience_text: job.experienceText,
    job_category: job.jobCategory,
    posted_at: job.postedAt,
    last_seen_at: seenAt,
    active: true,
  };
}

function legacyDiagnosticRow(runId: number | null, item: ConnectorDiagnostic) {
  return {
    scan_run_id: runId,
    source_company: item.company,
    status: item.status,
    discovered_count: item.discoveredCount,
    fetched_count: item.fetchedCount,
    matching_count: item.matchingCount,
    excluded_json: item.excluded,
    error_message: item.errorMessage,
    started_at: item.startedAt,
    finished_at: item.finishedAt,
  };
}
