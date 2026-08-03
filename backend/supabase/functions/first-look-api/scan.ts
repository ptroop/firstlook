import type { ConnectorDiagnostic, JobConnector, NormalizedJob } from './types.ts';
import type { ConnectorRunRequest, SourceConnectorDiagnostic } from './types.ts';
import type { OfficialJobConnector } from './connectors/contract.ts';
import type { SourceAwareStore } from './persistence/store.ts';
import { selectCandidate, selectDeferredAudit } from './candidates.ts';
import { classifyDeterministically } from './classification/deterministic.ts';
import { decideCanonicalLink, makeCanonicalJobId, mergeCanonicalJob } from './canonicalize.ts';

export interface ScanSummary {
  ok: true;
  sourcesChecked: number;
  jobsFound: number;
  errorCount: number;
  unsupportedCount: number;
  diagnostics: ConnectorDiagnostic[];
}

export interface ScanStore {
  startRun(startedAt: string): Promise<number | null>;
  upsertJob(job: NormalizedJob, seenAt: string): Promise<void>;
  deactivateMissingForSource(company: string, activeIds: string[], seenAt: string): Promise<void>;
  recordSourceResult(runId: number | null, diagnostic: ConnectorDiagnostic): Promise<void>;
  finishRun(runId: number | null, summary: ScanSummary, finishedAt: string): Promise<void>;
}

export async function runScan(connectors: JobConnector[], store: ScanStore): Promise<ScanSummary> {
  const startedAt = new Date().toISOString();
  const runId = await store.startRun(startedAt);
  const diagnostics: ConnectorDiagnostic[] = [];
  let jobsFound = 0;

  for (const connector of connectors) {
    const result = await runConnectorSafely(connector);
    const seenAt = new Date().toISOString();

    for (const job of result.jobs) {
      await store.upsertJob(job, seenAt);
      jobsFound += 1;
    }

    if (result.diagnostic.status === 'success') {
      await store.deactivateMissingForSource(connector.company, result.jobs.map((job) => job.id), seenAt);
    }

    diagnostics.push(result.diagnostic);
    await store.recordSourceResult(runId, result.diagnostic);
  }

  const summary: ScanSummary = {
    ok: true,
    sourcesChecked: connectors.length,
    jobsFound,
    errorCount: diagnostics.filter((item) => item.status === 'partial' || item.status === 'failed').length,
    unsupportedCount: diagnostics.filter((item) => item.status === 'unsupported').length,
    diagnostics
  };

  await store.finishRun(runId, summary, new Date().toISOString());
  return summary;
}

async function runConnectorSafely(connector: JobConnector) {
  try {
    return await connector.run();
  } catch (_error) {
    const now = new Date().toISOString();
    return {
      jobs: [],
      diagnostic: {
        company: connector.company,
        status: 'failed' as const,
        discoveredCount: 0,
        fetchedCount: 0,
        matchingCount: 0,
        excluded: {},
        errorMessage: `${connector.company} connector failed`,
        startedAt: now,
        finishedAt: now
      }
    };
  }
}

export interface SourceAwareScanSummary {
  ok: true;
  sourcesChecked: number;
  jobsFound: number;
  errorCount: number;
  unsupportedCount: number;
  diagnostics: SourceConnectorDiagnostic[];
}

