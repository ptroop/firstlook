# Source-Aware Job Coverage Design

## Goal

Turn First Look from a single-source matching feed into a source-aware job monitor that:

- inventories lightweight metadata from each supported employer's complete official India careers index, while fetching full details only for a high-recall candidate set;
- distinguishes official career pages from LinkedIn, Naukri, iimjobs, Indeed, and future sources;
- combines duplicate observations into one canonical job card without losing source evidence;
- keeps the employer's verified direct-apply URL as the preferred application destination;
- detects and reports incomplete career-page coverage instead of presenting a misleading empty feed;
- identifies India finance roles suitable for candidates with zero to two years of experience without allowing classification errors to erase listings; and
- sends one prompt PWA notification per canonical job, with the discovery source identified.

The existing Supabase backend, GitHub Pages frontend, and 30-minute scan schedule remain the foundation.

## Non-Negotiable Invariants

1. Index enumeration, candidate selection, detail hydration, and final classification are separate stages.
2. Every official India index entry is tracked as minimal inventory, but unrelated inventory does not become a full job record or receive a detail fetch.
3. Every high-recall candidate that is hydrated is persisted before final finance or experience classification.
4. An AI or deterministic final-classification failure never deletes, hides, or deactivates a hydrated candidate.
5. A connector may report enumeration `complete` only when its pagination contract is satisfied, and candidate hydration `complete` only when every due candidate detail fetch is satisfied.
6. A partial or failed connector never deactivates previously active listings.
7. A job absent from one complete scan is not immediately considered closed; closure requires two consecutive complete misses.
8. Every hydrated source URL remains attributable to the scan that observed it.
9. An official direct-apply URL takes precedence over portal application URLs.
10. If deduplication is uncertain, preserve separate jobs for review rather than incorrectly merging them.
11. The UI never translates `unsupported`, `partial`, `failed`, or anomalous source health into `no jobs`.

## Approaches Considered

### Expand the existing keyword regular expressions

This is fast but unsafe. The current classifier misses common wording such as `1-2 years`, compliance, private-credit operations, portfolio reporting, fund administration, and pricing. Every future employer can introduce new terminology, so adding words cannot establish career-page completeness.

### Classify with an LLM before persistence

This handles varied wording but makes discovery nondeterministic. Model outages, invalid JSON, quota exhaustion, or a mistaken classification could prevent a legitimate listing from entering the system.

### Inventory first, then hydrate a high-recall candidate set

This is the selected approach. The connector reads the complete lightweight results index so new IDs cannot disappear unnoticed, but stores only minimal metadata for clearly unrelated roles. New or changed entries with finance signals, early-career signals, generic titles, unknown categories, or portal corroboration are hydrated from their detail pages and become source observations. Deterministic parsing handles clear details; a pinned OpenRouter model reviews only ambiguous new or changed descriptions. Final classification affects feed labels and notification priority, never hydrated-source retention.

## System Boundaries

The design contains six independent units:

1. **Source connectors** enumerate lightweight listing indexes.
2. **Inventory and candidate selection** tracks all index IDs and selects a deliberately broad detail-fetch set.
3. **Source observation storage** preserves complete evidence for hydrated candidates.
4. **Canonicalization** links observations that represent the same vacancy.
5. **Classification** determines location, finance relevance, experience eligibility, and confidence from full details.
6. **Presentation and notification** exposes one job with source badges and sends one deduplicated alert.

CV generation and full career-ops-style CV rewriting are a separate implementation slice. The OpenRouter client introduced here will be reusable by that feature, but this specification does not send CV files or personal information to a model.

## Data Model

### `source_inventory`

`source_inventory` is a compact, non-user-facing index used to detect new, changed, and disappeared official listings without downloading every job description.

Required fields:

- `connector_id`, `source_external_id`, `company`.
- `title`, `location`, `category`, `department` when exposed by the results index.
- `detail_url`, `listing_metadata_hash`.
- `first_seen_at`, `last_seen_at`, `last_scan_run_id`.
- `candidate_status`: `hydrate`, `defer`, `hydrated`, or `audit`.
- `candidate_reasons`: bounded structured reasons from the high-recall prefilter.
- `consecutive_complete_misses`, `active`.

This table stores no full description and is not returned by `GET /jobs`. Closed non-candidate inventory may be pruned after a retention window because its purpose is change detection and coverage audit, not user history.

