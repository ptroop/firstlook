# Source-Aware Job Coverage Design

## Goal

Turn First Look from a single-source matching feed into a source-aware job monitor that:

- captures every listing fetched from each supported employer's official India careers surface before filtering;
- distinguishes official career pages from LinkedIn, Naukri, iimjobs, Indeed, and future sources;
- combines duplicate observations into one canonical job card without losing source evidence;
- keeps the employer's verified direct-apply URL as the preferred application destination;
- detects and reports incomplete career-page coverage instead of presenting a misleading empty feed;
- identifies India finance roles suitable for candidates with zero to two years of experience without allowing classification errors to erase listings; and
- sends one prompt PWA notification per canonical job, with the discovery source identified.

The existing Supabase backend, GitHub Pages frontend, and 30-minute scan schedule remain the foundation.

## Non-Negotiable Invariants

1. Discovery and classification are separate stages.
2. Every successfully fetched official India listing is persisted before finance or experience filtering.
3. An AI or deterministic classification failure never deletes, hides, or deactivates a fetched official listing.
4. A connector may report `complete` only when its pagination and detail-fetch contract is satisfied.
5. A partial or failed connector never deactivates previously active listings.
6. A job absent from one complete scan is not immediately considered closed; closure requires two consecutive complete misses.
7. Every source URL remains attributable to the scan that observed it.
8. An official direct-apply URL takes precedence over portal application URLs.
9. If deduplication is uncertain, preserve separate jobs for review rather than incorrectly merging them.
10. The UI never translates `unsupported`, `partial`, `failed`, or anomalous source health into `no jobs`.

## Approaches Considered

### Expand the existing keyword regular expressions

This is fast but unsafe. The current classifier misses common wording such as `1-2 years`, compliance, private-credit operations, portfolio reporting, fund administration, and pricing. Every future employer can introduce new terminology, so adding words cannot establish career-page completeness.

### Classify with an LLM before persistence

This handles varied wording but makes discovery nondeterministic. Model outages, invalid JSON, quota exhaustion, or a mistaken classification could prevent a legitimate listing from entering the system.

### Persist first, then apply layered classification

This is the selected approach. Official and portal observations are stored independently, canonicalized, and then classified. Deterministic parsing handles clear cases; a pinned OpenRouter model reviews only ambiguous new or changed descriptions. Classification affects feed labels and notification priority, never source retention.

## System Boundaries

The design contains five independent units:

1. **Source connectors** enumerate listings and fetch complete job details.
2. **Source observation storage** preserves exactly what each source reported.
3. **Canonicalization** links observations that represent the same vacancy.
4. **Classification** determines location, finance relevance, experience eligibility, and confidence.
5. **Presentation and notification** exposes one job with source badges and sends one deduplicated alert.

CV generation and full career-ops-style CV rewriting are a separate implementation slice. The OpenRouter client introduced here will be reusable by that feature, but this specification does not send CV files or personal information to a model.

## Data Model

### `jobs`

`jobs` represents a canonical vacancy rather than a source-specific listing.

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

`job_sources` records one source's observation of a canonical job.

Required fields:

- `id`; `job_id` is nullable until canonicalization succeeds.
- `canonicalization_status`: `linked`, `pending`, or `conflict`.
- `source_type`: `official_career`, `linkedin`, `naukri`, `iimjobs`, `indeed`, or `other`.
- `source_name`: human-readable platform or employer careers name.
- `source_external_id`: the source's listing ID when available.
- `listing_url`, `detail_url`, `apply_url`.
- `is_official`.
- `first_seen_at`, `last_seen_at`, `last_verified_at`.
- `active`, `content_hash`.
- `first_scan_run_id`, `last_scan_run_id`.
- `raw_metadata`: bounded JSON containing non-sensitive source fields needed for debugging.

A unique constraint on `(source_type, source_name, source_external_id)` applies when an external ID exists. URL fingerprints provide the fallback source identity.

An observation is persisted before canonicalization. If no canonical match can be created safely, it remains unlinked with `canonicalization_status = pending` or `conflict` and enters the review queue. This preserves the source evidence without forcing an incorrect merge.

### `source_scan_runs`

The existing diagnostics table will be extended with:

- `source_type`, `connector_id`, `connector_version`.
- `status`: `complete`, `partial`, `failed`, `unsupported`, or `anomalous`.
- `reported_total`, `pages_expected`, `pages_fetched`.
- `listings_discovered`, `details_expected`, `details_fetched`.
- `apply_urls_resolved`, `india_listings_persisted`.
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

## Source Connectors

### Official connectors

Official connectors are the authoritative discovery path. Each connector uses the employer's actual public ATS/search surface rather than a career homepage or search-engine snippets. Shared adapters may support Greenhouse, Lever, SmartRecruiters, Workday, SuccessFactors, Zoho Recruit, and other ATS families; custom employers such as D. E. Shaw receive dedicated adapters.

Each connector must:

1. request the official India filter or enumerate all locations when no reliable India filter exists;
2. follow every pagination cursor, offset, or result page;
3. record the source-reported total when available;
4. collect stable job IDs and every detail URL;
5. fetch every detail page with bounded concurrency and timeouts;
6. extract the full description, structured location, posting date, experience wording, and direct-apply destination;
7. persist each India or India-uncertain observation before classification; and
8. return machine-checkable completeness diagnostics.

