# Fix All Failing Backend Connectors

## Current implementation status (2026-08-05)

### Continuation update

- Added a live per-job open/closed check: a public `GET /job-status?id=` endpoint verifies a role's posting on the employer site server-side (404/410 or clear closed-posting wording → closed; readable page → open; blocked/short/redirected pages → unknown, never guessed). The Open roles cards now carry a "Check if open" action with a cached badge (30-minute TTL, local-only), and the top exact matches are auto-checked once per session.

- Enforced a strict 0-2 year experience feed at the serving layer: `/jobs` now filters `experience_status` at the database, re-runs the experience parser in memory, treats preferred-only ranges above 2 years (e.g. "3-8 years preferred") as over the limit, and hard-excludes senior titles (Assistant Manager, Senior Analyst, Manager, Team Lead, etc.) and safety/environmental roles. The response now carries a `snapshotAt` feed-freshness timestamp, and each job exposes `experienceYears` for the UI.
- The Open roles section now shows "feed updated X ago" from the snapshot timestamp so Refresh visibly pulls the latest published data, and per-role labels read "Verified X ago" with stale values clamped instead of showing absurd ages.
- Trimmed the CV match section copy to a crisp one-line intro, short field/privacy notes, and compact empty states.

- Added PDF resume upload using a vendored copy of Mozilla pdf.js (Apache-2.0, ~1.7 MB in `lib/pdfjs/`) so extraction is local, offline and privacy-safe; scanned/image-only PDFs show a clear fallback message instead of failing silently. Made the CV match section the first content section and moved the 60-company directory into a slide-in side drawer with live search; a fixed side rail on desktop and the topnav button on mobile open it.

- Added Groww and PhonePe as Greenhouse connector configurations and scheduled watch/reconcile scans. They are registered source candidates; the coverage API must still report a complete reconciliation before presenting either source as healthy.
- Added all 60 RCV employers to the website company directory with official career-page links and explicit pending-versus-registered source state.
- Tightened role relevance so generic compliance, product/payments, sales/business development, and customer-facing roles do not pass merely because the employer is a bank or fintech; regulated finance compliance and finance operations remain eligible.
- Added direct-role Apply handling in the frontend and a local review-first browser helper for repeatable public contact fields. The helper is explicit-click, active-tab scoped, and never submits or handles credentials.
- Audited `C:\Users\swaro\Downloads\rcv.pdf`; the remaining company queue and the evidence-first application-kit boundary are recorded in `docs/rcv-company-and-application-kit-audit.md`.
- Extended the local CV match workspace with reviewable, evidence-only cover-letter drafts saved per role. No profile data is sent to the backend and no application is submitted.
- Added a public Lever connector for Paytm and Workday CXS candidates for State Street, Northern Trust, Mastercard, Visa, FactSet and Bloomberg; removed those employers from the RCV Firecrawl fallback queue.
- Kept Firecrawl restricted to employers without a verified structured feed, with separate bounded fallback waves rather than making it the default source strategy.
- Added a quota guard migration that removes unattended Firecrawl cron jobs; fallback waves are invoked deliberately after reviewing quota.
- Added a documented portal-discovery strategy and a local explicit-click listing capture/import path for unsupported employers. Portal-only records remain unverified and cannot replace official direct Apply URLs.
- Replaced the prior raw CV keyword signal with a deterministic local evaluator: separate heuristic resume/ATS text readiness, role evidence match, finance-domain gating and hard-gap reporting. Cover-letter generation now checks the posting requirement first and drafts only from at least two exact profile evidence lines; it never claims to reproduce an employer ATS score or hiring decision.
- Reviewed Career-Ops and ai-job-search for fit-first, requirement-mapping and verification patterns, and AIHawk for workflow ideas only. The automated AIHawk submitter was not embedded; the local browser helper remains explicit-click and review-first.

The original proposal below is now superseded where it conflicts with the deployed implementation:

- Completed: Workday CXS v2 endpoint, corrected Morningstar/Fidelity/Shell/PayPal boards, maintenance-page detection, resilient TalentBrew parsing, and Firecrawl false-success/direct-Apply safeguards.
- Completed: source-specific official connectors for S&P Global Jibe, Deloitte South Asia SuccessFactors, and Siemens Avature. These no longer depend on generic Firecrawl or the invalid Siemens Workday board.
- Completed: finance-first classification. India roles must be finance-relevant and technical titles are hard-excluded before generic financial-services boilerplate is considered. Finance Analyst, Financial Data Analyst, Credit Analyst, Risk Analyst, and finance-context Operations Analyst remain eligible.
- Verified: 156 backend tests pass; the deployed function has live smoke coverage for S&P Global, Deloitte, and Siemens.
- Still requiring source-by-source validation: the remaining Workday boards whose tenants return 404/422/maintenance responses, plus generic Firecrawl sources that return no role links. They must remain anomalous/failed rather than being shown as healthy.

The registry now contains 110 connector identities (including 36 quota-free official-page discovery connectors and the new CRED Lever / EY GDS Yello feeds). Product health remains scan-history driven: a registered source is not presented as current until its inventory, detail hydration and Apply URL checks reconcile successfully. Structured ATS candidates are preferred; Firecrawl remains a fallback for the unresolved custom portals.

