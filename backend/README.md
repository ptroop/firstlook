# First Look backend — Supabase

The backend runs separately from GitHub Pages. Supabase hosts one Edge Function, one Postgres database, and a 30-minute `pg_cron` job. The frontend is deployed once and reads this API.

## Files

- `supabase/functions/first-look-api/index.ts` — health, jobs, subscription, and scan routes
- `supabase/migrations/001_initial.sql` — tables, indexes, RLS defaults, and cron setup notes

## Setup

1. Create a Supabase project.
2. Open PowerShell in this `backend` folder:

```powershell
cd C:\Users\swaro\Desktop\first-look-job-monitor\backend
npm.cmd install
```

The Supabase CLI requires Node.js 20 or later when installed through npm.

3. Log in and connect this folder to your project. Find the project reference in the project URL or in Dashboard > Settings > General.

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

4. Apply `supabase/migrations/001_initial.sql` in Supabase Dashboard > SQL Editor > New query > Run.

5. Deploy the function:

```powershell
npx supabase functions deploy first-look-api --no-verify-jwt
```

5. Set these Edge Function secrets:

```powershell
supabase secrets set ALLOWED_ORIGIN=https://YOUR-USERNAME.github.io
supabase secrets set SCAN_TOKEN=generate-a-long-random-value
```

The function also uses the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never put the service-role key or Gemini key in `index.html`.

6. Configure `window.JOB_MONITOR_API` in the frontend to:

```text
https://YOUR-PROJECT.supabase.co/functions/v1/first-look-api
```

7. Create a Vault secret for the function URL and schedule the scan using the SQL in the migration file. The cron job calls `/scan` every 30 minutes; it does not redeploy GitHub Pages.

## Connector operations

The Moody's connector is the first verified source adapter. It follows every official India search-results page, opens each official detail page, applies the finance and explicit 0-2-years filters, and stores the direct SuccessFactors Apply URL.

The other 20 target employers currently report `unsupported` in scan diagnostics. They are not reported as successful zero-result scans. Add and live-verify one source adapter at a time through `connectors/registry.ts`.

Run the backend tests from this folder:

```powershell
npm.cmd test
```

Apply new migrations and deploy the function with:

```powershell
npx.cmd supabase db push --linked
npx.cmd supabase functions deploy first-look-api --project-ref xbckwzodpwfpvvkujbgp --no-verify-jwt
```

The 30-minute cron request uses a 60-second HTTP timeout. This is required because a complete connector scan can exceed `pg_net`'s 5-second default.

Jobs are deactivated only within a source after that source completes successfully. Partial, failed, and unsupported connectors preserve existing jobs. Push subscriptions are stored, but VAPID delivery remains a separate feature.
