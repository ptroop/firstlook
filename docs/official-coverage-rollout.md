# Official career coverage rollout

## Product rule

`unsupported` is not a user-facing source state. Source health shows a company only after its official connector passes fixture tests, live count reconciliation, detail hydration, and direct-apply verification. The employer directory can still link to every official career page while connector work is in progress.

## Connector contract

Every official connector must:

1. Enumerate every India result summary and stable employer job ID.
2. Reconcile parsed rows against the advertised total, page count, or independently counted cards.
3. Save lightweight inventory without reopening every detail on every scan.
4. Hydrate every new or changed likely candidate immediately.
5. Hydrate generic Analyst, Associate, Graduate, Trainee, Apprentice, and unclear summaries rather than guessing from title alone.
6. Store the role-specific official Apply URL.
7. Treat incomplete scans as coverage failures and retain prior listings.
8. Close a listing only after two complete reconciliations no longer contain its stable ID.

The first scan of a new connector may create a detail backlog. Later 30-minute runs drain never-checked and changed inventory first. A daily bounded audit samples deferred listings so taxonomy mistakes become visible.

## Target source map

| Wave | Employer | Official search surface | Connector approach |
| --- | --- | --- | --- |
| Live | Moody's | `careers.moodys.com` | Complete pagination, official detail, and SuccessFactors apply URL |
| Live | D. E. Shaw | `deshawindia.com/careers/work-with-us` | Complete HTML catalog, role detail, and direct recruit URL |
| Live | Citi | `jobs.citi.com/location/india-jobs` | Bounded watch plus full pagination audit and Workday apply URL |
| Live | BlackRock | `careers.blackrock.com/location/india-jobs` | Paginated official inventory, India filtering, and direct Workday apply resolution |
| Live | Barclays | `search.jobs.barclays/location/india-jobs` | Paginated official inventory, total/page reconciliation, and direct Workday apply resolution |
| Live | Razorpay | `job-boards.greenhouse.io/razorpaysoftwareprivatelimited` | Public Greenhouse inventory, stable requisition IDs, and role-level official Apply page |
| ATS candidate | Groww, PhonePe | Public Greenhouse boards | Structured Greenhouse inventory/detail candidates; health remains scan-gated |
| ATS candidate | Paytm | `api.lever.co/v0/postings/paytm` | Public Lever inventory/detail feed and role-level hosted Apply URL |
| ATS candidate | State Street, Northern Trust, Mastercard, Visa, FactSet, Bloomberg | Public Workday CXS job feeds | Structured Workday inventory/detail candidates; health remains scan-gated |
| 1 | KPMG India | `ejgk.fa.em2.oraclecloud.com/.../CX_1/jobs` | Reusable Oracle Recruiting Cloud adapter |
| 1 | American Express | `careers.americanexpress.com/.../CX_1/jobs` | Same Oracle adapter with employer-specific facets |
| 1 | Deloitte India | `southasiacareers.deloitte.com` | Paginated catalog with advertised-total proof |
| 1 | Wells Fargo | `wellsfargojobs.com/en/jobs/?country=India` | Paginated official inventory and detail hydration |
| 1 | NatWest | `jobs.natwestgroup.com/search/.../country/india` | Paginated inventory with stable requisition IDs |
| 1 | Goldman Sachs | `goldmansachs.com/careers/apply` | Discover professional and student endpoints separately, then merge by requisition ID |
| 1 | JPMorgan Chase | `careers.jpmorgan.com` | Verify the public search endpoint and keep jobs/programmes as distinct paths |
| 2 | HSBC | `portal.careers.hsbc.com/careers?location=India` | Official India-facet inventory and direct apply resolution |
| 2 | Accenture | `accenture.com/in-en/careers/jobsearch` | Official India search and detail hydration |
| 2 | Bank of America | `careers.bankofamerica.com/en-us/job-search/india` | India inventory and requisition detail hydration |
| 2 | PayPal | `careers.pypl.com/locations/india` | Verify the current results endpoint and hydrate stable IDs |
| 3 | PwC India | `pwc.in/careers` | Follow Find Jobs and verify every India business portal |
| 3 | Deutsche Bank | `careers.db.com/professionals/search-roles` | Separate professional vacancies from campus-only pathways |
| 3 | Morgan Stanley | `morganstanley.com/careers/career-opportunities-search` | Guided-search endpoint plus student/graduate stream |
| 3 | Piramal Finance | `piramalfinance.com/careers` | Discover the ATS feed and monitor the official page until verified |
| 3 | Fidelity Investments India | `jobs.fidelity.com/in` | India inventory; keep Fidelity International separate |
| Pending | Amazon | `amazon.jobs/en/search` | Public India search with finance/category filters and role-level job pages |
| Pending | Microsoft | `jobs.careers.microsoft.com` | Verify the current public search API and India location facets |
| Pending | Shell | `shell.com/careers/search-and-apply` | Discover the public search service and direct vacancy pages |
| Pending | Siemens | `jobs.siemens.com` | Verify the public Siemens search endpoint and requisition pages |
| Pending | GE HealthCare | `jobs.gehealthcare.com` | Verify the current public job board and India facet |
| Pending | Diageo | `diageo.com/en/careers` | Follow the official job search and verify the role API |
| Pending | Pine Labs | `pinelabs.com/careers` | Discover the public job feed and direct application destination |
| Pending | S&P Global | `careers.spglobal.com/jobs` | Verify the public Jibe search endpoint and India roles |
| Pending | Morningstar | `morningstar.com/company/careers` | Verify the public global/India job search surface |
| Pending | ICRA | `icra.in/careers` | Confirm whether live vacancies are exposed on an official public endpoint |