### `jobs`

`jobs` represents a hydrated canonical candidate vacancy rather than a source-specific listing or every item in the employer's board.

Required fields:

- `id`: internal stable identifier.
- `company`: normalized employer name.
- `employer_job_id`: verified official employer reference when available.
- `title`, `location`, `description`, `job_category`.
- `posted_at`, `first_seen_at`, `last_seen_at`.
- `official_detail_url`, `official_apply_url`.
- `location_status`: `india`, `not_india`, or `uncertain`.
- `finance_status`: `exact`, `likely`, `unrelated`, or `unclassified`.
- `experience_status`: `zero_to_two`, `ambiguous`, `over_two`, or `unclassified`.
- `minimum_years`, `maximum_years`: nullable numeric values.
- `match_tier`: `exact`, `possible`, or `not_targeted`.
- `classification_method`: `deterministic`, `openrouter`, `mixed`, or `pending`.
- `classification_version`, `description_hash`, `classified_at`.
- `active`, `consecutive_complete_misses`, `closed_at`.

The existing `source_company` and `source_url` semantics will be migrated rather than reused ambiguously. Employer identity belongs on `jobs`; discovery provenance belongs on `job_sources`.

### `job_sources`

`job_sources` records one hydrated source observation of a canonical candidate job.

Required fields:

- `id`; `job_id` is nullable until canonicalization succeeds.
- `canonicalization_status`: `linked`, `pending`, or `conflict`.
- `source_type`: `official_career`, `linkedin`, `naukri`, `iimjobs`, `indeed`, or `other`.
- `source_name`: human-readable platform or employer careers name.
- `source_external_id`: the source's listing ID when available.
- `listing_url`, `detail_url`, `apply_url`.
- `is_official`.
- `first_seen_at`, `last_seen_at`, `last_verified_at`.
- `active`, `listing_metadata_hash`, `content_hash`.
- `hydration_status`: `pending`, `complete`, or `failed`.
- `detail_checked_at`, `next_detail_check_at`.
- `first_scan_run_id`, `last_scan_run_id`.
- `raw_metadata`: bounded JSON containing non-sensitive source fields needed for debugging.

A unique constraint on `(source_type, source_name, source_external_id)` applies when an external ID exists. URL fingerprints provide the fallback source identity.

An observation is persisted before canonicalization. If no canonical match can be created safely, it remains unlinked with `canonicalization_status = pending` or `conflict` and enters the review queue. This preserves the source evidence without forcing an incorrect merge.

### `source_scan_runs`

The existing diagnostics table will be extended with:

- `source_type`, `connector_id`, `connector_version`.
- `run_type`: `watch`, `reconcile`, or `hydrate`.
- `status`: `complete`, `partial`, `failed`, `unsupported`, or `anomalous`.
- `hydration_status`: `complete`, `backlog`, or `degraded`.
- `reported_total`, `pages_expected`, `pages_fetched`.
- `listings_discovered`, `inventory_created`, `inventory_changed`.
- `candidates_selected`, `details_due`, `details_fetched`, `details_backlogged`.
- `apply_urls_resolved`, `candidate_observations_persisted`.
- `new_observations`, `changed_observations`, `canonical_jobs_created`.
- `baseline_count`, `count_change_ratio`.
- bounded exclusions and error summaries.
- start and finish timestamps.

### `job_classifications`

Classification history is retained separately for auditability:

- `job_id`, `description_hash`, `classification_version`.
- deterministic result and evidence.
- model result and evidence when used.
- requested and actual OpenRouter model IDs.
- final result, confidence, validation errors, and timestamp.

This makes model changes reviewable and prevents repeated AI calls for unchanged descriptions.

### `connector_state`

Each supported source has one operational state record:

- `connector_id`, `source_type`, `source_name`, `company`, `scan_group`.
- `baseline_completed_at`, `last_watch_complete_at`, `last_reconcile_complete_at`, `last_reported_total`.
- `last_page_count`, `consecutive_failures`, `next_due_at`.
- `reconcile_interval_hours`: connector-specific based on board size and API capabilities.
- `detail_recheck_hours`: 24 by default.
- `detail_batch_size`: connector-specific and bounded by observed runtime.

