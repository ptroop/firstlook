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
    'kpmg-watch', 'kpmg-reconcile', 'amex-watch', 'amex-reconcile',
    'accenture-watch', 'accenture-reconcile',
    'pwc-watch', 'pwc-reconcile',
    'wells-fargo-watch', 'wells-fargo-reconcile',
    'deutsche-bank-watch', 'deutsche-bank-reconcile',
    'bank-of-america-watch', 'bank-of-america-reconcile',
    'natwest-watch', 'natwest-reconcile',
    'fidelity-watch', 'fidelity-reconcile',
    'ge-healthcare-watch', 'ge-healthcare-reconcile',
    'diageo-watch', 'diageo-reconcile',
    'sp-global-watch', 'sp-global-reconcile',
    'morningstar-watch', 'morningstar-reconcile'
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
    ('amex-reconcile', 'amex-official-india', 'reconcile', interval '150 minutes', 120000),
    ('accenture-watch', 'accenture-official-india', 'watch', interval '50 minutes', 60000),
    ('accenture-reconcile', 'accenture-official-india', 'reconcile', interval '150 minutes', 120000),
    ('pwc-watch', 'pwc-official-india', 'watch', interval '50 minutes', 60000),
    ('pwc-reconcile', 'pwc-official-india', 'reconcile', interval '150 minutes', 120000),
    ('wells-fargo-watch', 'wells-fargo-official-india', 'watch', interval '50 minutes', 60000),
    ('wells-fargo-reconcile', 'wells-fargo-official-india', 'reconcile', interval '150 minutes', 120000),
    ('deutsche-bank-watch', 'deutsche-bank-official-india', 'watch', interval '50 minutes', 60000),
    ('deutsche-bank-reconcile', 'deutsche-bank-official-india', 'reconcile', interval '150 minutes', 120000),
    ('bank-of-america-watch', 'bank-of-america-official-india', 'watch', interval '50 minutes', 60000),
    ('bank-of-america-reconcile', 'bank-of-america-official-india', 'reconcile', interval '150 minutes', 120000),
    ('natwest-watch', 'natwest-official-india', 'watch', interval '50 minutes', 60000),
    ('natwest-reconcile', 'natwest-official-india', 'reconcile', interval '150 minutes', 120000),
    ('fidelity-watch', 'fidelity-official-india', 'watch', interval '50 minutes', 60000),
    ('fidelity-reconcile', 'fidelity-official-india', 'reconcile', interval '150 minutes', 120000),
    ('ge-healthcare-watch', 'ge-healthcare-official-india', 'watch', interval '50 minutes', 60000),
    ('ge-healthcare-reconcile', 'ge-healthcare-official-india', 'reconcile', interval '150 minutes', 120000),
    ('diageo-watch', 'diageo-official-india', 'watch', interval '50 minutes', 60000),
    ('diageo-reconcile', 'diageo-official-india', 'reconcile', interval '150 minutes', 120000),
    ('sp-global-watch', 'sp-global-official-india', 'watch', interval '50 minutes', 60000),
    ('sp-global-reconcile', 'sp-global-official-india', 'reconcile', interval '150 minutes', 120000),
    ('morningstar-watch', 'morningstar-official-india', 'watch', interval '50 minutes', 60000),
    ('morningstar-reconcile', 'morningstar-official-india', 'reconcile', interval '150 minutes', 120000)
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
  select jobid into existing_job_id from cron.job where jobname = 'first-look-accenture-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-accenture-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-pwc-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-pwc-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-wells-fargo-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-wells-fargo-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-deutsche-bank-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-deutsche-bank-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-bank-of-america-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-bank-of-america-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-natwest-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-natwest-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-fidelity-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-fidelity-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-ge-healthcare-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-ge-healthcare-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-diageo-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-diageo-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-sp-global-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-sp-global-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  
  select jobid into existing_job_id from cron.job where jobname = 'first-look-morningstar-watch';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  select jobid into existing_job_id from cron.job where jobname = 'first-look-morningstar-reconcile';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
end;
$$;

select cron.schedule('first-look-accenture-watch', '0,30 * * * *', $$select public.invoke_first_look_scan('accenture-watch', 'watch', 60000);$$);
select cron.schedule('first-look-accenture-reconcile', '3 */2 * * *', $$select public.invoke_first_look_scan('accenture-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-pwc-watch', '2,32 * * * *', $$select public.invoke_first_look_scan('pwc-watch', 'watch', 60000);$$);
select cron.schedule('first-look-pwc-reconcile', '5 */2 * * *', $$select public.invoke_first_look_scan('pwc-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-wells-fargo-watch', '4,34 * * * *', $$select public.invoke_first_look_scan('wells-fargo-watch', 'watch', 60000);$$);
select cron.schedule('first-look-wells-fargo-reconcile', '7 */2 * * *', $$select public.invoke_first_look_scan('wells-fargo-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-deutsche-bank-watch', '6,36 * * * *', $$select public.invoke_first_look_scan('deutsche-bank-watch', 'watch', 60000);$$);
select cron.schedule('first-look-deutsche-bank-reconcile', '9 */2 * * *', $$select public.invoke_first_look_scan('deutsche-bank-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-bank-of-america-watch', '8,38 * * * *', $$select public.invoke_first_look_scan('bank-of-america-watch', 'watch', 60000);$$);
select cron.schedule('first-look-bank-of-america-reconcile', '12 */2 * * *', $$select public.invoke_first_look_scan('bank-of-america-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-natwest-watch', '10,40 * * * *', $$select public.invoke_first_look_scan('natwest-watch', 'watch', 60000);$$);
select cron.schedule('first-look-natwest-reconcile', '13 */2 * * *', $$select public.invoke_first_look_scan('natwest-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-fidelity-watch', '15,45 * * * *', $$select public.invoke_first_look_scan('fidelity-watch', 'watch', 60000);$$);
select cron.schedule('first-look-fidelity-reconcile', '16 */2 * * *', $$select public.invoke_first_look_scan('fidelity-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-ge-healthcare-watch', '18,48 * * * *', $$select public.invoke_first_look_scan('ge-healthcare-watch', 'watch', 60000);$$);
select cron.schedule('first-look-ge-healthcare-reconcile', '19 */2 * * *', $$select public.invoke_first_look_scan('ge-healthcare-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-diageo-watch', '20,50 * * * *', $$select public.invoke_first_look_scan('diageo-watch', 'watch', 60000);$$);
select cron.schedule('first-look-diageo-reconcile', '21 */2 * * *', $$select public.invoke_first_look_scan('diageo-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-sp-global-watch', '23,53 * * * *', $$select public.invoke_first_look_scan('sp-global-watch', 'watch', 60000);$$);
select cron.schedule('first-look-sp-global-reconcile', '24 */2 * * *', $$select public.invoke_first_look_scan('sp-global-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-morningstar-watch', '27,57 * * * *', $$select public.invoke_first_look_scan('morningstar-watch', 'watch', 60000);$$);
select cron.schedule('first-look-morningstar-reconcile', '33 */2 * * *', $$select public.invoke_first_look_scan('morningstar-reconcile', 'reconcile', 120000);$$);
