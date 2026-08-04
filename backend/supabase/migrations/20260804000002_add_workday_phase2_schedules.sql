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
    'morningstar-watch', 'morningstar-reconcile',
    'jpmorgan-watch', 'jpmorgan-reconcile',
    'morgan-stanley-watch', 'morgan-stanley-reconcile',
    'paypal-watch', 'paypal-reconcile',
    'shell-watch', 'shell-reconcile',
    'siemens-watch', 'siemens-reconcile'
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
    ('morningstar-reconcile', 'morningstar-official-india', 'reconcile', interval '150 minutes', 120000),
    ('jpmorgan-watch', 'jpmorgan-official-india', 'watch', interval '50 minutes', 60000),
    ('jpmorgan-reconcile', 'jpmorgan-official-india', 'reconcile', interval '150 minutes', 120000),
    ('morgan-stanley-watch', 'morgan-stanley-official-india', 'watch', interval '50 minutes', 60000),
    ('morgan-stanley-reconcile', 'morgan-stanley-official-india', 'reconcile', interval '150 minutes', 120000),
    ('paypal-watch', 'paypal-official-india', 'watch', interval '50 minutes', 60000),
    ('paypal-reconcile', 'paypal-official-india', 'reconcile', interval '150 minutes', 120000),
    ('shell-watch', 'shell-official-india', 'watch', interval '50 minutes', 60000),
    ('shell-reconcile', 'shell-official-india', 'reconcile', interval '150 minutes', 120000),
    ('siemens-watch', 'siemens-official-india', 'watch', interval '50 minutes', 60000),
    ('siemens-reconcile', 'siemens-official-india', 'reconcile', interval '150 minutes', 120000)
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
  j bigint;
begin
  for j in select jobid from cron.job where jobname in (
    'first-look-jpmorgan-watch', 'first-look-jpmorgan-reconcile',
    'first-look-morgan-stanley-watch', 'first-look-morgan-stanley-reconcile',
    'first-look-paypal-watch', 'first-look-paypal-reconcile',
    'first-look-shell-watch', 'first-look-shell-reconcile',
    'first-look-siemens-watch', 'first-look-siemens-reconcile'
  )
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-jpmorgan-watch', '1,31 * * * *', $$select public.invoke_first_look_scan('jpmorgan-watch', 'watch', 60000);$$);
select cron.schedule('first-look-jpmorgan-reconcile', '35 */2 * * *', $$select public.invoke_first_look_scan('jpmorgan-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-morgan-stanley-watch', '3,33 * * * *', $$select public.invoke_first_look_scan('morgan-stanley-watch', 'watch', 60000);$$);
select cron.schedule('first-look-morgan-stanley-reconcile', '37 */2 * * *', $$select public.invoke_first_look_scan('morgan-stanley-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-paypal-watch', '5,35 * * * *', $$select public.invoke_first_look_scan('paypal-watch', 'watch', 60000);$$);
select cron.schedule('first-look-paypal-reconcile', '39 */2 * * *', $$select public.invoke_first_look_scan('paypal-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-shell-watch', '14,44 * * * *', $$select public.invoke_first_look_scan('shell-watch', 'watch', 60000);$$);
select cron.schedule('first-look-shell-reconcile', '41 */2 * * *', $$select public.invoke_first_look_scan('shell-reconcile', 'reconcile', 120000);$$);

select cron.schedule('first-look-siemens-watch', '16,46 * * * *', $$select public.invoke_first_look_scan('siemens-watch', 'watch', 60000);$$);
select cron.schedule('first-look-siemens-reconcile', '43 */2 * * *', $$select public.invoke_first_look_scan('siemens-reconcile', 'reconcile', 120000);$$);