The remaining RCV employers are represented as explicit source candidates through a quota-gated Firecrawl fallback queue. Firecrawl is not scheduled unattended; use it only after checking the available quota and validating the resulting role-level detail and Apply URLs.

Wave order balances reusable adapters, completeness, and employer value. Within Wave 1, build the shared KPMG/American Express adapter first, then Goldman Sachs and JPMorgan, followed by the remaining paginated portals.

## Matching policy for 0-2 year MBA finance roles

Summary keywords prioritize hydration; they never decide final exclusion. Positive families include accounting, audit, assurance, banking, capital markets, compliance, controllership, credit, deals, FP&A, finance operations, fund operations, investment research, portfolio, pricing, reconciliation, reporting, risk, tax, treasury, valuation, and wealth management.

The public feed is a **strict 0-2 year band**: only roles whose wording confirms experience of 0, 1 or 2 years (or the month equivalent, e.g. up to 24 months). Open-ended floors at or below two years (`at least 1`, `1+`, `at least 2`, `2+`) and explicit no-experience wording (`no experience required`, `freshers`, `0 years`) count as confirmed 0-2 because a 0-2 year candidate satisfies them. Floors above two years (`at least 3`, `3+`), blank/ambiguous experience text, preferred ranges above two years, mid-level phrasing, and senior titles are excluded at classification and re-checked on `/jobs` (which re-parses every candidate row, including rows stored `ambiguous`, so a classifier upgrade surfaces stored roles without a rescan). Fresher / entry-level / campus-hire wording with no higher band still qualifies. The serving gate also drops clear non-analyst bands (team leads, managers, deputy managers, senior specialists/consultants/accountants) and noise families (tele-callers, collections, field/CCM roles, content/video, IT architects, SAP/ABAP/ITSM/ServiceNow/Oracle consultants, QA/testing) while keeping verified titles such as Moody's Senior Financial Data Analyst; the gate lives in `classification/taxonomy.ts` and `classification/experience.ts` and is replayed by the weekly audit.

## Secondary portals

LinkedIn, Naukri, IIMJobs, and Indeed are supplementary discovery signals, never proof that official coverage is complete. Each record preserves its exact source type and portal URL. Canonical jobs prefer a verified official detail/apply URL. Portal-only records remain visibly unverified until matched by employer job ID or canonical official URL.

Authenticated-page scraping is excluded. The local browser helper supports an explicit one-listing capture and local JSON import for unsupported employers; it does not crawl a portal, read credentials/cookies, or turn a portal Apply link into an official Apply URL. Where a portal has no suitable public API, user-owned alert-email ingestion or explicitly shared links remain safer than automating a logged-in session. See `docs/portal-discovery-strategy.md` for the source matrix and precedence rules.

## Operations

- Every merge to `main` tests the backend, applies migrations, deploys the Edge Function, and verifies `/health`, `/coverage`, and `/jobs`.
- A ten-minute database watchdog retries scan groups whose latest start is beyond the expected schedule window; it uses no AI service.
- GitHub receives `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` once. Routine releases need no dashboard or local CLI work.
- Fixtures preserve catalog and detail markup. Count, stable ID, location, description, and Apply URL tests are mandatory.
- Stale scans, count mismatches, apply-link failures, and growing backlogs are incidents, not zero-result scans.
- A weekly live audit compares advertised totals with stored active inventory and records markup fingerprints to reveal ATS changes.

## Phone notifications

New exact-match matching jobs enter a notification outbox in the same transaction that saves the canonical job (migration `20260806000003_push_notification_outbox.sql`); changed descriptions of already-saved jobs are not re-notified. A push worker (`/push/send`) sends one deduplicated Web Push message per job and subscription using a dependency-free module (VAPID ES256 JWT with the raw R‖S signature form required by JWS, plus RFC 8291 aes128gcm encryption with RFC 8188 record padding, on Web Crypto, in `first-look-api/push/web-push.ts`), prunes subscriptions that return 404/410, bounds retries to five attempts, and never rolls back the saved vacancy on send failure. The frontend requests permission and posts the subscription to `/push/subscribe`, and the VAPID public key is published in `index.html`. The remaining go-live steps are operational only: add the `VAPID_SUBJECT`/`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`PUSH_TOKEN` Edge Function secrets (generate with `backend/scripts/generate-vapid-keys.mjs`), insert the `first_look_push_url`/`first_look_push_token` rows into the RLS-locked `public.first_look_secrets` table (the push worker intentionally does not depend on the Vault extension, which is not available on every plan), and deploy so the two-minute cron begins draining the outbox.
