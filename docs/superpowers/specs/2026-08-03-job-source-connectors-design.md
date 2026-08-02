# Job Source Connectors Design

## Goal

Replace the generic career-homepage scanner with reliable employer connectors that discover official India finance vacancies, inspect each job's requirements, keep roles requiring 0-2 years of experience, and store the employer's direct application URL.

## Scope

The first implementation slice delivers Moody's end to end and introduces the connector contract used by the remaining 20 employers. It also records source-level scan diagnostics so an empty feed can distinguish "no matching jobs" from "connector failed".

Push delivery, CV matching, Gemini integration, and unofficial job portals are outside this slice. The existing 30-minute Supabase cron schedule remains unchanged.

## Approaches Considered

### 1. Continue parsing career landing pages

This is the smallest code change, but it cannot see vacancies loaded by JavaScript search applications. The existing scanner already demonstrates this failure by missing a current Moody's role.

### 2. Use web search as the primary source

Search engines can discover individual job pages, but indexing is delayed and incomplete. This conflicts with the requirement to detect jobs promptly and makes removals difficult to determine.

### 3. Use official employer search endpoints with per-source adapters

This is the selected approach. Each adapter queries the employer's public job-search surface, returns official detail URLs, parses normalized job records, and reports its own health. Adapters may share implementation when employers use the same ATS, but each source retains explicit configuration and tests.

## Architecture

The Edge Function will separate orchestration, filtering, persistence, and source-specific extraction:

- `types.ts` defines normalized jobs, connector results, and diagnostics.
- `filters.ts` determines India relevance, finance relevance, and explicit 0-2-year eligibility from complete job details.
- `connectors/moodys.ts` discovers Moody's result pages and parses individual official listings.
- `connectors/registry.ts` maps companies to connectors. Until a company has a verified connector, it is reported as `unsupported` rather than silently returning zero jobs.
- `scan.ts` executes connectors, persists matching jobs, and records per-source outcomes.
- `index.ts` remains the HTTP route layer.

The implementation will use platform APIs already available in Supabase Edge Functions and will not add a browser runtime or scraping service.

## Moody's Data Flow

1. Fetch the official Moody's India/search results surface.
2. Discover all official individual job URLs, following pagination when present.
3. Fetch each detail page with bounded concurrency.
4. Extract job reference, title, location, posting date, description, experience requirement, education requirement, and direct apply URL.
5. Normalize the job using the employer job reference as the stable identifier.
6. Retain the role only when the full detail text indicates India, finance relevance, and eligibility that includes 0-2 years.
7. Upsert the matching job and update its `last_seen_at` value.
8. Mark previously seen Moody's jobs inactive only after a successful complete Moody's scan.

## Filtering Rules

- Location must explicitly identify India or an Indian city in the normalized location field. Remote roles qualify only when India is explicitly included.
- Finance relevance is evaluated from title, category, and description. Credit analysis, ratings, risk, treasury, audit, accounting, valuation, markets, FP&A, investment, and related finance work qualify.
- Experience must explicitly include candidates with no more than two years, such as `0-2 years`, `0 to 2 years`, `up to 2 years`, `0-1 years`, or fresher/graduate wording without a higher minimum.
- A title containing `Senior` is not rejected by itself. The published experience requirement controls eligibility.
- Roles requiring a minimum above two years are excluded.
- If experience cannot be determined, the role is not included in the primary feed; diagnostics count it as `experience_unknown` for later review.

## Persistence and Lifecycle

Each job stores the official company, stable employer reference, source URL, detail/apply URL, title, location, description, first-seen timestamp, last-seen timestamp, and active state.

Job deactivation is source-scoped. A source's jobs are marked inactive only if that source completed successfully. A failed connector must never deactivate previously known jobs.

Each source scan records:

- status: `success`, `partial`, `failed`, or `unsupported`
- discovered job count
- fetched detail count
- matching job count
- excluded counts by reason
- concise error message without credentials or response bodies containing personal data
- scan start and finish timestamps

## HTTP Response

`POST /scan` returns aggregate totals plus source diagnostics. `GET /jobs` continues returning active matching jobs. No secret, scan token, service-role key, or private ATS value is returned.

## Error Handling

- One malformed listing is counted and skipped without failing unrelated listings.
- Pagination, HTTP, and parse failures produce a source-level `partial` or `failed` result.
- Timeouts and bounded concurrency prevent one source from exhausting the Edge Function runtime.
- Previously active jobs remain active after partial or failed scans.
- Unsupported connectors are visible and do not masquerade as successful zero-result scans.

## Testing

Tests use saved, minimal HTML/JSON fixtures derived from the observable structure of official pages, with no credentials or personal data.

Required behavior tests cover:

- discovering Moody's detail URLs from search results
- following result pagination
- parsing the Senior Financial Data Analyst fixture
- accepting a `Senior` title when the requirement is `0-2 years`
- excluding roles with a minimum above two years
- classifying unknown experience separately
- preserving existing jobs when a connector fails
- source-scoped deactivation after a successful scan
- returning source diagnostics in the scan response

Before deployment, the backend tests and type checks must pass, the function must deploy successfully, and a live scan must discover the current Moody's matching role or report an explicit source error explaining why it could not.

## Rollout

Phase 1 ships Moody's plus diagnostics. Phase 2 maps the remaining employers to shared ATS families or custom adapters, adding one verified connector at a time. A connector is considered supported only after a live official-source check and fixture-backed tests.

