create table if not exists public.jobs (
  id text primary key,
  source_company text not null,
  source_url text not null,
  apply_url text not null,
  title text not null,
  location text not null default '',
  description text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists jobs_active_first_seen_idx
  on public.jobs (active, first_seen_at desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  subscription_json jsonb not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.scan_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_checked integer not null default 0,
  jobs_found integer not null default 0,
  error_count integer not null default 0
);

alter table public.jobs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.scan_runs enable row level security;

-- No anonymous table policies are created. The Edge Function uses the service-role key server-side.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Run this after storing the project URL and scan token in Supabase Vault:
--
-- select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1/first-look-api/scan', 'first_look_scan_url');
-- select vault.create_secret('YOUR_SCAN_TOKEN', 'first_look_scan_token');
--
-- select cron.schedule(
--   'first-look-scan-every-thirty-minutes',
--   '*/30 * * * *',
--   $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'first_look_scan_url'),
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'first_look_scan_token')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
