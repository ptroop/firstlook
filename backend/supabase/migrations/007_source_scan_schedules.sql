alter table public.source_inventory
  add column if not exists last_hydrated_at timestamptz,
  add column if not exists hydrated_metadata_hash text;

create index if not exists source_inventory_hydration_queue_idx
  on public.source_inventory (
    connector_id,
    active,
    candidate_status,
    last_hydrated_at asc nulls first,
    first_seen_at
  );

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_first_look_scan(
  p_group text,
  p_run_type text,
  p_timeout_milliseconds integer default 60000
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  scan_url text;
  scan_token text;
  request_id bigint;
begin
  if p_group not in (
    'moodys-reconcile',
    'deshaw-reconcile',
    'citi-watch',
    'citi-reconcile'
  ) then
    raise exception 'Unknown First Look scan group';
  end if;

  if p_run_type not in ('watch', 'reconcile') then
    raise exception 'Unknown First Look run type';
  end if;

  select decrypted_secret into scan_url
  from vault.decrypted_secrets
  where name = 'first_look_scan_url';

  select decrypted_secret into scan_token
  from vault.decrypted_secrets
  where name = 'first_look_scan_token';

  if scan_url is null or scan_token is null then
    raise exception 'First Look Vault secrets are not configured';
  end if;

  select net.http_post(
    url := scan_url || '?group=' || p_group || '&run_type=' || p_run_type,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || scan_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := greatest(5000, least(p_timeout_milliseconds, 120000))
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_first_look_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_scan(text, text, integer) to postgres;

do $$
declare
  scheduled_job record;
begin
  for scheduled_job in
    select jobid
    from cron.job
    where jobname = any(array[
      'first-look-scan-every-thirty-minutes',
      'first-look-moodys-reconcile',
      'first-look-deshaw-reconcile',
      'first-look-citi-watch',
      'first-look-citi-reconcile'
    ])
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'first-look-moodys-reconcile',
  '1,31 * * * *',
  $$select public.invoke_first_look_scan('moodys-reconcile', 'reconcile', 60000);$$
);

select cron.schedule(
  'first-look-deshaw-reconcile',
  '4,34 * * * *',
  $$select public.invoke_first_look_scan('deshaw-reconcile', 'reconcile', 60000);$$
);

select cron.schedule(
  'first-look-citi-watch',
  '7,37 * * * *',
  $$select public.invoke_first_look_scan('citi-watch', 'watch', 60000);$$
);

select cron.schedule(
  'first-look-citi-reconcile',
  '12 */2 * * *',
  $$select public.invoke_first_look_scan('citi-reconcile', 'reconcile', 120000);$$
);
