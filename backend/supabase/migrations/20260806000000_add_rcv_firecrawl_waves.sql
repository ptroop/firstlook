create or replace function public.invoke_first_look_rcv_firecrawl_scan(
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
    'rcv-firecrawl-wave-1-watch', 'rcv-firecrawl-wave-1-reconcile',
    'rcv-firecrawl-wave-2-watch', 'rcv-firecrawl-wave-2-reconcile',
    'rcv-firecrawl-wave-3-watch', 'rcv-firecrawl-wave-3-reconcile',
    'rcv-firecrawl-wave-4-watch', 'rcv-firecrawl-wave-4-reconcile'
  ) then
    raise exception 'Unknown First Look RCV Firecrawl scan group';
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

revoke all on function public.invoke_first_look_rcv_firecrawl_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_rcv_firecrawl_scan(text, text, integer) to postgres;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname like 'first-look-rcv-firecrawl-wave-%'
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-rcv-firecrawl-wave-1-watch', '3 */2 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-1-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-2-watch', '23 */2 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-2-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-3-watch', '43 */2 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-3-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-4-watch', '1 */2 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-4-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-1-reconcile', '7 */6 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-1-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-2-reconcile', '17 */6 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-2-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-3-reconcile', '27 */6 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-3-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-firecrawl-wave-4-reconcile', '37 */6 * * *', $$select public.invoke_first_look_rcv_firecrawl_scan('rcv-firecrawl-wave-4-reconcile', 'reconcile', 120000);$$);
