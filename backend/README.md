# First Look backend — Supabase

The backend runs separately from GitHub Pages. Supabase hosts one Edge Function, one Postgres database, and a 30-minute `pg_cron` job. The frontend is deployed once and reads this API.

## Files

- `supabase/functions/first-look-api/index.ts` — health, jobs, subscription, and scan routes
- `supabase/migrations/001_initial.sql` — tables, indexes, RLS defaults, and cron setup notes

## Setup

1. Create a Supabase project.
2. Open PowerShell in this `backend` folder:

```powershell
cd C:\Users\swaro\Documents\Codex\2026-08-02\hiw\work\job-monitor\backend
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

## Current boundary

The scanner reads public `JobPosting` JSON-LD blocks and stores likely India/finance/early-career roles. Employer platforms that render jobs only in client-side JavaScript will need source-specific ATS adapters. Push subscriptions are stored, but VAPID delivery is the next isolated step.
