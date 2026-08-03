create or replace function public.finalize_complete_reconciliation(
  p_connector_id text,
  p_run_id bigint
)
returns table (
  inventory_closed integer,
  sources_closed integer,
  jobs_closed integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory_closed integer := 0;
  v_sources_closed integer := 0;
  v_jobs_closed integer := 0;
begin
  if not exists (
    select 1
    from public.source_scan_runs
    where id = p_run_id
      and connector_id = p_connector_id
      and run_type = 'reconcile'
      and status = 'complete'
  ) then
    raise exception 'run % is not a complete reconciliation for connector %', p_run_id, p_connector_id;
  end if;

  update public.source_inventory
  set consecutive_complete_misses = 0,
      active = true
  where connector_id = p_connector_id
    and last_scan_run_id = p_run_id;

  update public.source_inventory
  set consecutive_complete_misses = consecutive_complete_misses + 1
  where connector_id = p_connector_id
    and active = true
    and last_scan_run_id is distinct from p_run_id;

  update public.source_inventory
  set active = false
  where connector_id = p_connector_id
    and active = true
    and consecutive_complete_misses >= 2;
  get diagnostics v_inventory_closed = row_count;

  update public.job_sources js
  set consecutive_complete_misses = 0,
      active = true,
      last_scan_run_id = p_run_id
  from public.source_inventory si
  where si.connector_id = p_connector_id
    and si.last_scan_run_id = p_run_id
    and js.connector_id = si.connector_id
    and js.source_external_id = si.source_external_id;

  update public.job_sources js
  set consecutive_complete_misses = si.consecutive_complete_misses,
      active = si.active
  from public.source_inventory si
  where si.connector_id = p_connector_id
    and js.connector_id = si.connector_id
    and js.source_external_id = si.source_external_id
    and js.active is distinct from si.active;
  get diagnostics v_sources_closed = row_count;

  update public.jobs j
  set active = false,
      closed_at = coalesce(j.closed_at, now()),
      consecutive_complete_misses = greatest(j.consecutive_complete_misses, 2)
  where j.active = true
    and exists (
      select 1 from public.job_sources linked
      where linked.job_id = j.id
        and linked.connector_id = p_connector_id
    )
    and not exists (
      select 1 from public.job_sources active_source
      where active_source.job_id = j.id
        and active_source.active = true
    );
  get diagnostics v_jobs_closed = row_count;

  update public.jobs j
  set active = true,
      closed_at = null,
      consecutive_complete_misses = 0
  where exists (
    select 1 from public.job_sources active_source
    where active_source.job_id = j.id
      and active_source.active = true
  );

  update public.connector_state
  set last_reconcile_complete_at = now(),
      consecutive_failures = 0,
      updated_at = now()
  where connector_id = p_connector_id;

  return query select v_inventory_closed, v_sources_closed, v_jobs_closed;
end;
$$;

revoke all on function public.finalize_complete_reconciliation(text, bigint) from public, anon, authenticated;
grant execute on function public.finalize_complete_reconciliation(text, bigint) to service_role;

