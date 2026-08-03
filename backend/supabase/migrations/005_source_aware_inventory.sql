alter table public.jobs
  add column if not exists company text,
  add column if not exists official_detail_url text,
  add column if not exists official_apply_url text,
  add column if not exists location_status text not null default 'uncertain',
  add column if not exists finance_status text not null default 'unclassified',
  add column if not exists experience_status text not null default 'unclassified',
  add column if not exists minimum_years numeric,
  add column if not exists maximum_years numeric,
  add column if not exists match_tier text not null default 'possible',
  add column if not exists classification_method text not null default 'pending',
  add column if not exists classification_version text not null default 'unclassified-v1',
  add column if not exists description_hash text,
  add column if not exists classified_at timestamptz,
  add column if not exists consecutive_complete_misses integer not null default 0,
  add column if not exists closed_at timestamptz;

update public.jobs
set company = source_company,
    official_detail_url = nullif(source_url, ''),
    official_apply_url = nullif(apply_url, '')
where company is null;

alter table public.jobs
  alter column company set not null;

alter table public.jobs
  drop constraint if exists jobs_location_status_check,
  add constraint jobs_location_status_check
    check (location_status in ('india', 'not_india', 'uncertain')),
  drop constraint if exists jobs_finance_status_check,
  add constraint jobs_finance_status_check
    check (finance_status in ('exact', 'likely', 'unrelated', 'unclassified')),
  drop constraint if exists jobs_experience_status_check,
  add constraint jobs_experience_status_check
    check (experience_status in ('zero_to_two', 'ambiguous', 'over_two', 'unclassified')),
  drop constraint if exists jobs_match_tier_check,
  add constraint jobs_match_tier_check
    check (match_tier in ('exact', 'possible', 'not_targeted')),
  drop constraint if exists jobs_classification_method_check,
  add constraint jobs_classification_method_check
    check (classification_method in ('deterministic', 'openrouter', 'mixed', 'pending')),
  drop constraint if exists jobs_complete_misses_nonnegative,
  add constraint jobs_complete_misses_nonnegative
    check (consecutive_complete_misses >= 0);

alter table public.source_scan_runs
  drop constraint if exists source_scan_runs_status_check;

alter table public.source_scan_runs
  add column if not exists source_type text not null default 'official_career',
  add column if not exists connector_id text,
  add column if not exists connector_version text not null default 'legacy-v1',
  add column if not exists run_type text not null default 'reconcile',
  add column if not exists hydration_status text not null default 'complete',
  add column if not exists reported_total integer,
  add column if not exists pages_expected integer,
  add column if not exists pages_fetched integer not null default 0,
  add column if not exists listings_discovered integer not null default 0,
  add column if not exists inventory_created integer not null default 0,
  add column if not exists inventory_changed integer not null default 0,
  add column if not exists candidates_selected integer not null default 0,
  add column if not exists details_due integer not null default 0,
  add column if not exists details_fetched integer not null default 0,
  add column if not exists details_backlogged integer not null default 0,
  add column if not exists apply_urls_resolved integer not null default 0,
  add column if not exists candidate_observations_persisted integer not null default 0,
  add column if not exists new_observations integer not null default 0,
  add column if not exists changed_observations integer not null default 0,
  add column if not exists canonical_jobs_created integer not null default 0,
  add column if not exists baseline_count integer,
  add column if not exists count_change_ratio numeric,
  add column if not exists error_summary jsonb not null default '[]'::jsonb;

update public.source_scan_runs
set connector_id = regexp_replace(lower(source_company), '[^a-z0-9]+', '-', 'g') || '-official-india',
    status = case status when 'success' then 'complete' else status end,
    listings_discovered = greatest(discovered_count, 0),
    details_fetched = greatest(fetched_count, 0),
    candidate_observations_persisted = greatest(matching_count, 0)
where connector_id is null;

alter table public.source_scan_runs
  alter column connector_id set not null,
  add constraint source_scan_runs_status_check
    check (status in ('complete', 'partial', 'failed', 'unsupported', 'anomalous')),
  add constraint source_scan_runs_source_type_check
    check (source_type in ('official_career', 'linkedin', 'naukri', 'iimjobs', 'indeed', 'other')),
  add constraint source_scan_runs_run_type_check
    check (run_type in ('watch', 'reconcile', 'hydrate')),
  add constraint source_scan_runs_hydration_status_check
    check (hydration_status in ('complete', 'backlog', 'degraded'));

create table if not exists public.source_inventory (
  connector_id text not null,
  source_external_id text not null,
  company text not null,
  title text not null,
  location text,
  category text,
  department text,
  detail_url text not null,
  listing_metadata_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_scan_run_id bigint references public.source_scan_runs (id) on delete set null,
  candidate_status text not null default 'defer',
  candidate_reasons jsonb not null default '[]'::jsonb,
  consecutive_complete_misses integer not null default 0,
  active boolean not null default true,
  primary key (connector_id, source_external_id),
  constraint source_inventory_candidate_status_check
    check (candidate_status in ('hydrate', 'defer', 'hydrated', 'audit')),
  constraint source_inventory_candidate_reasons_bounded
    check (jsonb_typeof(candidate_reasons) = 'array' and jsonb_array_length(candidate_reasons) <= 12),
  constraint source_inventory_complete_misses_nonnegative
    check (consecutive_complete_misses >= 0)
);

