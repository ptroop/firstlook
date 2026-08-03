# Career Page Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make First Look inventory every official India careers listing cheaply, hydrate every plausible finance or early-career candidate, preserve source provenance, and expose reliable Moody's, D. E. Shaw, and Citi results without fetching hundreds of unrelated job descriptions.

**Architecture:** Keep GitHub Pages as a static PWA and Supabase as the dynamic data plane. Each connector first produces lightweight official-board inventory, a deterministic high-recall selector chooses detail pages, bounded hydration persists source observations before classification, and canonical jobs combine those observations without hiding uncertain results. Thirty-minute watch scans and board-size-based reconciliation run in separate bounded groups; OpenRouter is a server-only fallback for ambiguous hydrated descriptions.

**Tech Stack:** TypeScript Supabase Edge Functions on Deno-compatible APIs, PostgreSQL migrations and RPCs, Supabase scheduled HTTP invocations, Node `tsx --test`, vanilla JavaScript PWA, mocked OpenRouter Chat Completions API.

## Global Constraints

- Do not fetch every Citi India description. Enumerate lightweight summaries, then hydrate only selected candidates, audit samples, failed candidates, changed candidates, and stale active candidates.
- Persist a hydrated source observation before final finance or experience classification. Classification failure must produce a visible `possible` job.
- A connector can close observations only after two consecutive complete reconciliation misses. Watch, partial, failed, unsupported, and anomalous runs cannot increment misses.
- The employer's official detail/apply URL is always preferred over a portal URL.
- The first baseline may populate the feed but must not send historical-job notifications.
- Keep `OPENROUTER_API_KEY` and model configuration in Supabase Edge Function secrets. Never place secret values in source, `.env` files committed to Git, logs, browser code, database rows, or task chat.
- Do not add portal ingestion, VAPID delivery, or CV upload/matching in this slice. Preserve the existing UI subscription affordance, but implement those capabilities in their separately approved slices.
- Every connector must prove index completeness independently of detail-hydration completeness.

## Planned File Map

```text
backend/
  package.json                                      # expanded focused test commands
  README.md                                         # architecture, schedules, secrets, operations
  supabase/migrations/
    005_source_aware_inventory.sql                  # inventory, sources, classifications, state
    006_source_lifecycle_rpcs.sql                   # complete-run two-miss reconciliation
    007_source_scan_schedules.sql                   # staggered watch/reconcile cron jobs
  supabase/functions/first-look-api/
    index.ts                                        # routes and dependency wiring
    types.ts                                        # connector/persistence/API contracts
    config.ts                                       # validated server-only configuration
    candidates.ts                                   # high-recall inventory selector and audit sampling
    candidates.test.ts
    classification/
      taxonomy.ts                                   # weighted finance and location taxonomy
      experience.ts                                 # 0-2-year parser
      deterministic.ts                              # match-tier composition
      deterministic.test.ts
      openrouter.ts                                 # strict ambiguous-case adapter
      openrouter.test.ts
    persistence/
      migrations.test.ts                            # migration structure contract
      store.ts                                      # source-aware Supabase operations
      store.test.ts
    canonicalize.ts                                 # safe source-to-job linking
    canonicalize.test.ts
    scan.ts                                         # watch/reconcile/hydrate orchestration
    scan.test.ts
    connectors/
      contract.ts                                   # inventory/hydration connector interface
      moodys.ts / moodys.test.ts                    # migrated regression connector
      deshaw.ts / deshaw.test.ts                    # official D. E. Shaw connector
      citi.ts / citi.test.ts                        # official Citi India connector
      registry.ts                                   # scan-group registry
    test-fixtures/
      deshaw-careers.html
      deshaw-financial-operations.html
      citi-india-page-1.html
      citi-india-page-2.html
      citi-model-analyst-c09.html
    presenters.ts / presenters.test.ts              # source-aware public payload
app.js                                              # source badges, match state, health rendering
index.html                                           # sources and coverage UI containers
styles.css                                           # minimal source/health visual treatment
```

---

### Task 1: Add the source-aware schema and lifecycle RPCs

**Files:**
- Create: `backend/supabase/migrations/005_source_aware_inventory.sql`
- Create: `backend/supabase/migrations/006_source_lifecycle_rpcs.sql`

- [ ] **Step 1: Write a migration contract check before the SQL**

