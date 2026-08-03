# First Look backend

Supabase hosts the database, source scanner, and read API. GitHub Pages hosts only the static PWA, so a scan does not rebuild or redeploy the website.

## What is live in this codebase

| Connector | Inventory strategy | Detail strategy | Schedule |
| --- | --- | --- | --- |
| Moody's official India careers | Reconcile every result page | Hydrate high-recall candidates in bounded batches | Every 30 minutes |
| D. E. Shaw India careers | Reconcile the complete India catalog | Hydrate high-recall candidates in bounded batches | Every 30 minutes |
| Citi official India careers | Lightweight watch plus complete pagination audit | Hydrate oldest unchecked candidates first | Watch every 30 minutes; reconcile every 2 hours |
| Goldman Sachs official India careers | Reconcile the complete public India GraphQL inventory | Hydrate high-recall candidates in bounded batches | Every 30 minutes |

The source inventory is deliberately broader than the visible job feed. Deterministic rules select likely India finance roles, and only ambiguous candidates may be sent to OpenRouter. A failed model call leaves the role visible as `possible`; it never silently deletes it.

The other employers in the frontend directory are not yet claimed as monitored. Each needs a verified connector for its actual ATS or official search API.

The implementation order and completeness contract are in [`../docs/official-coverage-rollout.md`](../docs/official-coverage-rollout.md). `unsupported` is not exposed as a product state; Source health contains verified connectors only.

## Automatic production deployment

After this project is pushed to GitHub, add two repository Actions secrets once:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Deploys migrations and Edge Functions |
| `SUPABASE_DB_PASSWORD` | Connects the CLI to the production database non-interactively |

Every backend change merged to `main` then runs tests, applies pending migrations, deploys `first-look-api`, and verifies the public routes through [`.github/workflows/deploy-supabase.yml`](../.github/workflows/deploy-supabase.yml). Routine releases do not require a local Supabase login or dashboard work.

[`monitor-production.yml`](../.github/workflows/monitor-production.yml) independently checks production every two hours. It opens one deduplicated GitHub issue when a source is stale, incomplete, missing Apply URLs, or unavailable, and closes the issue after recovery. This monitor uses no Codex or model quota.

## One-time Supabase setup

Use Node.js 20 or later. From this `backend` directory:

```powershell
npm.cmd install
npx.cmd supabase login
npx.cmd supabase link --project-ref xbckwzodpwfpvvkujbgp
```

Apply every migration in numeric order. For an already-linked project:

```powershell
npx.cmd supabase db push --linked
```

Or paste the contents of each new `.sql` migration into Supabase Dashboard > SQL Editor > New query. A successful schema migration normally reports `Success. No rows returned`; DDL creates database objects rather than result rows.

Deploy the function only after tests pass:

```powershell
npm.cmd test
npx.cmd supabase functions deploy first-look-api --project-ref xbckwzodpwfpvvkujbgp --no-verify-jwt
```

## Edge Function secrets

Open Supabase Dashboard > Edge Functions > Secrets and add:

| Secret | Purpose |
| --- | --- |
| `ALLOWED_ORIGIN` | Exact GitHub Pages origin, such as `https://USERNAME.github.io` |
| `SCAN_TOKEN` | Long random token accepted only by the protected `/scan` route |
| `OPENROUTER_API_KEY` | OpenRouter key used server-side for ambiguous classifications |
| `OPENROUTER_MODEL` | A concrete OpenRouter model slug that supports structured output |
| `OPENROUTER_FALLBACK_MODELS` | Optional comma-separated concrete fallback slugs |
| `OPENROUTER_PROMPT_VERSION` | Optional cache/version label; default is `job-classification-v1` |
| `DETAIL_BATCH_SIZE` | Optional per-connector hydration cap; default is `25` |

Do not paste the OpenRouter key into chat, SQL, GitHub, `index.html`, or `config.toml`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function.

## Vault and schedules

The cron helper reads two separate Vault secrets. Create them in SQL Editor, replacing values only in your private query:

```sql
select vault.create_secret(
  'https://YOUR-PROJECT.supabase.co/functions/v1/first-look-api/scan',
  'first_look_scan_url'
);

select vault.create_secret('YOUR-LONG-RANDOM-SCAN-TOKEN', 'first_look_scan_token');
```

The Vault token must exactly match the `SCAN_TOKEN` Edge Function secret. Then apply `007_source_scan_schedules.sql` and `010_goldman_scan_schedule.sql`. These remove the old monolithic cron and create staggered jobs for the four verified connectors. Each invocation also drains a bounded portion of the candidate-detail backlog, with never-hydrated and oldest-hydrated inventory first.

Migration `009_scan_watchdog.sql` adds a ten-minute self-healing check. It retries 30-minute groups only after 50 minutes without a new run, and retries Citi reconciliation only after 150 minutes. An advisory transaction lock prevents overlapping watchdog executions.

Confirm the schedules:

```sql
select jobname, schedule, active
from cron.job
where jobname like 'first-look-%'
order by jobname;
```

## Operational checks

Recent source health:

```sql
select
  connector_id,
  run_type,
  status,
  hydration_status,
  reported_total,
  pages_fetched,
  listings_discovered,
  details_backlogged,
  finished_at,
  error_summary
from public.source_scan_runs
order by started_at desc
limit 30;
```

Hydration backlog:

```sql
select connector_id, candidate_status, count(*)
from public.source_inventory
where active
group by connector_id, candidate_status
order by connector_id, candidate_status;
```

Treat `partial`, `failed`, and `anomalous` runs as coverage failures, not zero-job results. Complete reconciliation uses two consecutive complete misses before closing inventory, sources, or jobs. This prevents a transient ATS failure from erasing live roles.

The public routes are `/health`, `/jobs`, and `/coverage`. `/scan` requires the bearer token. Browser push delivery, portal connectors, and CV generation are separate future slices; this release does not pretend they are active.