The first successful enumeration establishes the source baseline. Baseline observations populate the feed but do not generate hundreds of historical new-job notifications.

## Source Connectors

### Official connectors

Official connectors are the authoritative discovery path. Each connector uses the employer's actual public ATS/search surface rather than a career homepage or search-engine snippets. Shared adapters may support Greenhouse, Lever, SmartRecruiters, Workday, SuccessFactors, Zoho Recruit, and other ATS families; custom employers such as D. E. Shaw receive dedicated adapters.

Each connector must:

1. request the official India filter or enumerate all locations when no reliable India filter exists;
2. follow every pagination cursor, offset, or result page;
3. record the source-reported total when available;
4. collect stable job IDs and every detail URL;
5. upsert minimal inventory and run the high-recall candidate selector;
6. fetch every due candidate detail page with bounded concurrency and timeouts;
7. extract the full description, structured location, posting date, experience wording, and direct-apply destination;
8. persist each hydrated candidate observation before final classification; and
9. return machine-checkable enumeration, selection, and hydration diagnostics.

A connector's enumeration status is `complete` only if every expected results page was fetched and the discovered count agrees with the source-reported total when one exists. A source with no reported total may complete enumeration only when pagination termination is explicit. Candidate hydration is independently `complete` only when every candidate detail due in that run was fetched and parsed; remaining due work is reported as `backlog`, while failed due details produce `degraded`. Non-candidate inventory never prevents candidate hydration from completing.

### Enumeration and detail hydration

Large employers are processed in two stages. Enumeration follows the complete official pagination surface and writes only compact inventory rows. Candidate hydration fetches full details only when a listing is new or changed and the high-recall selector marks it for hydration, when its previous hydration failed, when a portal reports the same listing, or when an active candidate is due for periodic revalidation.

The high-recall selector hydrates a listing when any of these conditions holds:

1. title, category, or department contains any finance-taxonomy signal;
2. title contains an early-career signal such as graduate, trainee, intern, apprentice, analyst, associate, officer, executive, coordinator, specialist, consultant, advisor, or researcher;
3. the title is generic, the category or department is missing, or the source metadata is otherwise insufficient to exclude it safely;
4. education metadata mentions MBA, PGDM, CA, CFA, commerce, economics, finance, accounting, or a related field;
5. a portal source reports the same employer listing; or
6. a connector-specific rule covers known employer terminology such as D. E. Shaw's generic `Analyst` titles.

Only entries with a strong structured non-finance category and no finance, education, early-career, generic-title, or portal signal may be deferred. A bounded detail batch prevents large sources such as Citi from exhausting one Edge Function invocation. Due candidates remain visible as `Details pending`; unprocessed due details form an explicit backlog. On normal post-baseline scans, all newly selected candidates are expected to finish in the same scan group. Presence reconciliation depends on complete enumeration, while classification confidence depends on hydration and final job closure still requires two consecutive complete enumeration misses.

To detect prefilter drift, each connector hydrates a small deterministic sample of newly deferred entries, capped per company per day. If the audit finds a relevant false negative, the connector becomes `anomalous`, affected inventory is re-evaluated, and the taxonomy or connector-specific rule must be corrected before normal health is restored.

The initial baseline suppresses new-job notifications for pre-existing candidates. Listings first seen after `baseline_completed_at` may notify as soon as candidate hydration establishes an exact or possible match. Inventory that is safely deferred is neither displayed nor sent to OpenRouter.

### Fast watch and full reconciliation

Large boards do not download their complete index every 30 minutes unless the official ATS can return it cheaply. Each connector chooses the strongest available strategy in this order:

1. official change feed, `modifiedSince` filter, webhook, ETag, or conditional request;
2. official server-side location, department, category, keyword, and posting-date filters; or
3. paginated lightweight summary enumeration.

The 30-minute `watch` run unions several deliberately overlapping official searches: finance-taxonomy terms, early-career terms, generic titles, graduate programmes, employer-specific departments, and recently posted jobs. It hydrates only new or changed candidate IDs.

A `reconcile` run enumerates the complete lightweight India index to catch unusual titles or search behaviour and audits entries missed by the watch queries. Boards with at most 200 index entries reconcile every 30 minutes. Boards with 201-1,000 entries reconcile at least every two hours. Larger boards reconcile at least every six hours. A changed source-reported total, portal-only sighting, taxonomy-audit failure, or connector anomaly triggers an immediate reconciliation. Connectors may reconcile more often when conditional requests or compact APIs make it inexpensive.