Create a temporary focused test at `backend/supabase/functions/first-look-api/persistence/migrations.test.ts` that reads the two migration files and asserts the named tables, constrained enums/checks, partial source identity indexes, and RPC names exist. Keep this as a lightweight repository contract test; database behavior is verified later against local Supabase.

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("source-aware migrations define inventory, provenance, history, and state", async () => {
  const schema = await readFile(new URL("../../../migrations/005_source_aware_inventory.sql", import.meta.url), "utf8");
  for (const table of ["source_inventory", "job_sources", "job_classifications", "connector_state"]) {
    assert.match(schema, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
  }
  assert.match(schema, /unique[\s\S]+source_type[\s\S]+source_name[\s\S]+source_external_id/i);
});
```

- [ ] **Step 2: Run the contract test and confirm it fails**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/persistence/migrations.test.ts` from `backend`.

Expected: FAIL because migrations `005` and `006` do not exist.

- [ ] **Step 3: Implement additive schema migration 005**

Create the four new tables from the approved design, extend `jobs` and `source_scan_runs`, migrate existing Moody's rows, and add indexes. Use text columns with check constraints for statuses so Edge Function types remain portable. Preserve `jobs.id`, existing timestamps, and existing URLs during migration.

Required checks include:

```sql
candidate_status text not null check (candidate_status in ('hydrate','defer','hydrated','audit')),
source_type text not null check (source_type in ('official_career','linkedin','naukri','iimjobs','indeed','other')),
match_tier text not null default 'possible' check (match_tier in ('exact','possible','not_targeted')),
classification_method text not null default 'pending' check (classification_method in ('deterministic','openrouter','mixed','pending'))
```

Add a partial unique index for source external IDs and a URL fingerprint fallback index. Revoke public write access and retain public read access only for the sanitized `jobs` view/query path already used by the Edge Function.

- [ ] **Step 4: Implement complete-reconciliation lifecycle RPCs in migration 006**

Add RPCs that:

1. finalize only `complete` reconciliation runs;
2. reset misses for observed source identities;
3. increment misses for previously active official observations absent from the complete run;
4. deactivate observations on the second consecutive miss;
5. keep a canonical job active while any credible source remains active; and
6. never mutate lifecycle state for watch/partial/failed/anomalous runs.

Use scan-run IDs and connector IDs rather than accepting a caller-provided list of canonical job IDs.

- [ ] **Step 5: Run the contract and existing tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/persistence/migrations.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all existing tests PASS.

- [ ] **Step 6: Commit the additive schema**

```powershell
git add backend/supabase/migrations/005_source_aware_inventory.sql backend/supabase/migrations/006_source_lifecycle_rpcs.sql backend/supabase/functions/first-look-api/persistence/migrations.test.ts
git commit -m "feat: add source-aware job inventory schema"
```

---

### Task 2: Define connector, inventory, source, and classification contracts

**Files:**
- Modify: `backend/supabase/functions/first-look-api/types.ts`
- Create: `backend/supabase/functions/first-look-api/connectors/contract.ts`
- Create: `backend/supabase/functions/first-look-api/candidates.ts`
- Create: `backend/supabase/functions/first-look-api/candidates.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write failing candidate-selection tests**

Cover finance taxonomy metadata, every generic early-career title, absent category, education metadata, portal corroboration, strong non-finance deferral, D. E. Shaw generic `Analyst`, deterministic daily audit selection, and bounded reason arrays.

```ts
test("generic analyst with missing category is hydrated", () => {
  assert.deepEqual(selectCandidate({
    connectorId: "citi-official-india",
    externalId: "123",
    company: "Citi",
    title: "Analyst",
    location: "Mumbai, India",
    category: null,
    department: null,
    detailUrl: "https://jobs.citi.com/job/x/287/123",
    rawMetadata: {},
  }).status, "hydrate");
});

test("strong software category without another signal is deferred", () => {
  assert.equal(selectCandidate(softwareEngineerInventory).status, "defer");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/candidates.test.ts`

Expected: FAIL because the contract and selector do not exist.

- [ ] **Step 3: Add explicit domain types**

Define `InventoryListing`, `CandidateDecision`, `HydratedSourceObservation`, `CanonicalJobInput`, `ScanRunType`, `EnumerationStatus`, `HydrationStatus`, `ConnectorRunRequest`, and `ConnectorRunResult`. The connector result must expose inventory separately from hydration:

```ts
export interface ConnectorRunResult {
  connectorId: string;
  runType: "watch" | "reconcile" | "hydrate";
  inventory: InventoryListing[];
  observations: HydratedSourceObservation[];
  diagnostic: ConnectorDiagnostic;
}
```

`ConnectorDiagnostic` must include reported total, pages expected/fetched, listing count, candidate count, details due/fetched/backlogged, resolved apply URLs, and separate enumeration/hydration statuses.

- [ ] **Step 4: Implement the high-recall selector**

Return bounded machine-readable reasons such as `finance_metadata`, `early_career_title`, `generic_title`, `missing_category`, `education_signal`, `portal_corroborated`, and `connector_rule`. Defer only if a recognized strong non-finance category is present and every positive/unknown signal is absent.

Implement audit sampling as a stable hash of `connectorId + externalId + UTC date`; cap selection per connector/day rather than using randomness.

- [ ] **Step 5: Add focused scripts and run tests**

Add `test:candidates` and expand the main test command to include all `*.test.ts` files via explicit paths or a cross-platform Node discovery script; do not rely on PowerShell wildcard expansion.

Run: `npm.cmd run test:candidates`

Expected: all candidate tests PASS.

- [ ] **Step 6: Commit the contracts and selector**

```powershell
git add backend/package.json backend/package-lock.json backend/supabase/functions/first-look-api/types.ts backend/supabase/functions/first-look-api/connectors/contract.ts backend/supabase/functions/first-look-api/candidates.ts backend/supabase/functions/first-look-api/candidates.test.ts
git commit -m "feat: define high-recall inventory selection"
```

---

### Task 3: Replace flat filtering with deterministic taxonomy and experience parsing

**Files:**
- Create: `backend/supabase/functions/first-look-api/classification/taxonomy.ts`
- Create: `backend/supabase/functions/first-look-api/classification/experience.ts`
- Create: `backend/supabase/functions/first-look-api/classification/deterministic.ts`
- Create: `backend/supabase/functions/first-look-api/classification/deterministic.test.ts`
- Modify: `backend/supabase/functions/first-look-api/filters.ts`
- Modify: `backend/supabase/functions/first-look-api/filters.test.ts`

- [ ] **Step 1: Add golden failing tests**

Use fixture-shaped inputs for Moody's Senior Financial Data Analyst, D. E. Shaw Financial Operations, compliance/trade monitoring, private-credit operations, pricing, and Citi Model/Analysis/Validation Analyst I C09. Add phrase-table cases for `0-2`, `1 - 2`, `one to two`, Unicode dashes, `24 months`, `up to 2 years`, `2+`, `1+`, `3 years`, preferred-only experience, conflicting requirements, and absent experience.

Expected statuses:

```ts
[
  ["1-2 years", "zero_to_two"],
  ["up to 24 months", "zero_to_two"],
  ["2+ years", "ambiguous"],
  ["1+ years", "ambiguous"],
  ["minimum 3 years", "over_two"],
  ["2 years preferred", "zero_to_two"],
  ["", "ambiguous"],
]
```

- [ ] **Step 2: Confirm current filters fail the new cases**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/classification/deterministic.test.ts supabase/functions/first-look-api/filters.test.ts`

Expected: FAIL for missing parser and for currently missed wording.

- [ ] **Step 3: Implement normalized evidence extraction**

Normalize Unicode dashes and number words, retain exact matched evidence snippets, separate required from preferred language, and return nullable numeric minimum/maximum values. Use weighted multi-word finance concepts from the approved taxonomy; do not make `data`, `technology`, or `operations` an automatic exclusion when finance evidence is present.

- [ ] **Step 4: Compose match tiers conservatively**

Produce `exact` only for India + exact finance + confirmed zero-to-two. Produce `possible` for uncertain location, likely finance, ambiguous experience, or pending classification. Produce `not_targeted` only from explicit non-India, unrelated finance, or minimum over two.

Keep `filters.ts` as a compatibility facade during the Moody's migration; its exported classifier should call the new deterministic module.

- [ ] **Step 5: Run classification and regression tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/classification/deterministic.test.ts supabase/functions/first-look-api/filters.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit deterministic classification**

```powershell
git add backend/supabase/functions/first-look-api/classification backend/supabase/functions/first-look-api/filters.ts backend/supabase/functions/first-look-api/filters.test.ts
git commit -m "feat: classify finance and zero-to-two experience"
```

---

### Task 4: Extract a source-aware persistence store and safe canonicalization

**Files:**
- Create: `backend/supabase/functions/first-look-api/persistence/store.ts`
- Create: `backend/supabase/functions/first-look-api/persistence/store.test.ts`
- Create: `backend/supabase/functions/first-look-api/canonicalize.ts`
- Create: `backend/supabase/functions/first-look-api/canonicalize.test.ts`
- Modify: `backend/supabase/functions/first-look-api/index.ts`

- [ ] **Step 1: Write failing store and canonicalization tests**

Use an injected Supabase-like client. Prove:

- every enumerated summary is upserted into `source_inventory`;
- only hydrated candidates create `job_sources`;
- the source observation write occurs before the classification write;
- verified employer ID merges observations;
- normalized official URLs merge observations;
- conflicting employer IDs or locations stay separate with `conflict` status;
- portal data cannot overwrite newer official data; and
- one failed row does not discard already persisted rows.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/persistence/store.test.ts supabase/functions/first-look-api/canonicalize.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement injected persistence methods**

Expose narrowly scoped methods:

```ts
export interface SourceAwareStore {
  startRun(input: StartRunInput): Promise<string>;
  upsertInventory(runId: string, rows: InventoryListing[]): Promise<InventoryDelta[]>;
  dueCandidates(connectorId: string, limit: number): Promise<InventoryListing[]>;
  persistObservation(runId: string, row: HydratedSourceObservation): Promise<string>;
  linkCanonical(sourceId: string, input: CanonicalJobInput): Promise<string>;
  saveClassification(jobId: string, input: ClassificationRecord): Promise<void>;
  finishRun(runId: string, diagnostic: ConnectorDiagnostic): Promise<void>;
}
```

Batch inventory upserts in bounded chunks. Store only bounded `raw_metadata`. Make every write idempotent by source identity.

- [ ] **Step 4: Implement conservative canonicalization**

Use employer ID first, official canonical URL second, and only then a strict normalized title/location/date fingerprint. Return `pending` or `conflict` instead of guessing. Official fields win, but only when their verification time is at least as recent as the existing official observation.

- [ ] **Step 5: Wire the extracted store without changing public behavior**

Move inline Supabase mutations out of `index.ts`. Keep route behavior unchanged until Tasks 9 and 10.

- [ ] **Step 6: Run focused and full tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/persistence/store.test.ts supabase/functions/first-look-api/canonicalize.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 7: Commit persistence and canonicalization**

```powershell
git add backend/supabase/functions/first-look-api/persistence backend/supabase/functions/first-look-api/canonicalize.ts backend/supabase/functions/first-look-api/canonicalize.test.ts backend/supabase/functions/first-look-api/index.ts
git commit -m "feat: persist source observations safely"
```

---

### Task 5: Rework scan orchestration into inventory, hydration, and classification stages

**Files:**
- Modify: `backend/supabase/functions/first-look-api/scan.ts`
- Modify: `backend/supabase/functions/first-look-api/scan.test.ts`
- Modify: `backend/supabase/functions/first-look-api/connectors/registry.ts`
- Create: `backend/supabase/functions/first-look-api/config.ts`

- [ ] **Step 1: Add failing orchestration tests**

Test watch/reconcile/hydrate separately. Assert a reconcile persists all inventory summaries, hydrates selected details up to the configured batch size, persists observations before classification, reports backlog, and calls lifecycle finalization only for complete reconciliation. Assert partial, failed, and anomalous runs preserve old jobs. Assert baseline observations do not enter the notification outbox.

- [ ] **Step 2: Confirm failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/scan.test.ts`

Expected: FAIL because the old scanner directly upserts filtered jobs and deactivates after one success.

- [ ] **Step 3: Add validated operational config**

Read integers with safe bounds for detail batch size, request timeout, concurrency, deferred-audit cap, and response-body limit. Invalid or absent optional OpenRouter configuration must disable model calls without disabling scanning.

- [ ] **Step 4: Implement the staged pipeline**

Order each connector run as:

1. start run;
2. enumerate and validate pagination;
3. upsert all summary inventory;
4. select new/changed/due/audit candidates;
5. hydrate within the connector batch budget;
6. persist each observation;
7. canonicalize;
8. deterministic classification;
9. optional ambiguous classification;
10. save classification and canonical projection;
11. finish diagnostics;
12. finalize lifecycle only for complete reconciliation.

Catch errors per connector and per listing. Never convert an exception to a successful zero-result run.

- [ ] **Step 5: Add scan-group selection**

The registry must select connectors by `scan_group` and `run_type`. Start with `moodys-watch`, `moodys-reconcile`, `deshaw-watch`, `deshaw-reconcile`, `citi-watch`, `citi-reconcile`, and `candidate-hydrate`; unsupported companies remain explicitly unsupported.

- [ ] **Step 6: Run focused and full tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/scan.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 7: Commit staged orchestration**

```powershell
git add backend/supabase/functions/first-look-api/scan.ts backend/supabase/functions/first-look-api/scan.test.ts backend/supabase/functions/first-look-api/connectors/registry.ts backend/supabase/functions/first-look-api/config.ts
git commit -m "feat: stage inventory and candidate hydration"
```

---

### Task 6: Migrate Moody's to the new connector contract

**Files:**
- Modify: `backend/supabase/functions/first-look-api/connectors/moodys.ts`
- Modify: `backend/supabase/functions/first-look-api/connectors/moodys.test.ts`
- Reuse: `backend/supabase/functions/first-look-api/test-fixtures/moodys-india-page.html`
- Reuse: `backend/supabase/functions/first-look-api/test-fixtures/moodys-senior-financial-data-analyst.html`

- [ ] **Step 1: Rewrite tests for summary-first behavior**

Assert all official India search results become inventory, only selected candidates fetch details, pagination totals agree, direct Apply Now URLs are resolved, and the Senior Financial Data Analyst remains `exact` or `possible` rather than being filtered out.

- [ ] **Step 2: Confirm the old connector fails the contract**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/connectors/moodys.test.ts`

Expected: FAIL because the old connector fetches every detail and returns only filtered jobs.

- [ ] **Step 3: Split enumeration from hydration**

Retain the verified official Moody's search/detail parsing, but expose `enumerate(request)` and `hydrate(listing)` methods. Reconciliation follows every official India page; watch uses official date/category/keyword filters where supported and unions IDs before inventory upsert.

- [ ] **Step 4: Verify completeness and apply URLs**

Mark enumeration complete only when every expected page succeeds and discovered unique IDs agree with the reported total. Mark hydration degraded for a failed due detail. Resolve the actual employer application destination, not the careers homepage.

- [ ] **Step 5: Run Moody's and full regressions**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/connectors/moodys.test.ts supabase/functions/first-look-api/scan.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the Moody's migration**

```powershell
git add backend/supabase/functions/first-look-api/connectors/moodys.ts backend/supabase/functions/first-look-api/connectors/moodys.test.ts
git commit -m "refactor: inventory moodys listings before hydration"
```

---

### Task 7: Add the official D. E. Shaw India connector

**Files:**
- Create: `backend/supabase/functions/first-look-api/connectors/deshaw.ts`
- Create: `backend/supabase/functions/first-look-api/connectors/deshaw.test.ts`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/deshaw-careers.html`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/deshaw-financial-operations.html`
- Modify: `backend/supabase/functions/first-look-api/connectors/registry.ts`

- [ ] **Step 1: Save bounded official fixtures**

Capture only the minimum public HTML/JSON required to represent the careers catalog, pagination/termination behavior, one Financial Operations detail, and an official `/recruit/jobs/Adv/Link/...` apply redirect. Remove tracking markup and personal data; include source URL/date comments.

- [ ] **Step 2: Write failing connector tests**

Cover Fresh Graduate Roles, DESIS Finance, Financial Operations, Financial Research, generic `Analyst`, duplicate category appearances, direct apply redirect resolution, malformed cards, and explicit catalog completion.

Include regression IDs/slugs for:

- `analyst-financial-operations-7074`;
- `analyst-compliance-trade-monitoring-6778`;
- `analyst-senior-analyst-compliance-car-financial-operations-6864`; and
- `analyst-senior-analyst-private-credit-operations-reporting-financial-operations-6968`.

- [ ] **Step 3: Confirm failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/connectors/deshaw.test.ts`

Expected: FAIL because the connector does not exist.

- [ ] **Step 4: Implement official catalog enumeration**

Read the public careers catalog/anchors directly, deduplicate by stable slug or employer ID, keep all India catalog summaries in inventory, and use explicit termination rather than search-engine results. The candidate rule must hydrate generic analyst titles and the known finance categories even when the list metadata is sparse.

- [ ] **Step 5: Implement detail and apply extraction**

Extract title, city/location, full description, employer reference, posting metadata when available, and the final official apply URL. Preserve the careers detail URL separately from the apply URL.

- [ ] **Step 6: Run connector and full tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/connectors/deshaw.test.ts supabase/functions/first-look-api/classification/deterministic.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 7: Commit D. E. Shaw support**

```powershell
git add backend/supabase/functions/first-look-api/connectors/deshaw.ts backend/supabase/functions/first-look-api/connectors/deshaw.test.ts backend/supabase/functions/first-look-api/connectors/registry.ts backend/supabase/functions/first-look-api/test-fixtures/deshaw-careers.html backend/supabase/functions/first-look-api/test-fixtures/deshaw-financial-operations.html
git commit -m "feat: add official deshaw india connector"
```

---

### Task 8: Add the official Citi India lightweight connector

**Files:**
- Create: `backend/supabase/functions/first-look-api/connectors/citi.ts`
- Create: `backend/supabase/functions/first-look-api/connectors/citi.test.ts`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/citi-india-page-1.html`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/citi-india-page-2.html`
- Create: `backend/supabase/functions/first-look-api/test-fixtures/citi-model-analyst-c09.html`
- Modify: `backend/supabase/functions/first-look-api/connectors/registry.ts`

- [ ] **Step 1: Save bounded official fixtures**

Represent the India listing route `/location/india-jobs/287/1269750/2`, a subsequent numbered page, reported total/page count, categories, stable detail IDs, and the Model/Analysis/Validation Analyst I C09 detail with `0-2 years` wording.

- [ ] **Step 2: Write failing pagination and budget tests**

Prove that:

- reconciliation follows every numbered result page and verifies unique count against the reported total;
- 800 summaries cause 800 compact inventory upserts, not 800 detail fetches;
- generic analysts and finance categories are selected;
- strongly categorized unrelated engineering roles are deferred;
- detail fetches stop at the configured batch limit and report the exact backlog;
- a failed middle page makes enumeration partial and prevents lifecycle closure; and
- the official detail pattern `/job/<city>/<slug>/287/<id>` supplies a stable external ID.

- [ ] **Step 3: Confirm failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/connectors/citi.test.ts`

Expected: FAIL because the connector does not exist.

- [ ] **Step 4: Implement cheap complete reconciliation**

Parse only summary fields from all official India result pages. Bound pages by the source-reported page count plus one defensive page; reject an unexplained loop or total collapse as anomalous. Do not fetch detail pages during enumeration.

- [ ] **Step 5: Implement overlapping watch queries and bounded hydration**

Union official searches/categories for Entry Level, Finance, Banking & International, Business Strategy, Compliance, Controls, Data Analytics, Investment Banking, Markets, Operations, Research, Risk, Student/Graduate, Wealth, plus generic analyst/associate/graduate terms. Deduplicate IDs before selecting details. A watch can discover quickly, but only reconciliation can certify full-board freshness.

- [ ] **Step 6: Run connector, orchestration, and full tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/connectors/citi.test.ts supabase/functions/first-look-api/scan.test.ts`

Expected: PASS, including the assertion that an 800-item board does not make 800 detail requests.

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 7: Commit Citi support**

```powershell
git add backend/supabase/functions/first-look-api/connectors/citi.ts backend/supabase/functions/first-look-api/connectors/citi.test.ts backend/supabase/functions/first-look-api/connectors/registry.ts backend/supabase/functions/first-look-api/test-fixtures/citi-india-page-1.html backend/supabase/functions/first-look-api/test-fixtures/citi-india-page-2.html backend/supabase/functions/first-look-api/test-fixtures/citi-model-analyst-c09.html
git commit -m "feat: add lightweight citi india connector"
```

---

### Task 9: Add failure-safe OpenRouter ambiguity classification

**Files:**
- Create: `backend/supabase/functions/first-look-api/classification/openrouter.ts`
- Create: `backend/supabase/functions/first-look-api/classification/openrouter.test.ts`
- Modify: `backend/supabase/functions/first-look-api/config.ts`
- Modify: `backend/supabase/functions/first-look-api/scan.ts`

- [ ] **Step 1: Write failing mocked-network tests**

Cover valid schema output, malformed JSON, wrong schema, unsupported structured output, timeout, 429/quota exhaustion, one fallback attempt, low-confidence evidence, response model recording, and cache hits by description hash/version. Every failure must return `matchTier: "possible"` and `classificationMethod: "pending"`.

- [ ] **Step 2: Confirm failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/classification/openrouter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement strict request and response validation**

POST to `https://openrouter.ai/api/v1/chat/completions` only when deterministic output is ambiguous and the description hash/version is not cached. Require application-owned JSON with location, finance, experience, numeric years, confidence, and short evidence fields. Validate evidence as normalized substrings or clearly derived structured fields from the supplied job data.

Use `OPENROUTER_MODEL` as the required primary concrete slug and parse at most two comma-separated concrete values from `OPENROUTER_FALLBACK_MODELS`. Reject `openrouter/free` in configuration. Persist requested and actual model IDs; do not store the bearer token.

- [ ] **Step 4: Keep scanning functional without OpenRouter**

If `OPENROUTER_API_KEY` or `OPENROUTER_MODEL` is absent, return pending/possible without a network call. Do not fail connector health or hide the observation.

- [ ] **Step 5: Run OpenRouter and scan tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/classification/openrouter.test.ts supabase/functions/first-look-api/scan.test.ts`

Expected: PASS with zero real network calls.

- [ ] **Step 6: Commit the ambiguity adapter**

```powershell
git add backend/supabase/functions/first-look-api/classification/openrouter.ts backend/supabase/functions/first-look-api/classification/openrouter.test.ts backend/supabase/functions/first-look-api/config.ts backend/supabase/functions/first-look-api/scan.ts
git commit -m "feat: add failure-safe openrouter classification"
```

---

### Task 10: Expose source-aware jobs and coverage health through the API

**Files:**
- Modify: `backend/supabase/functions/first-look-api/presenters.ts`
- Modify: `backend/supabase/functions/first-look-api/presenters.test.ts`
- Modify: `backend/supabase/functions/first-look-api/index.ts`
- Modify: `backend/supabase/functions/first-look-api/http.test.ts`

- [ ] **Step 1: Write failing response-shape tests**

One canonical job must include official URLs, source badges, exact source links and verification timestamps, match tier, concise evidence, official verification state, and source-health state. Portal-only records must be labelled unverified. Public diagnostics must exclude raw response bodies, tokens, and unbounded metadata.

```ts
assert.deepEqual(payload.sources.map((source) => source.type), ["official_career", "linkedin"]);
assert.equal(payload.applyUrl, payload.officialApplyUrl);
assert.equal(payload.matchTier, "possible");
assert.equal(payload.eligibilityNote, "Experience or relevance unconfirmed");
```

- [ ] **Step 2: Confirm current presenter failure**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/presenters.test.ts supabase/functions/first-look-api/http.test.ts`

Expected: FAIL because the current API exposes only old single-source fields.

- [ ] **Step 3: Implement canonical job presentation**

Return one card per `jobs.id`. Sort exact before possible, then newest first. Prefer verified official apply/detail URLs; use an active portal link only when no official destination exists and label it clearly. Include `watchFreshness` and `reconcileFreshness` separately.

- [ ] **Step 4: Add sanitized coverage route**

Add `GET /coverage` returning connector/company, source type, latest statuses, last complete watch/reconcile times, counts, page/detail progress, unresolved apply count, backlog, anomaly summary, and portal gaps. Do not expose raw metadata or stack traces.

- [ ] **Step 5: Run API and full tests**

Run: `npx.cmd tsx --test supabase/functions/first-look-api/presenters.test.ts supabase/functions/first-look-api/http.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests PASS.

- [ ] **Step 6: Commit source-aware API responses**

```powershell
git add backend/supabase/functions/first-look-api/presenters.ts backend/supabase/functions/first-look-api/presenters.test.ts backend/supabase/functions/first-look-api/index.ts backend/supabase/functions/first-look-api/http.test.ts
git commit -m "feat: expose job sources and coverage health"
```

---

### Task 11: Render provenance and coverage without cluttering the PWA

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `sw.js`

- [ ] **Step 1: Add a minimal browser-testable fixture mode**

Extract pure rendering helpers or add a local static response fixture so source cards can be tested without production Supabase. Include one official-plus-portal job, one portal-only job, one possible match, and one partial connector.

- [ ] **Step 2: Implement one-card-per-job presentation**

Each card shows company, title, location, match label, official/portal source badges, newest verification time, and one primary Apply button. Add a compact expandable Sources row with exact links. Use `Official listing not yet verified` for portal-only cards and `Experience or relevance unconfirmed` for possible matches.

- [ ] **Step 3: Add a compact source-health panel**

Show company, latest status, last full reconciliation, discovered/reported count, and candidate detail backlog. Never render unsupported/partial/failed/anomalous as `0 jobs`; use direct operational copy such as `Full scan incomplete — keeping prior listings`.

- [ ] **Step 4: Keep service-worker notification payload source-aware**

Read canonical job ID, discovery source, match tier, and preferred apply URL from payload. Preserve existing push handling without implementing delivery. Use the canonical ID as the notification tag so duplicate source observations do not create duplicate notifications.

- [ ] **Step 5: Run local PWA checks**

Run a local static server from the repository root and inspect desktop plus mobile widths. Verify keyboard access to Sources, visible focus, readable badges, working official Apply link, portal-only warning, and the partial-source message.

Run: `node --check app.js`

Expected: no output and exit code 0.

Run: `node --check sw.js`

Expected: no output and exit code 0.

- [ ] **Step 6: Commit the source-aware PWA**

```powershell
git add index.html app.js styles.css sw.js
git commit -m "feat: show source provenance and scan health"
```

---

### Task 12: Add staggered schedules and operational documentation

**Files:**
- Create: `backend/supabase/migrations/007_source_scan_schedules.sql`
- Modify: `backend/README.md`
- Modify: `backend/supabase/config.toml`

- [ ] **Step 1: Write the schedule matrix in the README first**

Document:

- Moody's and D. E. Shaw full reconciliation every 30 minutes while their inventories remain at most 200;
- Citi watch every 30 minutes and full lightweight reconciliation every two hours while its India inventory remains 201-1,000;
- candidate hydration groups every 30 minutes until backlog is zero;
- immediate reconciliation on reported-total change, portal sighting, deferred-audit failure, or anomaly; and
- dynamic database updates never redeploy GitHub Pages.

- [ ] **Step 2: Add staggered cron invocations**

Create distinct cron jobs with non-overlapping minute offsets. Each invokes `first-look-api/scan?group=<group>&run_type=<type>` with the existing scan token mechanism and a timeout appropriate to that bounded group. Remove or unschedule the old monolithic cron in the same migration.

- [ ] **Step 3: Document secret setup without exposing values**

Use Supabase Dashboard → Edge Functions → Secrets for:

```text
OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_FALLBACK_MODELS
OPENROUTER_PROMPT_VERSION
```

State explicitly that the user enters the real key in the dashboard, not in chat or the repository. If CLI setup is preferred, use an interactive/local environment workflow that does not put the value into committed files; never include the literal value in shell examples.

- [ ] **Step 4: Document failure semantics and runbooks**

Include how to inspect watch versus reconcile freshness, candidate backlog, count collapse, partial pagination, unresolved apply URLs, OpenRouter pending classification, and two-miss closure. Include commands for local tests, function deployment, logs, and manual group invocation without secret values.

- [ ] **Step 5: Run all static and automated checks**

Run from `backend`: `npm.cmd test`

Expected: all tests PASS with no real connector or OpenRouter network calls.

Run from repository root: `node --check app.js`

Expected: exit code 0.

Run from repository root: `node --check sw.js`

Expected: exit code 0.

Run: `rg -n "OPENROUTER_API_KEY=|sk-or-|Bearer [A-Za-z0-9_-]{20,}|TODO|TBD" . --glob "!backend/node_modules/**" --glob "!docs/superpowers/plans/**"`

Expected: no secret-like values and no unresolved implementation markers in changed production files.

- [ ] **Step 6: Commit schedules and operations docs**

```powershell
git add backend/supabase/migrations/007_source_scan_schedules.sql backend/README.md backend/supabase/config.toml
git commit -m "ops: stagger source-aware scan schedules"
```

---

### Task 13: Verify locally, deploy with authorization, and prove live coverage

**Files:**
- Modify only if verification reveals a reproducible defect; add a failing regression test before any fix.

- [ ] **Step 1: Run the complete local suite from a clean dependency install**

From `backend`:

```powershell
npm.cmd ci
npm.cmd test
```

Expected: dependency audit output followed by all tests PASS. Treat command timeout as inconclusive and rerun the focused failing command.

- [ ] **Step 2: Run local Supabase migration/integration verification**

Start/reset the local Supabase stack if Docker is available, then verify tables, constraints, migration of the old Moody's row, two-miss lifecycle, and public-write denial. If local Docker is unavailable, run these assertions against a disposable Supabase branch before production migration.

- [ ] **Step 3: Inspect the diff and security boundary**

Run:

```powershell
git status --short
git diff --check
git diff --stat
git grep -n -E "OPENROUTER_API_KEY=|sk-or-|service_role.*['\"]" -- . ":(exclude)backend/package-lock.json"
```

Expected: only intended files changed, no whitespace errors, and no secret values.

- [ ] **Step 4: Configure OpenRouter directly in Supabase**

The user enters the key under Supabase Edge Function secrets. Configure one currently tested concrete `OPENROUTER_MODEL`, no more than two concrete fallbacks, and a fixed prompt version. Do not accept `openrouter/free`. Invoke a single known ambiguous fixture through the deployed function and verify the stored actual model ID; if configuration is absent or quota fails, verify the same job remains `possible`/`pending`.

- [ ] **Step 5: Deploy migrations and the Edge Function only after explicit deployment authorization**

Apply migrations in order, deploy `first-look-api`, and manually invoke one bounded group at a time. Do not deploy the static PWA until API compatibility is verified. Preserve the previous function release as the rollback target.

- [ ] **Step 6: Prove official source completeness live**

For each supported employer:

1. run a complete reconciliation;
2. compare reported total, discovered unique IDs, expected pages, and fetched pages;
3. verify every due candidate detail is fetched or visibly backlogged/degraded;
4. reopen a sample of saved official detail and apply URLs; and
5. confirm old active jobs remain after an intentionally simulated partial scan.

D. E. Shaw verification must include the known Financial Operations/compliance/private-credit role patterns. Citi verification must include the official India board and the Model/Analysis/Validation Analyst I C09 pattern when still active; if a historical example has closed, verify the parser against its fixture and document the live replacement sampled.

- [ ] **Step 7: Verify API and PWA behavior**

Confirm `/jobs` returns one canonical card with source arrays and official URL preference, `/coverage` distinguishes watch from reconciliation freshness, and the live PWA renders badges/health correctly at desktop and mobile widths. Verify a second source does not duplicate the card or notification tag.

- [ ] **Step 8: Record evidence and make a verification-only commit if docs changed**

If live verification changes the operational README, commit only those evidence/runbook edits:

```powershell
git add backend/README.md
git commit -m "docs: record source coverage verification"
```

Report code/test status, function deployment, database migration, scheduler state, and live PWA verification as separate outcomes. Do not declare D. E. Shaw or Citi supported if index reconciliation is partial or anomalous.
