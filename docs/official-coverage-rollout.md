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

Wave order balances reusable adapters, completeness, and employer value. Within Wave 1, build the shared KPMG/American Express adapter first, then Goldman Sachs and JPMorgan, followed by the remaining paginated portals.

## Matching policy for 0-2 year MBA finance roles

Summary keywords prioritize hydration; they never decide final exclusion. Positive families include accounting, audit, assurance, banking, capital markets, compliance, controllership, credit, deals, FP&A, finance operations, fund operations, investment research, portfolio, pricing, reconciliation, reporting, risk, tax, treasury, valuation, and wealth management.

The detail classifier keeps roles visible when experience is absent or ambiguous. It excludes only when the description explicitly establishes a non-India location, unrelated work, or a minimum above two years. Senior titles are not excluded because some employers use them for roles requiring 0-2 years.

## Secondary portals

LinkedIn, Naukri, IIMJobs, and Indeed are supplementary discovery signals, never proof that official coverage is complete. Each record preserves its exact source type and portal URL. Canonical jobs prefer a verified official detail/apply URL. Portal-only records remain visibly unverified until matched by employer job ID or canonical official URL.

Authenticated-page scraping is excluded. Where a portal has no suitable public API, user-owned alert-email ingestion or explicitly shared links are safer than automating a logged-in session.

## Operations

- Every merge to `main` tests the backend, applies migrations, deploys the Edge Function, and verifies `/health`, `/coverage`, and `/jobs`.
- A ten-minute database watchdog retries scan groups whose latest start is beyond the expected schedule window; it uses no AI service.
- GitHub receives `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` once. Routine releases need no dashboard or local CLI work.
- Fixtures preserve catalog and detail markup. Count, stable ID, location, description, and Apply URL tests are mandatory.
- Stale scans, count mismatches, apply-link failures, and growing backlogs are incidents, not zero-result scans.
- A weekly live audit compares advertised totals with stored active inventory and records markup fingerprints to reveal ATS changes.

## Phone notifications

New or materially changed matching jobs enter a notification outbox in the same transaction that saves the canonical job. A push worker sends one deduplicated Web Push message per job and subscription. Notification failure never rolls back the saved vacancy. This is the remaining backend slice needed for installed-PWA phone alerts.
