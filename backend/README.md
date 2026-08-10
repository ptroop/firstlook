# First Look backend

Supabase hosts the database, source scanner, and read API. GitHub Pages hosts only the static PWA, so a scan does not rebuild or redeploy the website.

## What is live in this codebase

| Connector | Inventory strategy | Detail strategy | Schedule |
| --- | --- | --- | --- |
| Moody's official India careers | Reconcile every result page | Hydrate high-recall candidates in bounded batches | Every 30 minutes |
| D. E. Shaw India careers | Reconcile the complete India catalog | Hydrate high-recall candidates in bounded batches | Every 30 minutes |
| Citi official India careers | Lightweight watch plus complete pagination audit | Hydrate oldest unchecked candidates first | Watch every 30 minutes; reconcile every 2 hours |
| Goldman Sachs official India careers | Reconcile the complete public India GraphQL inventory | Hydrate high-recall candidates in bounded batches | Every 30 minutes |
| BlackRock official India careers | Reconcile the public paginated India catalog | Hydrate high-recall candidates in bounded batches | Watch every 30 minutes; reconcile every 2 hours |
| Barclays official India careers | Reconcile the public paginated India catalog | Hydrate high-recall candidates in bounded batches | Watch every 30 minutes; reconcile every 2 hours |
| Razorpay official Greenhouse board | Reconcile the public Greenhouse India catalog | Hydrate high-recall candidates in bounded batches | Watch every 30 minutes; reconcile every 2 hours |
| Groww official Greenhouse board | Reconcile the public Greenhouse India catalog | Hydrate high-recall candidates in bounded batches | Watch every 30 minutes; reconcile every 2 hours |
| PhonePe official Greenhouse board | Reconcile the public Greenhouse India catalog | Hydrate high-recall candidates in bounded batches | Watch every 30 minutes; reconcile every 2 hours |
| Paytm official Lever postings feed | Reconcile the public India postings JSON feed | Hydrate by stable Lever posting ID | Watch every 2 hours; reconcile every 6 hours |
| State Street, Northern Trust, Mastercard, Visa, FactSet and Bloomberg official Workday feeds | Reconcile public Workday CXS India catalogs | Hydrate by stable Workday external path | Watch every 2 hours; reconcile every 6 hours |

The source inventory is deliberately broader than the visible job feed. Deterministic rules select likely India finance roles, and only ambiguous candidates may be sent to OpenRouter. A failed model call leaves the role visible as `possible`; it never silently deletes it.

Official observations must expose a role-specific Apply URL before they are counted as resolved. The frontend labels a missing direct Apply URL as pending and does not turn a generic employer career page into an Apply button.

The frontend directory contains the 60 normalized employer entries from the RCV registry table. The planning PDF describes the overall target as roughly 70 company/portal targets because some brands split into separate hiring entities or portals. Every directory entry is now assigned either a verified structured connector or the quota-free official-page fallback; a directory link alone is never treated as live coverage. Live source health still requires inventory enumeration, India/finance/0-2 filtering, detail hydration, and a role-level direct Apply URL. Firecrawl remains an opt-in fallback and is not unattended.

The implementation order and completeness contract are in [`../docs/official-coverage-rollout.md`](../docs/official-coverage-rollout.md). `unsupported` is not exposed as a product state; Source health contains verified connectors only.

## Contact lookup and verification

The `email-verify` Edge Function is the free, keyless, in-house verifier (format, role-account, disposable-domain and MX checks via DNS-over-HTTPS, no SMTP). The `contact-lookup` Edge Function is the optional Hunter finder behind Supabase Auth (`verify_jwt = true`; see `docs/email-verification-and-corpus.md` and `docs/hunter-contact-lookup.md`). It never does Domain Search, never infers addresses from patterns, and is rate-limited per user. Set `HUNTER_API_KEY` as an Edge Function secret only if the optional finder is wanted; the frontend needs the public `SUPABASE_URL` and `SUPABASE_ANON_KEY` and an allowlisted redirect origin.

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
| `VAPID_SUBJECT` | Contact for the push service, e.g. `mailto:you@example.com` or an `https:` URL |
| `VAPID_PUBLIC_KEY` | Base64url P-256 public key; also published in the frontend `index.html` |
| `VAPID_PRIVATE_KEY` | Base64url P-256 private key. Never commit or paste into chat |
| `PUSH_TOKEN` | Long random token; must equal the Vault `first_look_push_token` secret below |
| `RESUME_INBOX_TOKEN` | Long random token required to list and download private resume copies |