The health view reports watch freshness and full-reconciliation freshness separately. A successful watch cannot masquerade as recent full-board reconciliation.

### Portal connectors

Portals are secondary sentinels, not substitutes for official career connectors. Initial portal integrations may use legitimate public feeds, official APIs, or user-owned alert emails. The system will not scrape authenticated sessions, reuse cookies, bypass access controls, or automate application submission.

A portal-only observation is visible with its platform badge and the label `Official listing not yet verified`. It also creates a coverage-reconciliation item for the employer connector. When an official match appears, the observation is attached to the existing canonical job and the official apply URL becomes primary.

### Execution scheduling

The complete employer list will not run in one Edge Function invocation. Connectors are assigned to bounded scan groups based on observed page count and latency. Each watch group runs every 30 minutes with staggered start times; reconciliation and hydration groups run only when due. Every invocation uses bounded per-source concurrency and targets completion below the deployed function timeout. Heavy custom connectors run alone; fast ATS-family connectors may share a group.

Failure or timeout in one group cannot prevent another group from running. Diagnostics and lifecycle updates remain source-scoped. Job updates are database writes consumed dynamically by the PWA, so neither a scan nor a new listing triggers a GitHub Pages deployment.

## Canonicalization and Deduplication

Observations are matched in this order:

1. normalized employer plus verified employer job ID;
2. canonicalized official detail or final apply URL;
3. normalized employer, title, location, and posting date;
4. normalized employer, title, location, and description fingerprint.

Strong identifiers merge automatically. Weaker fingerprints require a high deterministic similarity threshold and must not merge roles with conflicting employer IDs or locations. Ambiguous candidates remain separate and enter a deduplication review queue.

The canonical job prefers official values. Portal values fill missing fields but cannot overwrite a newer verified official title, description, location, posting date, or apply URL.

## Classification

### Location

Structured country and city fields from the ATS are preferred. The India vocabulary includes states, union territories, major and secondary hiring cities, common spelling variants, and multi-location formats. `Remote` or regional labels qualify only when India is explicitly included. Missing or ambiguous location becomes `uncertain` and remains reviewable rather than being dropped.

### Finance taxonomy

The deterministic classifier uses weighted multi-word concepts rather than one flat regex:

- corporate finance: FP&A, business finance, controllership, MIS, accounting, audit, assurance, tax, treasury, and reporting;
- investments: investment banking, equity research, credit research, ratings, valuation, M&A, capital markets, asset management, wealth, private credit, and private equity;
- markets: securities, derivatives, fixed income, equities, pricing, underwriting, trading, and trade support;
- financial operations: fund accounting, fund administration, middle office, reconciliation, settlements, collateral, portfolio reporting, and investment operations;
- risk and compliance: credit, market, and operational risk, controls, regulatory reporting, compliance, AML, KYC, and trade monitoring; and
- transactions and advisory: transaction services, financial due diligence, restructuring, deals, corporate development, and financial advisory.

MBA, PGDM, CA, CFA, commerce, economics, and related education increase relevance but are not mandatory. Technology or data vocabulary does not exclude a role when meaningful finance signals exist.

### Experience

The parser normalizes words, Unicode dashes, plus signs, month ranges, minimums, maximums, preferred requirements, and multiple requirements in one description.

`zero_to_two` includes explicit ranges whose maximum is at most two years, zero to 24 months, fresher and recent-graduate language, no required prior experience, and experience that is only preferred but not required.

`over_two` requires an explicit minimum above two years or an explicit bounded range whose maximum exceeds two years. `1+`, `2+`, conflicting statements, and missing experience remain `ambiguous` because a candidate with up to two years may still qualify.

### Match tiers

- `exact`: India, finance `exact`, and experience `zero_to_two`.
- `possible`: India or location-uncertain, finance `exact` or `likely`, and experience `zero_to_two` or `ambiguous`.
- `not_targeted`: explicitly non-India, finance-unrelated, or experience-over-two.

All three tiers remain stored. The default feed shows `exact` and `possible`; the coverage view can inspect every official India observation. Both exact and possible new jobs receive prompt notifications by default, with possible matches labelled `Experience or relevance unconfirmed`.

