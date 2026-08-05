create or replace function public.invoke_first_look_rcv_ats_scan(
  p_group text,
  p_run_type text,
  p_timeout_milliseconds integer default 120000
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
    'state-street-watch', 'state-street-reconcile',
    'northern-trust-watch', 'northern-trust-reconcile',
    'mastercard-watch', 'mastercard-reconcile',
    'visa-watch', 'visa-reconcile',
    'factset-watch', 'factset-reconcile',
    'bloomberg-watch', 'bloomberg-reconcile',
    'paytm-watch', 'paytm-reconcile'
  ) then
    raise exception 'Unknown First Look RCV ATS scan group';
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

revoke all on function public.invoke_first_look_rcv_ats_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_rcv_ats_scan(text, text, integer) to postgres;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname like 'first-look-rcv-ats-%'
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-rcv-ats-state-street-watch', '5 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('state-street-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-ats-northern-trust-watch', '15 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('northern-trust-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-ats-mastercard-watch', '25 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('mastercard-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-ats-visa-watch', '35 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('visa-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-ats-factset-watch', '45 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('factset-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-ats-bloomberg-watch', '55 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('bloomberg-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-ats-paytm-watch', '10 */2 * * *', $$select public.invoke_first_look_rcv_ats_scan('paytm-watch', 'watch', 120000);$$);

select cron.schedule('first-look-rcv-ats-state-street-reconcile', '3 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('state-street-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-ats-northern-trust-reconcile', '13 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('northern-trust-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-ats-mastercard-reconcile', '23 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('mastercard-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-ats-visa-reconcile', '33 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('visa-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-ats-factset-reconcile', '43 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('factset-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-ats-bloomberg-reconcile', '53 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('bloomberg-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-ats-paytm-reconcile', '8 */6 * * *', $$select public.invoke_first_look_rcv_ats_scan('paytm-reconcile', 'reconcile', 120000);$$);
