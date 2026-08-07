// Weekly live audit: advertised totals vs stored inventory + feed noise.
//
// This is an operations check, not a unit test. It compares what each source
// advertises (the career-page reported total) with what the monitor stored
// (listings discovered / reconciled), flags companies whose connector is
// failing or absent from the feed, and replays the strict serving-gate noise
// rules against the live feed so drift in title filtering is visible.
//
// Usage:
//   FIRST_LOOK_API_URL=https://.../functions/v1/first-look-api node audit-live-coverage.mjs
//
// Exit code 0 = healthy, 1 = audit findings (company-level drift or noise),
// 2 = the API itself failed.

async function main() {
  const baseUrl = process.env.FIRST_LOOK_API_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('FIRST_LOOK_API_URL is required');

  const findings = [];
  const warnings = [];

    const [coverage, jobs] = await Promise.all([readJson(baseUrl, '/coverage'), readJson(baseUrl, '/jobs')]);

  // ---- 1. Advertised vs stored inventory --------------------------------
for (const source of coverage.sources ?? []) {
  const company = source.company || source.connectorId || 'Unknown source';
  const progress = source.reconcile || source.watch;
  const advertised = Number(progress?.reportedTotal ?? source.reportedTotal ?? NaN);
  const stored = Number(progress?.listingsDiscovered ?? source.listingsDiscovered ?? NaN);
  const status = source.latestStatus || 'unknown';

  if (['failed', 'anomalous', 'partial'].includes(status)) {
    findings.push(`${company}: connector ${status} (${source.errorSummary || 'no error summary'})`);
    continue;
  }
  if (Number.isFinite(advertised) && Number.isFinite(stored) && advertised > 0) {
    if (stored === 0) {
      findings.push(`${company}: advertises ${advertised} listings but nothing was stored`);
    } else if (stored < advertised * 0.8) {
      warnings.push(`${company}: stored ${stored} of ${advertised} advertised listings (${Math.round((stored / advertised) * 100)}%)`);
    }
  }
  if (Number.isFinite(Number(source.candidateBacklog || 0)) && Number(source.candidateBacklog) > 0) {
    warnings.push(`${company}: ${source.candidateBacklog} detail pages still queued`);
  }
}

// ---- 2. Companies advertised as covered but absent from the feed ----------
const feedCompanies = new Set((jobs.jobs ?? []).map((job) => String(job.company || '').toLowerCase()));
const coveredCompanies = new Set((coverage.sources ?? [])
  .filter((source) => ['complete', 'partial'].includes(source.latestStatus))
  .map((source) => String(source.company || source.connectorId || '').toLowerCase()));
for (const company of coveredCompanies) {
  if (!feedCompanies.has(company)) {
    warnings.push(`${company}: source reports coverage but no matching roles in the live feed`);
  }
}

// ---- 3. Feed noise replay (strict 0-2 year finance gate) ------------------
// Mirrors index.ts getJobs + taxonomy.ts isNoiseTitle. Titles that slip into
// the live feed are real noise regressions, not just scoring concerns.
const NOISE = [
  /\b(?:tele ?caller|telesales|collections|loan recovery|recovery agent|growth management|dgm|voice ?over|voice of customer|voc|content (?:creator|strategy)|customer experience|campaign operations|admin ?& operations|administrative assistant|helpdesk|vendor onboarding|personal assistant|executive assistant|talent management|human capital|tech ops|strats|chat process|digital analyst|digitalization|digital operations|digital client services|product delivery|product operations|demand planner|replenishment planner|computational|data science researcher|media analytics|information management|data management|data governance|data strategy|quality analyst|test analyst|testing|sap|abap|employee central|enterprise apps|architect|itsm|itam|servicenow|hardware asset management|identity and access management|digital privacy|digigov|request for proposal|vendor management|performance & reward|reward analyst|security specialist|aiml|agentic|intelligence automation|automation|sapco|ofsaa|epm|video)\b|\boracle (?:epm|ofsaa|cloud|fusion)\b|\bai\s*\/\s*ml\b|\bapplied ai\b|\bqa\b|\bccm\b/i,
  /\b(?:senior specialist|senior accountant|senior consultant|senior quantitative|senior product|senior member|senior internal auditor|senior executive|senior business analyst|managing consultant|team leader|people leader|deputy manager|vice president|vp|avp|svp|assistant vice president|senior vice president|managing director|executive director|associate director|director|head of|chief [a-z]+ officer|partner|principal|senior manager|lead manager|group manager|assistant manager|senior analyst|senior associate|lead analyst|manager|team lead|mgr)\b|\b(?:dm\s*\/\s*am\s*\/\s*se)\b|\bsr\.?\s+(?:analyst|associate|specialist|accountant|consultant|manager|quality|product)\b|\blead\b/i,
  /^(?:about the team|responsibilities|qualifications|india|team member|german,? ?nct|csg laf|prospect application for future jobs|all positions in)$/i,
];

const noiseHits = [];
for (const job of jobs.jobs ?? []) {
  const normalized = String(job.title || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (NOISE.some((pattern) => pattern.test(normalized))) {
    noiseHits.push(`${job.company} | ${job.title}`);
  }
}
if (noiseHits.length > 0) {
  findings.push(`feed noise (${noiseHits.length}): ${noiseHits.slice(0, 8).join(' || ')}`);
}

// ---- Report ----------------------------------------------------------------
console.log(`Advertised-and-stored audit: ${coverage.sources?.length ?? 0} sources, ${jobs.jobs?.length ?? 0} matching roles`);
if (findings.length === 0) {
  console.log('No findings. Stored counts track advertised totals and the feed is free of noise regressions.');
} else {
  console.log(`Findings (${findings.length}):`);
  for (const finding of findings) console.log(`- ${finding}`);
}
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  return findings.length > 0 ? 1 : 0;
}

async function readJson(baseUrl, path) {
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

// Exit code contract: 0 = healthy, 1 = audit findings, 2 = the API itself
// failed (unconfigured env or unreachable endpoints).
try {
  const code = await main();
  process.exit(code);
} catch (error) {
  console.error(`Audit could not run: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
