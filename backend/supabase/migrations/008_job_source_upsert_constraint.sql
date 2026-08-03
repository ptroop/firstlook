drop index if exists public.job_sources_external_identity_idx;

create unique index job_sources_external_identity_idx
  on public.job_sources (source_type, source_name, source_external_id);