create index if not exists source_inventory_due_idx
  on public.source_inventory (connector_id, candidate_status, active, last_seen_at);

create table if not exists public.job_sources (
  id bigint generated always as identity primary key,
  job_id text references public.jobs (id) on delete set null,
  connector_id text not null,
  canonicalization_status text not null default 'pending',
  source_type text not null,
  source_name text not null,
  source_external_id text,
  url_fingerprint text not null,
  listing_url text not null,
  detail_url text,
  apply_url text,
  is_official boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  active boolean not null default true,
  consecutive_complete_misses integer not null default 0,
  listing_metadata_hash text,
  content_hash text,
  hydration_status text not null default 'pending',
  detail_checked_at timestamptz,
  next_detail_check_at timestamptz,
  first_scan_run_id bigint references public.source_scan_runs (id) on delete set null,
  last_scan_run_id bigint references public.source_scan_runs (id) on delete set null,
  raw_metadata jsonb not null default '{}'::jsonb,
  constraint job_sources_canonicalization_status_check
    check (canonicalization_status in ('linked', 'pending', 'conflict')),
  constraint job_sources_source_type_check
    check (source_type in ('official_career', 'linkedin', 'naukri', 'iimjobs', 'indeed', 'other')),
  constraint job_sources_hydration_status_check
    check (hydration_status in ('pending', 'complete', 'failed')),
  constraint job_sources_complete_misses_nonnegative
    check (consecutive_complete_misses >= 0),
  constraint job_sources_raw_metadata_bounded
    check (octet_length(raw_metadata::text) <= 32768)
);

create unique index if not exists job_sources_external_identity_idx
  on public.job_sources (source_type, source_name, source_external_id)
  where source_external_id is not null;

create unique index if not exists job_sources_url_identity_idx
  on public.job_sources (source_type, source_name, url_fingerprint)
  where source_external_id is null;

create index if not exists job_sources_job_active_idx
  on public.job_sources (job_id, active, is_official);

create table if not exists public.job_classifications (
  id bigint generated always as identity primary key,
  job_id text not null references public.jobs (id) on delete cascade,
  description_hash text not null,
  classification_version text not null,
  deterministic_result jsonb not null,
  deterministic_evidence jsonb not null default '[]'::jsonb,
  model_result jsonb,
  model_evidence jsonb,
  requested_model_id text,
  actual_model_id text,
  final_result jsonb not null,
  confidence numeric,
  validation_errors jsonb not null default '[]'::jsonb,
  classified_at timestamptz not null default now(),
  unique (job_id, description_hash, classification_version)
);

create table if not exists public.connector_state (
  connector_id text primary key,
  source_type text not null,
  source_name text not null,
  company text not null,
  scan_group text not null,
  baseline_completed_at timestamptz,
  last_watch_complete_at timestamptz,
  last_reconcile_complete_at timestamptz,
  last_reported_total integer,
  last_page_count integer,
  consecutive_failures integer not null default 0,
  next_due_at timestamptz,
  reconcile_interval_hours integer not null,
  detail_recheck_hours integer not null default 24,
  detail_batch_size integer not null,
  updated_at timestamptz not null default now(),
  constraint connector_state_source_type_check
    check (source_type in ('official_career', 'linkedin', 'naukri', 'iimjobs', 'indeed', 'other')),
  constraint connector_state_intervals_positive
    check (reconcile_interval_hours > 0 and detail_recheck_hours > 0 and detail_batch_size > 0)
);

insert into public.job_sources (
  job_id,
  connector_id,
  canonicalization_status,
  source_type,
  source_name,
  source_external_id,
  url_fingerprint,
  listing_url,
  detail_url,
  apply_url,
  is_official,
  first_seen_at,
  last_seen_at,
  last_verified_at,
  active,
  hydration_status,
  detail_checked_at,
  raw_metadata
)
select
  j.id,
  regexp_replace(lower(j.source_company), '[^a-z0-9]+', '-', 'g') || '-official-india',
  'linked',
  'official_career',
  j.source_company || ' Careers',
  coalesce(j.employer_job_id, j.id),
  md5(lower(coalesce(nullif(j.source_url, ''), j.apply_url))),
  coalesce(nullif(j.source_url, ''), j.apply_url),
  nullif(j.source_url, ''),
  nullif(j.apply_url, ''),
  true,
  j.first_seen_at,
  j.last_seen_at,
  j.last_seen_at,
  j.active,
  'complete',
  j.last_seen_at,
  jsonb_build_object('migrated_from', 'jobs')
from public.jobs j
on conflict (source_type, source_name, source_external_id)
where source_external_id is not null
do update set
  job_id = excluded.job_id,
  detail_url = excluded.detail_url,
  apply_url = excluded.apply_url,
  last_seen_at = greatest(public.job_sources.last_seen_at, excluded.last_seen_at),
  active = excluded.active;

alter table public.source_inventory enable row level security;
alter table public.job_sources enable row level security;
alter table public.job_classifications enable row level security;
alter table public.connector_state enable row level security;

revoke all on public.source_inventory from anon, authenticated;
revoke all on public.job_sources from anon, authenticated;
revoke all on public.job_classifications from anon, authenticated;
revoke all on public.connector_state from anon, authenticated;
