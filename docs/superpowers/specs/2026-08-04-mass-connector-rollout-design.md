# Mass ATS Connector Rollout Design

## Objective
To achieve 100% data coverage of the remaining 23 unsupported companies in `UNSUPPORTED_COMPANIES` without relying on brittle HTML scrapers (like Apify/Firecrawl).

## Core Strategy
We will build native, generic API-driven connectors that interface directly with the undocumented JSON/REST/GraphQL APIs of the major Applicant Tracking Systems (ATS) powering these companies. 

This approach guarantees we never miss a listing due to DOM changes or bot-blocking infrastructure.

## Component Breakdown

The rollout will be separated into focused generic connector factories, each targeting a specific ATS platform.

### 1. The Workday Connector
**Targets:** Accenture, PwC, Wells Fargo, Deutsche Bank, Bank of America, NatWest, Fidelity, GE HealthCare, Diageo, S&P Global, Morningstar.
**Mechanism:** 
- Enumerate via `/wday/cxs/...` JSON endpoints.
- Paginate dynamically until all results are exhausted.
- Hydrate using the specific job detail endpoint to fetch metadata.

### 2. The Avature & Eightfold Connectors
**Targets:** Deloitte, Siemens, HSBC (Avature), JPMorgan Chase (Eightfold).
**Mechanism:**
- Eightfold uses clear GraphQL APIs or REST endpoints for listing and fetching.
- Avature uses structured JSON endpoints for job searches.

### 3. The Taleo & SuccessFactors Connectors
**Targets:** Morgan Stanley (Taleo), Shell (SuccessFactors).
**Mechanism:**
- Taleo uses legacy but stable REST endpoints.
- SuccessFactors exposes an OData-based API.

### 4. Custom/Isolated Connectors
**Targets:** Amazon, Microsoft, PayPal, Piramal Finance, Pine Labs, ICRA.
**Mechanism:**
- These companies often have custom or heavily modified in-house platforms (e.g. Amazon Jobs API).
- We will build direct API integrations for them individually if they do not fit the major ATS factories above.

## Data Flow & Integration
1. Each factory will return instances matching the `OfficialJobConnector` interface.
2. The connectors will be registered in `registry.ts` and their respective companies removed from `UNSUPPORTED_COMPANIES`.
3. Database migrations will be added to `supabase/migrations/` to register staggered cron schedules (`watch` and `reconcile`) for each new connector identity.

## Testing & Verification
- Unit tests for each factory simulating paginated JSON API responses.
- Local manual test runs (`npm test` and `ts-node script.ts`) to ensure real-world API connectivity before deployment.