## Root Cause Analysis

### Issue 1: Workday API endpoint changed (16 companies)
The Workday connector uses the **old** undocumented endpoint:
```
POST ${baseUrl}/wday/cxs/client/customUI/v1.2/search
```
This endpoint now returns `405 Method Not Allowed`. The **new** endpoint is:
```
POST ${baseUrl}/wday/cxs/{tenant}/{siteName}/jobs
```

I verified this by testing: the new endpoint returns `200` with `{total, jobPostings}` — the exact same response schema the connector already parses. The fix is just changing the URL construction.

### Issue 2: Wrong site names (5 companies returning 404)
These companies have incorrect `baseUrl` values with wrong site names:

| Company | Current (404) | Correct (200) |
|---|---|---|
| Morningstar | `morningstar.wd5.../Morningstar_Careers` | `morningstar.wd5.../morningstar` |
| Fidelity | `fmr.wd1.../careers` | `fmr.wd1.../FidelityCareers` |
| Shell | `shell.wd3.../Shell` | `shell.wd3.../ShellCareers` |
| PayPal | `paypal.wd1.../PayPal` | `paypal.wd1.../jobs` |
| Siemens | `siemens.wd3.../External_Careers` | Needs migration to Firecrawl (no Workday site found) |

### Issue 3: Workday maintenance window (transient)
Several Workday instances (`wd1`, `wd3`, `wd5`) are currently returning `500` with a maintenance redirect page. This is **transient** — the connector should handle it gracefully by detecting the HTML maintenance page and reporting a clear error instead of crashing.

> [!IMPORTANT]
> The PwC `wd3` site (`Global_Careers`) also returns 404. I could not find a working alternative. PwC may have migrated away from Workday or changed their tenant. I recommend **moving PwC to Firecrawl** instead.

### Issue 4: Barclays TalentBrew hydration failure
The `parseTalentBrewDetail` function throws `Missing required Barclays job fields` when it can't find the expected CSS classes (`section4__job-title`, `job-details--title`) in the detail page HTML. The site may have updated their class names. The fix is to make the hydration more resilient — allow partial extraction and skip jobs that can't be parsed rather than crashing the entire connector.

## Proposed Changes

### Workday Connector
#### [MODIFY] [workday.ts](file:///c:/Users/swaro/Desktop/first-look-job-monitor/backend/supabase/functions/first-look-api/connectors/workday.ts)

1. **Add `tenant` field to `WorkdayConfig`** — needed to construct the new API URL
2. **Update API URL** from `/wday/cxs/client/customUI/v1.2/search` to `/wday/cxs/{tenant}/{siteName}/jobs`
3. **Fix site names** for Morningstar, Fidelity, Shell, PayPal
4. **Add maintenance page detection** — check if response body contains "maintenance-page" and throw a descriptive error instead of trying to parse HTML as JSON
5. **Remove Siemens and PwC** from Workday (move to Firecrawl below)

---

### Connector Registry
#### [MODIFY] [registry.ts](file:///c:/Users/swaro/Desktop/first-look-job-monitor/backend/supabase/functions/first-look-api/connectors/registry.ts)

1. Add PwC and Siemens Firecrawl configs to the registry
2. Remove them from the Workday connector list

---

### Firecrawl Connector
#### [MODIFY] [firecrawl.ts](file:///c:/Users/swaro/Desktop/first-look-job-monitor/backend/supabase/functions/first-look-api/connectors/firecrawl.ts)

1. Add `PWC_FIRECRAWL_CONFIG` and `SIEMENS_FIRECRAWL_CONFIG` with their career page URLs
2. No structural changes needed — the Firecrawl connector already handles generic career page scraping

---

### TalentBrew Connector
#### [MODIFY] [talentbrew.ts](file:///c:/Users/swaro/Desktop/first-look-job-monitor/backend/supabase/functions/first-look-api/connectors/talentbrew.ts)

1. Make `parseTalentBrewDetail` more resilient: instead of throwing when fields are missing, return what we can and skip the job if critical fields (title) are truly empty
2. Add fallback CSS class patterns for the detail page extraction

## Open Questions

> [!IMPORTANT]
> **Siemens scope**: Siemens has split into Siemens AG, Siemens Energy, Siemens Healthineers, etc. Which entity (or all?) should we track? Currently only `siemens.wd3` is configured but that tenant doesn't exist. Healthineers is at `siemens-healthineers.wd3.myworkdayjobs.com/Careers`.

> [!NOTE]
> **Workday maintenance**: Many Workday instances are on maintenance right now (returning 500). The URL fix will make them work once maintenance ends. The maintenance detection fix ensures the error message is clear in the meantime.

## Verification Plan

### Automated Tests
```bash
cd backend && npm test
```

### Manual Verification
1. Deploy the edge function: `npx supabase functions deploy first-look-api`
2. Trigger a scan for a fixed connector (e.g., Morningstar): `POST /scan?group=morningstar-watch`
3. Check the coverage endpoint shows `complete` for the fixed connectors
4. Refresh the frontend and verify new company listings appear
