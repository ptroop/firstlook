# Moody's Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 30-minute scanner discover official Moody's India vacancies, retain finance roles accepting 0-2 years, save the direct SuccessFactors Apply URL, and expose honest source diagnostics.

**Architecture:** Pure TypeScript modules parse and classify jobs independently from network and database I/O. A Moody's connector crawls the official India result pages and detail pages; scan orchestration persists normalized jobs and source-scoped status through an injected store. The Edge Function remains the HTTP adapter.

**Tech Stack:** Supabase Edge Functions, Deno-compatible TypeScript, Node 22 built-in test runner, Postgres migrations, public Moody's careers HTML.

## Global Constraints

- Keep the existing 30-minute cron schedule unchanged.
- Use official employer pages and direct employer Apply URLs only.
- Include only India finance roles whose published requirements accept 0-2 years; a `Senior` title alone does not exclude a role.
- Do not add browser automation, Gemini, unofficial portals, push delivery, or CV functionality in this slice.
- A failed or partial connector must not deactivate previously active jobs.
- Never log or return secrets, authorization headers, or full remote error bodies.

---

### Task 1: Normalized Types and Eligibility Classifier

**Files:**
- Create: `backend/supabase/functions/first-look-api/types.ts`
- Create: `backend/supabase/functions/first-look-api/filters.ts`
- Create: `backend/supabase/functions/first-look-api/filters.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `NormalizedJob`, `ConnectorDiagnostic`, `ConnectorResult`, `JobConnector`, `JobFetch`.
- Produces: `classifyJob(job: NormalizedJob): 'match' | 'not_india' | 'not_finance' | 'experience_over_limit' | 'experience_unknown'`.

- [ ] **Step 1: Add the Node test script and failing classifier tests**

```json
"scripts": {
  "test": "node --test"
}
```

```ts
test('accepts a senior-titled finance role whose requirement is 0-2 years', () => {
  assert.equal(classifyJob(moodysJob({ title: 'Senior Financial Data Analyst', experienceText: '0-2 years experience' })), 'match');
});

test('rejects a finance role requiring at least 3 years', () => {
  assert.equal(classifyJob(moodysJob({ experienceText: 'minimum 3+ years experience' })), 'experience_over_limit');
});