## OpenRouter Decision

OpenRouter is the model gateway for ambiguous classification. The application will not use the random `openrouter/free` router for production classifications because changing models undermines reproducibility.

Configuration is server-side only:

- `OPENROUTER_API_KEY`.
- `OPENROUTER_MODEL`: one tested concrete model slug, optionally a free variant.
- `OPENROUTER_FALLBACK_MODELS`: at most two tested concrete fallback slugs.
- `OPENROUTER_PROMPT_VERSION`.

Only new or changed ambiguous jobs call OpenRouter. Clear deterministic cases do not. The request requires structured JSON matching an application-owned schema. The response is schema-validated, evidence-checked against the supplied description, and cached by description hash and classification version.

Model quota exhaustion, timeout, refusal, unsupported structured output, malformed JSON, or low confidence produces `classification_method = pending` and `match_tier = possible`. It cannot suppress the job. The resolved model ID is recorded for auditability.

OpenRouter logging and training opt-ins remain disabled. When CV matching is added in its own slice, requests will require Zero Data Retention routing and a redacted normalized candidate profile rather than the original document or direct identifiers.

## Lifecycle and Closure

Each complete official scan updates observations it sees and increments the complete-miss count for previously active observations it does not see. An official observation becomes inactive only after two consecutive complete misses. Partial, failed, unsupported, or anomalous runs do not increment misses.

The canonical job remains active while any credible source is active. If the official source closes but a portal remains active, the card is labelled `Official listing no longer verified`; the portal cannot silently keep the job marked officially open.

Material description, location, experience, or apply-link changes reset classification and trigger re-evaluation. A changed listing does not generate a duplicate `new job` alert, but may generate a concise `job updated` notification when eligibility or the application destination changes.

## Coverage Monitoring

For every company and source, the app exposes:

- last complete scan time;
- latest status and error summary;
- source-reported and discovered counts;
- expected and fetched page/detail counts;
- unresolved apply URLs;
- count change from the recent complete-scan baseline; and
- portal observations not reconciled with the official connector.

A scan becomes `anomalous` when the source count collapses beyond a connector-specific threshold, returns zero after a nonzero baseline without a verified empty result, loses pagination markers, or stops resolving apply URLs. An anomalous run preserves prior data and raises a source-health alert.

Known active URLs are revalidated independently of enumeration. Portal-only sightings for supported employers create a `coverage_gap` item. A daily reconciliation run reviews gaps and source health even when no matching jobs were found.

## API and PWA Presentation

`GET /jobs` returns canonical jobs with:

- official detail and apply URLs;
- source badge summaries;
- a list of source observations and verification timestamps;
- match tier and concise eligibility evidence; and
- official verification and source-health state.

One card is rendered per canonical job. The primary Apply button uses the verified official URL when available. An expandable Sources area lists exact source links and timestamps. Portal-only cards use the portal link and visibly state that no official listing has been verified.

Notification payloads include canonical job ID, company, title, match tier, discovery source, and preferred application URL. Notification deduplication uses canonical job ID, not source observation ID. Adding a second source to an already-alerted job does not send another new-job notification; finding the official apply link may send one optional source-upgrade notification.

## Error Handling and Security

- Secrets stay in Supabase Edge Function secrets and never enter GitHub Pages, API responses, logs, database metadata, or committed files.
- Remote response bodies are bounded before parsing and are not logged wholesale.
- Connector concurrency, timeouts, retries, and page limits are source-specific.
- Retries use bounded exponential backoff and respect rate-limit responses.
- One malformed listing cannot fail unrelated companies.
- Database writes are idempotent by source identity and canonical identity.
- Public APIs expose only sanitized diagnostics.
- Portal integrations do not store login credentials, session cookies, submitted applications, or private account content.

## Testing

### Connector contract tests

Every connector requires fixtures and tests for pagination, reported totals, inventory updates, high-recall candidate selection, candidate-detail parsing, direct-apply resolution, deferred-entry audits, malformed listings, timeouts, and completeness status.

### Classification tests

Golden fixtures include the verified Moody's Senior Financial Data Analyst and D. E. Shaw roles using `up to 2 years`, `1-2 years`, private-credit operations, compliance, pricing, and finance operations. Phrase-table tests cover numeric ranges, number words, Unicode dashes, months, optional experience, open-ended minimums, contradictory requirements, and missing fields.

