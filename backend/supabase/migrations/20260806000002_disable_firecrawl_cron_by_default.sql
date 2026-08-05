-- Firecrawl remains available as an explicit fallback for unsupported employers,
-- but must not consume a free-tier quota through unattended polling.
do $$
declare
  j bigint;
begin
  for j in select jobid from cron.job where jobname like 'first-look-%firecrawl-%'
  loop
    perform cron.unschedule(j);
  end loop;
end;
$$;