A connector is `complete` only if all expected pages and detail records were fetched and the discovered count agrees with the source-reported total when one exists. A source with no reported total may be complete only when pagination termination is explicit and all discovered detail pages succeed.

### Portal connectors

Portals are secondary sentinels, not substitutes for official career connectors. Initial portal integrations may use legitimate public feeds, official APIs, or user-owned alert emails. The system will not scrape authenticated sessions, reuse cookies, bypass access controls, or automate application submission.

A portal-only observation is visible with its platform badge and the label `Official listing not yet verified`. It also creates a coverage-reconciliation item for the employer connector. When an official match appears, the observation is attached to the existing canonical job and the official apply URL becomes primary.

### Execution scheduling

The complete employer list will not run in one Edge Function invocation. Connectors are assigned to bounded scan groups based on observed page count and latency. Each group runs every 30 minutes with staggered start times, bounded per-source concurrency, and a target runtime below the deployed function timeout. Heavy custom connectors run alone; fast ATS-family connectors may share a group.

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

Every connector requires fixtures and tests for pagination, reported totals, detail discovery, detail parsing, direct-apply resolution, malformed listings, timeouts, and completeness status.

### Classification tests

Golden fixtures include the verified Moody's Senior Financial Data Analyst and D. E. Shaw roles using `up to 2 years`, `1-2 years`, private-credit operations, compliance, pricing, and finance operations. Phrase-table tests cover numeric ranges, number words, Unicode dashes, months, optional experience, open-ended minimums, contradictory requirements, and missing fields.

### Persistence and lifecycle tests

Tests prove that all official observations are stored before classification, source provenance survives canonicalization, partial scans cannot deactivate jobs, closure requires two complete misses, portal observations cannot overwrite official data, and uncertain deduplication does not merge.

### OpenRouter tests

Network calls are mocked. Tests cover schema-valid results, malformed JSON, unsupported structured output, low-confidence evidence, timeout, quota exhaustion, fallback-model metadata, caching, and the invariant that every failure leaves the job visible as `possible`.

### End-to-end verification

Before each connector is declared supported:

1. local tests and syntax/type checks pass;
2. a live official scan reconciles listing and detail counts;
3. saved direct-apply links are reopened successfully;
4. the API returns source badges and verification metadata; and
5. the PWA shows one canonical card and a source-aware notification.

## Rollout

1. Migrate canonical jobs, source observations, diagnostics, and classification history without losing the deployed Moody's record.
2. Change ingestion so official observations are persisted before classification.
3. Replace the flat keyword regex with location, finance-taxonomy, and experience-parser modules.
4. Add canonicalization, source-aware API fields, badges, Sources details, and source-health states.
5. Add the OpenRouter ambiguity adapter with concrete model configuration, strict schema validation, caching, and failure-safe behaviour.
6. Build and live-verify D. E. Shaw and Citi connectors, including regression fixtures for the manually confirmed roles.
7. Add shared ATS-family connectors and then custom connectors for the approved employer list.
8. Add legitimate Naukri, iimjobs, Indeed, and LinkedIn sentinel inputs where technically and contractually available.
9. Add PWA push delivery, canonical notification deduplication, source upgrades, and coverage-gap alerts.

## Implementation Decomposition

This document is the program-level design. Implementation is divided into independently reviewable slices so career-page integrity is completed before portal or CV expansion:

1. **Career-page integrity and source provenance:** schema migration, persist-before-filter ingestion, classification rewrite, source-aware API and UI, staggered scan groups, coverage diagnostics, and live-verified D. E. Shaw and Citi connectors.
2. **Official employer expansion:** shared ATS-family adapters followed by custom adapters for the approved employer list, each gated by fixtures and live count reconciliation.
3. **Portal sentinels and reconciliation:** legitimate LinkedIn, Naukri, iimjobs, and Indeed inputs, canonical linking, portal-only labels, and coverage-gap handling.
4. **Push delivery:** VAPID delivery, one notification per canonical job, source-aware copy, update notifications, and delivery diagnostics.
5. **CV matching:** a separate privacy-reviewed specification using the shared OpenRouter client and a redacted normalized candidate profile.

After this specification is approved, the next implementation plan covers only slice 1. Later slices receive their own design or implementation review before code changes.

## Success Criteria

- One canonical job can expose multiple accurately labelled source links.
- The official direct-apply URL is primary whenever verified.
- Every fetched official India listing is persisted regardless of its classification.
- A bad keyword, model response, or quota failure cannot erase or hide an official listing.
- Complete connectors fetch every expected page and detail record or report a visible non-complete status.
- Unsupported, partial, failed, and anomalous sources never appear as legitimate zero-result scans.
- Existing jobs survive source failures and close only after two complete misses.
- D. E. Shaw and Citi live scans reconcile with manually verified official listings before support is declared.
- OpenRouter is called only for new or changed ambiguous jobs, and every result is reproducible from recorded model, prompt, taxonomy, and description versions.
- Notifications identify the discovery source and are deduplicated across portal and official observations.