### Persistence and lifecycle tests

Tests prove that all official index IDs enter minimal inventory, only selected candidates are hydrated into source observations, generic titles cannot be deferred, source provenance survives canonicalization, partial scans cannot deactivate jobs, closure requires two complete misses, portal observations cannot overwrite official data, and uncertain deduplication does not merge.

### OpenRouter tests

Network calls are mocked. Tests cover schema-valid results, malformed JSON, unsupported structured output, low-confidence evidence, timeout, quota exhaustion, fallback-model metadata, caching, and the invariant that every failure leaves the job visible as `possible`.

### End-to-end verification

Before each connector is declared supported:

1. local tests and syntax/type checks pass;
2. a live official scan reconciles the complete listing index and every due candidate-detail count;
3. saved direct-apply links are reopened successfully;
4. the API returns source badges and verification metadata; and
5. the PWA shows one canonical card and a source-aware notification.

## Rollout

1. Migrate source inventory, canonical jobs, source observations, diagnostics, and classification history without losing the deployed Moody's record.
2. Change ingestion so complete official index metadata is inventoried and high-recall candidates are hydrated before final classification.
3. Replace the flat keyword regex with location, finance-taxonomy, and experience-parser modules.
4. Add canonicalization, source-aware API fields, badges, Sources details, and source-health states.
5. Add the OpenRouter ambiguity adapter with concrete model configuration, strict schema validation, caching, and failure-safe behaviour.
6. Build and live-verify D. E. Shaw and Citi connectors, including regression fixtures for the manually confirmed roles.
7. Add shared ATS-family connectors and then custom connectors for the approved employer list.
8. Add legitimate Naukri, iimjobs, Indeed, and LinkedIn sentinel inputs where technically and contractually available.
9. Add PWA push delivery, canonical notification deduplication, source upgrades, and coverage-gap alerts.

## Implementation Decomposition

This document is the program-level design. Implementation is divided into independently reviewable slices so career-page integrity is completed before portal or CV expansion:

1. **Career-page integrity and source provenance:** schema migration, lightweight complete inventory, high-recall candidate hydration, classification rewrite, source-aware API and UI, staggered scan groups, coverage diagnostics, and live-verified D. E. Shaw and Citi connectors.
2. **Official employer expansion:** shared ATS-family adapters followed by custom adapters for the approved employer list, each gated by fixtures and live count reconciliation.
3. **Portal sentinels and reconciliation:** legitimate LinkedIn, Naukri, iimjobs, and Indeed inputs, canonical linking, portal-only labels, and coverage-gap handling.
4. **Push delivery:** VAPID delivery, one notification per canonical job, source-aware copy, update notifications, and delivery diagnostics.
5. **CV matching:** a separate privacy-reviewed specification using the shared OpenRouter client and a redacted normalized candidate profile.

After this specification is approved, the next implementation plan covers only slice 1. Later slices receive their own design or implementation review before code changes.

## Success Criteria

- One canonical job can expose multiple accurately labelled source links.
- The official direct-apply URL is primary whenever verified.
- Every official India index ID is tracked in compact inventory; only high-recall candidates and audit samples receive full detail fetches.
- A bad final-classification keyword, model response, or quota failure cannot erase or hide a hydrated candidate.
- Complete connectors fetch every expected index page and every due candidate detail or report a visible non-complete status.
- Unsupported, partial, failed, and anomalous sources never appear as legitimate zero-result scans.
- Existing jobs survive source failures and close only after two complete misses.
- D. E. Shaw and Citi live scans reconcile with manually verified official listings before support is declared.
- Large sources inventory listing summaries while hydrating only new, changed, failed, portal-corroborated, audited, or stale candidate details in bounded batches.
- Generic titles and missing categories always enter candidate hydration, while only strongly structured non-finance entries may be deferred.
- Deferred-entry audits detect taxonomy drift and make false-negative coverage failures visible.
- Initial source baselines do not create a notification flood, while listings first seen after baseline remain eligible for immediate alerts.
- OpenRouter is called only for new or changed ambiguous jobs, and every result is reproducible from recorded model, prompt, taxonomy, and description versions.
- Notifications identify the discovery source and are deduplicated across portal and official observations.
