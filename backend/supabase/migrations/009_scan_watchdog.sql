create or replace function public.recover_stale_first_look_scans()
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
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtext('first-look-scan-watchdog')::bigint
  ) then
    return 0;
  end if;

  for target in
    select *
    from (values
      ('moodys-reconcile', 'moodys-official-india', 'reconcile', interval '50 minutes', 60000),
      ('deshaw-reconcile', 'deshaw-official-india', 'reconcile', interval '50 minutes', 60000),
      ('citi-watch', 'citi-official-india', 'watch', interval '50 minutes', 60000),
      ('citi-reconcile', 'citi-official-india', 'reconcile', interval '150 minutes', 120000)
    ) as expected(group_name, connector_id, run_type, maximum_age, timeout_milliseconds)
  loop
    select max(started_at)
    into last_started_at
    from public.source_scan_runs
    where connector_id = target.connector_id
      and run_type = target.run_type;

    if last_started_at is null
      or last_started_at < pg_catalog.now() - target.maximum_age
    then
      perform public.invoke_first_look_scan(
        target.group_name,
        target.run_type,
        target.timeout_milliseconds
      );
      retries_started := retries_started + 1;
    end if;
  end loop;

  return retries_started;
end;
$$;

revoke all on function public.recover_stale_first_look_scans() from public, anon, authenticated;
grant execute on function public.recover_stale_first_look_scans() to postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'first-look-scan-watchdog';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'first-look-scan-watchdog',
  '*/10 * * * *',
  $$select public.recover_stale_first_look_scans();$$
);
