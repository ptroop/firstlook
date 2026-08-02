import type { ConnectorDiagnostic, JobConnector, NormalizedJob } from './types.ts';

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

