const baseUrl = process.env.FIRST_LOOK_API_URL?.replace(/\/$/, '');
if (!baseUrl) throw new Error('FIRST_LOOK_API_URL is required');

const health = await readJson('/health');
if (health.ok !== true || health.service !== 'first-look-job-monitor') {
  throw new Error('Production health response is invalid');
}

const coverage = await readJson('/coverage');
if (!Array.isArray(coverage.sources)) throw new Error('Production coverage response is invalid');
if (coverage.sources.some((source) => source.latestStatus === 'unsupported')) {
  throw new Error('Production must not expose unsupported connector rows');
}
if (process.env.REQUIRE_FRESH_COVERAGE === '1') verifyFreshCoverage(coverage.sources);

const jobs = await readJson('/jobs');
if (!Array.isArray(jobs.jobs)) throw new Error('Production jobs response is invalid');

console.log(`Production verified: ${coverage.sources.length} sources, ${jobs.jobs.length} matching jobs`);

function verifyFreshCoverage(sources) {
  if (sources.length === 0) throw new Error('No verified production sources are reporting coverage');

  const failures = [];
  const maximumAgeMs = 6 * 60 * 60 * 1_000;
  for (const source of sources) {
    const company = source.company || source.connectorId || 'Unknown source';
    if (source.latestStatus !== 'complete') failures.push(`${company}: latest status is ${source.latestStatus || 'missing'}`);
    if (source.latestHydrationStatus === 'degraded') failures.push(`${company}: detail hydration is degraded`);

    const completedAt = Date.parse(source.lastCompleteReconcileAt || '');
    if (!Number.isFinite(completedAt) || Date.now() - completedAt > maximumAgeMs) {
      failures.push(`${company}: no complete reconciliation within six hours`);
    }

    const progress = source.reconcile || source.watch;
    if (progress && Number(progress.unresolvedApplyUrls || 0) > 0) {
      failures.push(`${company}: ${progress.unresolvedApplyUrls} hydrated listings lack an Apply URL`);
    }
  }

  if (failures.length > 0) throw new Error(`Coverage monitor failed\n- ${failures.join('\n- ')}`);
}

async function readJson(path) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  throw lastError;
}
