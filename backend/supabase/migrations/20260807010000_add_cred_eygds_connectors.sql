-- Quota-free connectors for previously-blocked RCV employers:
-- CRED runs on Lever (api.lever.co) and EY GDS runs on a Yello job board
-- (eyglobal.yello.co) whose search API is India-filtered. Both expose
-- public JSON endpoints, so no Firecrawl credits are required.
create or replace function public.invoke_first_look_cred_eygds_scan(
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
    'cred-watch', 'cred-reconcile',
    'ey-gds-watch', 'ey-gds-reconcile'
  ) then
    raise exception 'Unknown First Look CRED/EY GDS scan group';
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

revoke all on function public.invoke_first_look_cred_eygds_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_cred_eygds_scan(text, text, integer) to postgres;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname like 'first-look-cred-%' or jobname like 'first-look-ey-gds-%'
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-cred-watch', '7,37 * * * *', $$select public.invoke_first_look_cred_eygds_scan('cred-watch', 'watch', 120000);$$);
select cron.schedule('first-look-ey-gds-watch', '12,42 * * * *', $$select public.invoke_first_look_cred_eygds_scan('ey-gds-watch', 'watch', 120000);$$);

select cron.schedule('first-look-cred-reconcile', '9 */6 * * *', $$select public.invoke_first_look_cred_eygds_scan('cred-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-ey-gds-reconcile', '14 */6 * * *', $$select public.invoke_first_look_cred_eygds_scan('ey-gds-reconcile', 'reconcile', 120000);$$);
