-- Push notification outbox: new exact-match matching jobs are enqueued here
-- by the scanner in the same flow that saves the canonical job. A scheduled
-- push worker drains pending rows and marks each one sent (or failed after
-- five bounded attempts). Notification failure never rolls back the saved
-- vacancy because the outbox insert is independent of the job upsert.
--
-- Worker credentials live in an RLS-locked plain table instead of the Vault
-- extension, which is not available on every Supabase plan. RLS is enabled
-- with zero policies, so anonymous/authenticated PostgREST roles can never
-- read or write the rows; only the security-definer cron helper below
-- (owner: postgres) can.

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  job_id text not null,
  title text not null,
  company text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  next_attempt_at timestamptz not null default now()
);

create unique index if not exists notification_outbox_job_id_unique
  on public.notification_outbox (job_id);

create index if not exists notification_outbox_drain_idx
  on public.notification_outbox (status, next_attempt_at)
  where status = 'pending';

alter table public.notification_outbox enable row level security;

-- Worker credentials: the push worker URL and the bearer token that /push/send
-- accepts. Populated with:
--   insert into public.first_look_secrets(name, secret_value) values (...)
--   on conflict (name) do update
--     set secret_value = excluded.secret_value, updated_at = now();
create table if not exists public.first_look_secrets (
  name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies means every non-owner access is denied. PostgREST
-- (anon and authenticated roles) cannot see these rows; only the table owner
-- (postgres) and the security-definer helper below can.
alter table public.first_look_secrets enable row level security;

-- No anonymous policies are created for any table here. The Edge Function uses
-- the service-role key server-side, exactly like the other First Look tables,
-- and the cron helper reads credentials as the postgres owner.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_first_look_push_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  push_url text;
  push_token text;
  request_id bigint;
begin
  select secret_value into push_url
  from public.first_look_secrets
  where name = 'first_look_push_url';

  select secret_value into push_token
  from public.first_look_secrets
  where name = 'first_look_push_token';

  -- Until the secrets are inserted, skip instead of raising every two
  -- minutes: the cron entry is harmless while the worker is unconfigured.
  if push_url is null or push_token is null then
    return 0;
  end if;

  -- first_look_push_token must equal the PUSH_TOKEN env var of the deployed
  -- Edge Function, since /push/send authenticates with that same Bearer token.
  select net.http_post(
    url := push_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || push_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_first_look_push_worker() from public, anon, authenticated;
grant execute on function public.invoke_first_look_push_worker() to postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'first-look-push-worker';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

-- Drain the outbox every two minutes.
select cron.schedule(
  'first-look-push-worker',
  '*/2 * * * *',
  $$select public.invoke_first_look_push_worker();$$
);
