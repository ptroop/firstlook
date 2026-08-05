# Fix All Failing Backend Connectors

## Current implementation status (2026-08-05)

The original proposal below is now superseded where it conflicts with the deployed implementation:

- Completed: Workday CXS v2 endpoint, corrected Morningstar/Fidelity/Shell/PayPal boards, maintenance-page detection, resilient TalentBrew parsing, and Firecrawl false-success/direct-Apply safeguards.
- Completed: source-specific official connectors for S&P Global Jibe, Deloitte South Asia SuccessFactors, and Siemens Avature. These no longer depend on generic Firecrawl or the invalid Siemens Workday board.
- Completed: finance-first classification. India roles must be finance-relevant and technical titles are hard-excluded before generic financial-services boilerplate is considered. Finance Analyst, Financial Data Analyst, Credit Analyst, Risk Analyst, and finance-context Operations Analyst remain eligible.
- Verified: 144 backend tests pass; the deployed function has live smoke coverage for S&P Global, Deloitte, and Siemens.
- Still requiring source-by-source validation: the remaining Workday boards whose tenants return 404/422/maintenance responses, plus generic Firecrawl sources that return no role links. They must remain anomalous/failed rather than being shown as healthy.

The app currently shows jobs for only ~5 companies (Moody's, Goldman, D.E. Shaw, Citi, BlackRock). The remaining ~27 companies are failing due to three root causes.

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
