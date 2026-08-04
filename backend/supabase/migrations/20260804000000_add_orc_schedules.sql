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
    'moodys-reconcile', 'deshaw-reconcile', 'citi-watch', 'citi-reconcile',
    'goldman-reconcile', 'blackrock-watch', 'blackrock-reconcile',
    'barclays-watch', 'barclays-reconcile', 'razorpay-watch', 'razorpay-reconcile',
    'kpmg-watch', 'kpmg-reconcile', 'amex-watch', 'amex-reconcile'
  ) then
    raise exception 'Unknown First Look scan group';
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

revoke all on function public.invoke_first_look_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_scan(text, text, integer) to postgres;

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
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('first-look-scan-watchdog')::bigint) then return 0; end if;
  for target in select * from (values
    ('moodys-reconcile', 'moodys-official-india', 'reconcile', interval '50 minutes', 60000),
    ('deshaw-reconcile', 'deshaw-official-india', 'reconcile', interval '50 minutes', 60000),
    ('citi-watch', 'citi-official-india', 'watch', interval '50 minutes', 60000),
    ('citi-reconcile', 'citi-official-india', 'reconcile', interval '150 minutes', 120000),
    ('goldman-reconcile', 'goldman-sachs-official-india', 'reconcile', interval '50 minutes', 60000),
    ('blackrock-watch', 'blackrock-official-india', 'watch', interval '50 minutes', 60000),
    ('blackrock-reconcile', 'blackrock-official-india', 'reconcile', interval '150 minutes', 120000),
    ('barclays-watch', 'barclays-official-india', 'watch', interval '50 minutes', 60000),
    ('barclays-reconcile', 'barclays-official-india', 'reconcile', interval '150 minutes', 120000),
    ('razorpay-watch', 'razorpay-official-india', 'watch', interval '50 minutes', 60000),
    ('razorpay-reconcile', 'razorpay-official-india', 'reconcile', interval '150 minutes', 120000),
    ('kpmg-watch', 'kpmg-official-india', 'watch', interval '50 minutes', 60000),
    ('kpmg-reconcile', 'kpmg-official-india', 'reconcile', interval '150 minutes', 120000),
    ('amex-watch', 'amex-official-india', 'watch', interval '50 minutes', 60000),
    ('amex-reconcile', 'amex-official-india', 'reconcile', interval '150 minutes', 120000)
  ) as expected(group_name, connector_id, run_type, maximum_age, timeout_milliseconds)
  loop
    select max(started_at) into last_started_at from public.source_scan_runs where connector_id = target.connector_id and run_type = target.run_type;
    if last_started_at is null or last_started_at < pg_catalog.now() - target.maximum_age then
      perform public.invoke_first_look_scan(target.group_name, target.run_type, target.timeout_milliseconds);
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
  select jobid into existing_job_id from cron.job where jobname = 'first-look-kpmg-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-kpmg-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-amex-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-amex-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
end;
$$;

select cron.schedule('first-look-kpmg-watch', '28,58 * * * *', $$select public.invoke_first_look_scan('kpmg-watch', 'watch', 60000);$$);
select cron.schedule('first-look-kpmg-reconcile', '31 */2 * * *', $$select public.invoke_first_look_scan('kpmg-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-amex-watch', '22,52 * * * *', $$select public.invoke_first_look_scan('amex-watch', 'watch', 60000);$$);
select cron.schedule('first-look-amex-reconcile', '25 */2 * * *', $$select public.invoke_first_look_scan('amex-reconcile', 'reconcile', 120000);$$);
