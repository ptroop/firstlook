create or replace function public.deactivate_missing_jobs(
  p_source_company text,
  p_active_ids text[]
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set active = false
  where source_company = p_source_company
    and active = true
    and not (id = any(coalesce(p_active_ids, array[]::text[])));
$$;

revoke all on function public.deactivate_missing_jobs(text, text[]) from public, anon, authenticated;
grant execute on function public.deactivate_missing_jobs(text, text[]) to service_role;

