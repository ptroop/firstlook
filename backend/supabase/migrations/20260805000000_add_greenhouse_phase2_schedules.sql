create or replace function public.invoke_first_look_greenhouse_scan(
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
  if p_group not in ('groww-watch', 'groww-reconcile', 'phonepe-watch', 'phonepe-reconcile') then
    raise exception 'Unknown First Look Greenhouse scan group';
  end if;
  if p_run_type not in ('watch', 'reconcile') then
    raise exception 'Unknown First Look run type';
  end if;
  select decrypted_secret into scan_url from vault.decrypted_secrets where name = 'first_look_scan_url';
  select decrypted_secret into scan_token from vault.decrypted_secrets where name = 'first_look_scan_token';
  if scan_url is null or scan_token is null then
    raise exception 'First Look Vault secrets are not configured';
  end if;
  select net.http_post(
    url := scan_url || '?group=' || p_group || '&run_type=' || p_run_type,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || scan_token),
    body := '{}'::jsonb,
    timeout_milliseconds := greatest(5000, least(p_timeout_milliseconds, 120000))
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function public.invoke_first_look_greenhouse_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_greenhouse_scan(text, text, integer) to postgres;

create or replace function public.recover_stale_first_look_greenhouse_scans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  last_started_at timestamptz;
  retries_started integer := 0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('first-look-greenhouse-watchdog')::bigint) then return 0; end if;
  for target in select * from (values
    ('groww-watch', 'groww-official-india', 'watch', interval '50 minutes', 60000),
    ('groww-reconcile', 'groww-official-india', 'reconcile', interval '150 minutes', 120000),
    ('phonepe-watch', 'phonepe-official-india', 'watch', interval '50 minutes', 60000),
    ('phonepe-reconcile', 'phonepe-official-india', 'reconcile', interval '150 minutes', 120000)
  ) as expected(group_name, connector_id, run_type, maximum_age, timeout_milliseconds)
  loop
    select max(started_at) into last_started_at from public.source_scan_runs where connector_id = target.connector_id and run_type = target.run_type;
    if last_started_at is null or last_started_at < pg_catalog.now() - target.maximum_age then
      perform public.invoke_first_look_greenhouse_scan(target.group_name, target.run_type, target.timeout_milliseconds);
      retries_started := retries_started + 1;
    end if;
  end loop;
  return retries_started;
end;
$$;

revoke all on function public.recover_stale_first_look_greenhouse_scans() from public, anon, authenticated;
grant execute on function public.recover_stale_first_look_greenhouse_scans() to postgres;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname in (
    'first-look-groww-watch', 'first-look-groww-reconcile',
    'first-look-phonepe-watch', 'first-look-phonepe-reconcile'
  )
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-groww-watch', '7,37 * * * *', $$select public.invoke_first_look_greenhouse_scan('groww-watch', 'watch', 60000);$$);
select cron.schedule('first-look-groww-reconcile', '9 */2 * * *', $$select public.invoke_first_look_greenhouse_scan('groww-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-phonepe-watch', '12,42 * * * *', $$select public.invoke_first_look_greenhouse_scan('phonepe-watch', 'watch', 60000);$$);
select cron.schedule('first-look-phonepe-reconcile', '11 */2 * * *', $$select public.invoke_first_look_greenhouse_scan('phonepe-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-greenhouse-watchdog', '*/10 * * * *', $$select public.recover_stale_first_look_greenhouse_scans();$$);
