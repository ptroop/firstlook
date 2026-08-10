-- HDFC Bank and Axis Bank expose their public India listings through
-- RippleHire JSON endpoints. Keep the generic official-page connectors as
-- fallback identities, but schedule the structured feeds as the primary
-- source so pagination and role-level links are preserved.
create or replace function public.invoke_first_look_ripplehire_scan(
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
    'hdfc-bank-ripplehire-india-watch',
    'hdfc-bank-ripplehire-india-reconcile',
    'axis-bank-ripplehire-india-watch',
    'axis-bank-ripplehire-india-reconcile'
  ) then
    raise exception 'Unknown First Look RippleHire scan group';
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

revoke all on function public.invoke_first_look_ripplehire_scan(text, text, integer) from public, anon, authenticated;
grant execute on function public.invoke_first_look_ripplehire_scan(text, text, integer) to postgres;

do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname like 'first-look-ripplehire-%'
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;

select cron.schedule('first-look-ripplehire-hdfc-watch', '4,34 * * * *', $$select public.invoke_first_look_ripplehire_scan('hdfc-bank-ripplehire-india-watch', 'watch', 120000);$$);
select cron.schedule('first-look-ripplehire-axis-watch', '9,39 * * * *', $$select public.invoke_first_look_ripplehire_scan('axis-bank-ripplehire-india-watch', 'watch', 120000);$$);
select cron.schedule('first-look-ripplehire-hdfc-reconcile', '13 */6 * * *', $$select public.invoke_first_look_ripplehire_scan('hdfc-bank-ripplehire-india-reconcile', 'reconcile', 120000);$$);
select cron.schedule('first-look-ripplehire-axis-reconcile', '18 */6 * * *', $$select public.invoke_first_look_ripplehire_scan('axis-bank-ripplehire-india-reconcile', 'reconcile', 120000);$$);