export async function runSourceAwareScan(
  connectors: OfficialJobConnector[],
  store: SourceAwareStore,
  request: ConnectorRunRequest & { deferredAuditLimit?: number },
): Promise<SourceAwareScanSummary> {
  const diagnostics: SourceConnectorDiagnostic[] = [];
  let jobsFound = 0;

  for (const connector of connectors) {
    const startedAt = request.now.toISOString();
    const runId = await store.startRun({
      connectorId: connector.connectorId,
      connectorVersion: connector.connectorVersion,
      company: connector.company,
      runType: request.runType,
      startedAt,
    });
    let diagnostic = emptySourceDiagnostic(connector, request.runType, startedAt);

    try {
      const enumeration = await connector.enumerate(request);
      const audited = new Set(selectDeferredAudit(enumeration.listings, {
        utcDate: startedAt.slice(0, 10),
        limit: request.deferredAuditLimit ?? 2,
      }).map((listing) => listing.sourceExternalId));
      const selected = enumeration.listings.map((listing) => {
        const decision = selectCandidate(listing);
        return {
          listing,
          decision: audited.has(listing.sourceExternalId) && decision.status === 'defer'
            ? { status: 'audit' as const, reasons: decision.reasons }
            : decision,
        };
      });
      await store.upsertInventory(runId, selected, startedAt);

      const due = await store.dueCandidates(connector.connectorId, 500);
      const batch = due.slice(0, request.detailBatchSize);
      let detailsFetched = 0;
      let applyUrlsResolved = 0;
      let canonicalJobsCreated = 0;
      const hydrationErrors: string[] = [];
      const canonicalCandidates = await store.findCanonicalCandidates(connector.company);

      for (const listing of batch) {
        try {
          const observation = await connector.hydrate(listing, request);
          const sourceId = await store.persistObservation(runId, observation, startedAt);
          detailsFetched += 1;
          if (observation.applyUrl) applyUrlsResolved += 1;

          const link = decideCanonicalLink(observation, canonicalCandidates);
          if (link.status === 'conflict') {
            await store.linkObservation(sourceId, null, 'conflict');
            continue;
          }

          const existing = link.jobId
            ? canonicalCandidates.find((candidate) => candidate.id === link.jobId)
            : undefined;
          const jobId = existing?.id ?? makeCanonicalJobId(observation);
          const merged = existing
            ? mergeCanonicalJob(existing, observation, startedAt)
            : {
              company: observation.company,
              employerJobId: observation.employerJobId,
              title: observation.title,
              location: observation.location,
              description: observation.description,
              jobCategory: observation.jobCategory,
              postedAt: observation.postedAt,
              officialDetailUrl: observation.isOfficial ? observation.detailUrl : null,
              officialApplyUrl: observation.isOfficial ? observation.applyUrl : null,
              descriptionHash: observation.contentHash,
            };
          const classification = classifyDeterministically({
            title: merged.title,
            location: merged.location,
            description: merged.description,
            jobCategory: merged.jobCategory,
            experienceText: observation.experienceText,
          });
          await store.upsertCanonicalJob(jobId, merged, classification, startedAt);
          await store.linkObservation(sourceId, jobId, 'linked');
          await store.saveClassification(jobId, {
            description_hash: observation.contentHash,
            classification_version: 'deterministic-v1',
            deterministic_result: classification,
            deterministic_evidence: classification.evidence,
            final_result: classification,
            confidence: classification.matchTier === 'exact' ? 1 : 0.6,
            validation_errors: [],
            classified_at: startedAt,
          });
          if (!existing) {
            canonicalJobsCreated += 1;
            canonicalCandidates.push({
              id: jobId,
              ...merged,
              officialVerifiedAt: observation.isOfficial ? startedAt : null,
            });
          }
        } catch (error) {
          hydrationErrors.push(boundedError(error, listing.sourceExternalId));
        }
      }

      const detailsBacklogged = Math.max(0, due.length - detailsFetched);
      diagnostic = {
        ...diagnostic,
        status: enumeration.diagnostic.status,
        hydrationStatus: hydrationErrors.length > 0 ? 'degraded' : detailsBacklogged > 0 ? 'backlog' : 'complete',
        reportedTotal: enumeration.diagnostic.reportedTotal,
        pagesExpected: enumeration.diagnostic.pagesExpected,
        pagesFetched: enumeration.diagnostic.pagesFetched,
        listingsDiscovered: enumeration.listings.length,
        candidatesSelected: selected.filter(({ decision }) => decision.status !== 'defer').length,
        detailsDue: due.length,
        detailsFetched,
        detailsBacklogged,
        applyUrlsResolved,
        candidateObservationsPersisted: detailsFetched,
        canonicalJobsCreated,
        errorSummaries: [...enumeration.diagnostic.errorSummaries, ...hydrationErrors].slice(0, 20),
        finishedAt: new Date().toISOString(),
      };
      jobsFound += canonicalJobsCreated;
    } catch (error) {
      diagnostic = {
        ...diagnostic,
        status: 'failed',
        hydrationStatus: 'degraded',
        errorSummaries: [boundedError(error, connector.connectorId)],
        finishedAt: new Date().toISOString(),
      };
    }

    diagnostics.push(diagnostic);
    await store.finishRun(runId, diagnostic);
    if (request.runType === 'reconcile' && diagnostic.status === 'complete') {
      await store.finalizeCompleteReconciliation(connector.connectorId, runId);
    }
  }

  return {
    ok: true,
    sourcesChecked: connectors.length,
    jobsFound,
    errorCount: diagnostics.filter((item) => ['partial', 'failed', 'anomalous'].includes(item.status)).length,
    unsupportedCount: diagnostics.filter((item) => item.status === 'unsupported').length,
    diagnostics,
  };
}

function emptySourceDiagnostic(
  connector: OfficialJobConnector,
  runType: ConnectorRunRequest['runType'],
  startedAt: string,
): SourceConnectorDiagnostic {
  return {
    company: connector.company,
    connectorId: connector.connectorId,
    connectorVersion: connector.connectorVersion,
    sourceType: 'official_career',
    runType,
    status: 'partial',
    hydrationStatus: 'backlog',
    reportedTotal: null,
    pagesExpected: null,
    pagesFetched: 0,
    listingsDiscovered: 0,
    inventoryCreated: 0,
    inventoryChanged: 0,
    candidatesSelected: 0,
    detailsDue: 0,
    detailsFetched: 0,
    detailsBacklogged: 0,
    applyUrlsResolved: 0,
    candidateObservationsPersisted: 0,
    newObservations: 0,
    changedObservations: 0,
    canonicalJobsCreated: 0,
    excluded: {},
    errorSummaries: [],
    startedAt,
    finishedAt: startedAt,
  };
}

function boundedError(error: unknown, identity: string): string {
  const message = error instanceof Error ? error.message : 'Unknown failure';
  return `${identity}: ${message}`.slice(0, 500);
}
