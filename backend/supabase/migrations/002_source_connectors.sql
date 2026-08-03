alter table public.jobs
  add column if not exists employer_job_id text,
  add column if not exists posted_at timestamptz,
  add column if not exists experience_text text not null default '',
  add column if not exists job_category text not null default '';

create unique index if not exists jobs_source_employer_job_id_idx
  on public.jobs (source_company, employer_job_id)
  where employer_job_id is not null;

create table if not exists public.source_scan_runs (
  id bigint generated always as identity primary key,
  scan_run_id bigint references public.scan_runs (id) on delete cascade,
  source_company text not null,
  status text not null check (status in ('success', 'partial', 'failed', 'unsupported')),
  discovered_count integer not null default 0,
  fetched_count integer not null default 0,
  matching_count integer not null default 0,
  excluded_json jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null,
  finished_at timestamptz not null
);

create index if not exists source_scan_runs_company_finished_idx
  on public.source_scan_runs (source_company, finished_at desc);

alter table public.source_scan_runs enable row level security;