Generate a matching VAPID keypair once with `npx.cmd tsx scripts/generate-vapid-keys.mjs` (writes a gitignored `.env.vapid.local` with `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a fresh `PUSH_TOKEN`, and verifies the pair against the real Web Push module). Edit `VAPID_SUBJECT` in the generated file to a real `mailto:` or `https:` contact before pasting the values into Supabase — the subject is a JWT claim only and can be changed later without regenerating the keys. The generator refuses to overwrite an existing `.env.vapid.local` (pass `--force` only when rotating), because the public key may already be published in `index.html`. The public key is not secret and goes into `window.JOB_MONITOR_VAPID_PUBLIC_KEY` in `index.html`; the private key and `PUSH_TOKEN` stay in Supabase only.

Do not paste the OpenRouter key into chat, SQL, GitHub, `index.html`, or `config.toml`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the deployed function.

The `20260808000000_add_private_resume_intake.sql` migration creates a private `resume-intake` bucket capped at 10 MB. The browser uploads only through the Edge Function with a user access token; the service role key stays in Supabase. Set `RESUME_INBOX_TOKEN` to a long random value and keep it in a password manager. The inbox token is entered per browser tab, is not saved in localStorage, and never produces a public or signed download URL.

## Vault and schedules

The cron helper reads two separate Vault secrets. Create them in SQL Editor, replacing values only in your private query:

```sql
select vault.create_secret(
  'https://YOUR-PROJECT.supabase.co/functions/v1/first-look-api/scan',
  'first_look_scan_url'
);

select vault.create_secret('YOUR-LONG-RANDOM-SCAN-TOKEN', 'first_look_scan_token');
```

The Vault token must exactly match the `SCAN_TOKEN` Edge Function secret. Then apply `007_source_scan_schedules.sql`, `010_goldman_scan_schedule.sql`, `20260803171004_add_blackrock_barclays_schedules.sql`, `20260803180128_add_razorpay_schedule.sql`, `20260805000000_add_greenhouse_phase2_schedules.sql`, `20260806000000_add_rcv_firecrawl_waves.sql`, `20260806000001_add_rcv_ats_schedules.sql`, and `20260806000002_disable_firecrawl_cron_by_default.sql`. These create staggered jobs for structured ATS connectors and remove unattended Firecrawl polling. Each invocation also drains a bounded portion of the candidate-detail backlog, with never-hydrated and oldest-hydrated inventory first.

Migration `20260806000003_push_notification_outbox.sql` creates the notification outbox, an RLS-locked credentials table (`public.first_look_secrets`), and a two-minute cron (`first-look-push-worker`) that drains it. The worker credentials are plain inserts — the Vault extension is not available on every Supabase plan, so the cron helper reads them from this locked table instead:

```sql
insert into public.first_look_secrets(name, secret_value) values
  ('first_look_push_url', 'https://YOUR-PROJECT.supabase.co/functions/v1/first-look-api/push/send'),
  ('first_look_push_token', 'YOUR-PUSH-TOKEN')
on conflict (name) do update
  set secret_value = excluded.secret_value, updated_at = now();
```

RLS is enabled on `first_look_secrets` with zero policies, so anonymous and authenticated PostgREST roles can never read or write it; only the cron helper (security definer, owner `postgres`) can. `first_look_push_token` must exactly match the `PUSH_TOKEN` Edge Function secret, and `first_look_push_url` must point at the `/push/send` route. Until both rows exist the cron skips silently, so enabling alerts is a safe two-step: add the four Edge Function secrets (deploy), then insert the two rows (delivery starts on the next cron tick). New exact-match jobs are enqueued during scans; the worker sends one deduplicated message per job and subscription, prunes dead subscriptions, and never rolls back a saved vacancy.

`FIRECRAWL_API_KEY` is only needed for the fallback wave connectors. The six RCV Workday candidates and Paytm Lever candidate use public structured feeds and do not consume Firecrawl quota. To run a fallback deliberately, invoke one group after reviewing quota, for example:

```sql
select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-1-watch', 'watch', 120000);
```

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

The public routes are `/health`, `/jobs`, `/candidates`, and `/coverage`. `/candidates` exposes official source-inventory rows awaiting bounded detail hydration; it deliberately withholds them from `/jobs` until finance relevance, India location, 0–2 experience, and a role-level Apply URL are verified. `/scan` requires the bearer token. CV matching, evidence-only cover-letter drafting, tailored CV selection, and the optional review-first form-fill helper are frontend/local-browser features; no profile data, credentials, cookies, or submitted application data is sent to this backend.