test('separates jobs whose experience cannot be determined', () => {
  assert.equal(classifyJob(moodysJob({ experienceText: '' })), 'experience_unknown');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test`

Expected: FAIL because `filters.ts` and exported interfaces do not exist.

- [ ] **Step 3: Implement minimal types and explicit classifier rules**

Use India location matching, finance title/category/description matching, accepted `0-2`, `0 to 2`, `up to 2`, `0-1`, fresher, and graduate expressions, and reject explicit minimums above two years.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm.cmd test`

Expected: all classifier tests pass with exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/package.json backend/supabase/functions/first-look-api/types.ts backend/supabase/functions/first-look-api/filters.ts backend/supabase/functions/first-look-api/filters.test.ts
git commit -m "feat: classify eligible finance jobs"
```

### Task 2: Moody's Search and Detail Parser

**Files:**
- Create: `backend/supabase/functions/first-look-api/connectors/moodys.ts`
- Create: `backend/supabase/functions/first-look-api/connectors/moodys.test.ts`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/moodys-india-page.html`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/moodys-senior-financial-data-analyst.html`

**Interfaces:**
- Consumes: `NormalizedJob`, `ConnectorResult`, and `JobFetch` from `types.ts`; `classifyJob` from `filters.ts`.
- Produces: `discoverMoodysPages(html: string, baseUrl: string): string[]`.
- Produces: `discoverMoodysJobUrls(html: string, baseUrl: string): string[]`.
- Produces: `parseMoodysJob(html: string, detailUrl: string): NormalizedJob`.
- Produces: `runMoodysConnector(fetcher: JobFetch): Promise<ConnectorResult>`.

- [ ] **Step 1: Write minimal official-structure fixtures and failing parser tests**

The search fixture contains `#search-results-jobs`, two India job links, pagination links for pages 1 and 2, and one unrelated featured-job link. The detail fixture contains job ID `98452084112`, title `Senior Financial Data Analyst`, location `Bengaluru, India`, posted date `07/29/2026`, reference `13927`, category `Credit Analysis & Research`, `0-2 years` text, and the direct SuccessFactors URL containing `jobId=13927`.

Tests assert literal expected URLs and fields, and assert that the featured global job is excluded.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test supabase/functions/first-look-api/connectors/moodys.test.ts`

Expected: FAIL because `moodys.ts` does not exist.

- [ ] **Step 3: Implement bounded Moody's crawling and parsing**

Fetch `https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/1`, discover all pagination links from the search-results section, discover only links inside `#search-results-jobs`, fetch details with concurrency 4 and a 12-second timeout, normalize HTML entities, classify each job, and return exclusion counts plus a `success`, `partial`, or `failed` diagnostic.

- [ ] **Step 4: Run focused and complete tests and verify GREEN**

Run: `npm.cmd test`

Expected: all parser and classifier tests pass with exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/supabase/functions/first-look-api/connectors backend/supabase/functions/first-look-api/test-fixtures
git commit -m "feat: add Moodys India job connector"
```

### Task 3: Safe Scan Orchestration and Source Diagnostics

**Files:**
- Create: `backend/supabase/functions/first-look-api/scan.ts`
- Create: `backend/supabase/functions/first-look-api/scan.test.ts`
- Create: `backend/supabase/functions/first-look-api/connectors/registry.ts`
- Create: `backend/supabase/migrations/002_source_connectors.sql`
- Modify: `backend/supabase/functions/first-look-api/index.ts`

**Interfaces:**
- Consumes: `JobConnector`, `ConnectorResult`, `NormalizedJob`.
- Produces: `ScanStore` with `startRun`, `upsertJob`, `deactivateMissingForSource`, `recordSourceResult`, and `finishRun`.
- Produces: `runScan(connectors: JobConnector[], store: ScanStore): Promise<ScanSummary>`.
- Produces: registry entries for Moody's and explicit `unsupported` diagnostics for the remaining 20 companies.

- [ ] **Step 1: Write failing orchestration tests**

Tests prove that a successful connector upserts matches and deactivates only missing jobs for that company, a partial/failed connector never calls deactivation, and unsupported sources appear in diagnostics without incrementing failed-fetch counts.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test supabase/functions/first-look-api/scan.test.ts`

Expected: FAIL because `scan.ts` and the registry do not exist.

- [ ] **Step 3: Add migration and minimal orchestration**

Migration `002_source_connectors.sql` adds `employer_job_id`, `posted_at`, `experience_text`, and `job_category` to `jobs`; creates a partial unique index on `(source_company, employer_job_id)`; creates `source_scan_runs` with status, counts, exclusions JSON, error message, and timestamps; enables RLS without anonymous policies.

Replace the monolithic global scanner with `runScan`. Database deactivation uses both `source_company=eq.<company>` and `id=not.in.(...)`, and executes only after a complete successful connector result.

- [ ] **Step 4: Run complete tests and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass with exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/supabase/functions/first-look-api backend/supabase/migrations/002_source_connectors.sql
git commit -m "feat: persist connector diagnostics safely"
```

### Task 4: Repair the Jobs API Contract

**Files:**
- Create: `backend/supabase/functions/first-look-api/presenters.ts`
- Create: `backend/supabase/functions/first-look-api/presenters.test.ts`
- Modify: `backend/supabase/functions/first-look-api/index.ts`
- Modify: `app.js`

**Interfaces:**
- Produces: `presentJob(row: JobRow): PublicJob` mapping `source_company` to `company`, `apply_url` to `applyUrl`, and preserving `title`, `location`, `description`, `firstSeenAt`, and `postedAt`.

- [ ] **Step 1: Write a failing API mapping test**

```ts
assert.deepEqual(presentJob({ source_company: "Moody's", apply_url: 'https://career8.successfactors.com/apply', title: 'Senior Financial Data Analyst', location: 'Bengaluru, India', description: '', first_seen_at: '2026-08-03T00:00:00Z', posted_at: '2026-07-29T00:00:00Z' }), {
  company: "Moody's",
  applyUrl: 'https://career8.successfactors.com/apply',
  title: 'Senior Financial Data Analyst',
  location: 'Bengaluru, India',
  description: '',
  firstSeenAt: '2026-08-03T00:00:00Z',
  postedAt: '2026-07-29T00:00:00Z'
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test supabase/functions/first-look-api/presenters.test.ts`

Expected: FAIL because `presenters.ts` does not exist.

- [ ] **Step 3: Implement mapping and visible fetch failure state**

Map database rows before returning `GET /jobs`. Keep `app.js` aligned with `/jobs`, and display a concise feed error when the API request fails instead of silently presenting a legitimate-empty state.

- [ ] **Step 4: Run complete tests and static syntax checks**

Run: `npm.cmd test`

Run: `node --check ..\app.js`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add backend/supabase/functions/first-look-api/presenters.ts backend/supabase/functions/first-look-api/presenters.test.ts backend/supabase/functions/first-look-api/index.ts app.js
git commit -m "fix: align jobs API with the PWA"
```

### Task 5: Apply, Deploy, and Live-Verify

**Files:**
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: linked Supabase project `xbckwzodpwfpvvkujbgp` and existing platform secrets.
- Produces: deployed migration and `first-look-api` function with live Moody's results.

- [ ] **Step 1: Run local verification**

Run: `npm.cmd test`

Run: `node --check ..\app.js`

Run: `npx supabase functions serve first-look-api --no-verify-jwt` only if the local Docker runtime is available; otherwise record that local function serving was unavailable and continue with deployment verification.

- [ ] **Step 2: Apply the database migration**

Run: `npx supabase db push --linked`

Expected: migration `002_source_connectors.sql` applies successfully.

- [ ] **Step 3: Deploy the Edge Function**

Run: `npx supabase functions deploy first-look-api --project-ref xbckwzodpwfpvvkujbgp --no-verify-jwt`

Expected: Supabase reports `first-look-api` deployed successfully.

- [ ] **Step 4: Trigger and inspect a live scan without exposing the token**

Invoke the existing Vault-backed cron target or use a process-local token read that is never printed. Verify the response reports Moody's as `success` or reports an explicit source error. Query `/jobs` and confirm the current matching role has `company`, `applyUrl`, `title`, and `location`.

- [ ] **Step 5: Verify database state**

Run linked read-only queries confirming one recent overall scan row, one Moody's source diagnostic row, no accidental deactivation for unsupported companies, and the matching direct-apply record when the official listing is available.

- [ ] **Step 6: Update documentation and commit**

Document the supported/unsupported connector boundary, diagnostics, safe deactivation, test command, migration command, and deployment command.

```powershell
git add backend/README.md
git commit -m "docs: explain connector operations"
```
