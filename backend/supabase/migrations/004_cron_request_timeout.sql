do $$
declare
  first_look_job_id bigint;
begin
  select jobid
  into first_look_job_id
  from cron.job
  where jobname = 'first-look-scan-every-thirty-minutes';

  if first_look_job_id is not null then
    perform cron.alter_job(
      first_look_job_id,
      command := 'select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = ''first_look_scan_url''), headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''first_look_scan_token'')), body := ''{}''::jsonb, timeout_milliseconds := 60000);'
    );
  end if;
end
$$;

