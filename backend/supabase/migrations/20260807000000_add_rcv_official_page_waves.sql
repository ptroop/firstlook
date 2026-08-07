-- Quota-free fallback for RCV employers whose official sites expose HTML,
-- JSON-LD, links, or sitemaps but do not expose a stable public ATS API.
-- The metered browser fallback remains deliberately disabled for cron polling.
create or replace function public.invoke_first_look_rcv_official_page_scan(
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
    'rcv-official-page-wave-1-watch', 'rcv-official-page-wave-1-reconcile',
    'rcv-official-page-wave-2-watch', 'rcv-official-page-wave-2-reconcile',
    'rcv-official-page-wave-3-watch', 'rcv-official-page-wave-3-reconcile',
    'rcv-official-page-wave-4-watch', 'rcv-official-page-wave-4-reconcile',
    'rcv-official-page-wave-5-watch', 'rcv-official-page-wave-5-reconcile'
  ) then
    raise exception 'Unknown First Look official-page scan group';
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

revoke all on function public.invoke_first_look_rcv_official_page_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_rcv_official_page_scan(text, text, integer) to postgres;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname like 'first-look-rcv-official-page-wave-%'
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-rcv-official-page-wave-1-watch', '5 */2 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-1-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-2-watch', '20 */2 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-2-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-3-watch', '35 */2 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-3-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-4-watch', '50 */2 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-4-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-5-watch', '5 */2 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-5-watch', 'watch', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-1-reconcile', '7 */6 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-1-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-2-reconcile', '22 */6 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-2-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-3-reconcile', '37 */6 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-3-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-4-reconcile', '52 */6 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-4-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-rcv-official-page-wave-5-reconcile', '57 */6 * * *', $$select public.invoke_first_look_rcv_official_page_scan('rcv-official-page-wave-5-reconcile', 'reconcile', 120000);$$);
