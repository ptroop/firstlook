import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../migrations/007_source_scan_schedules.sql', import.meta.url),
  'utf8',
);
const persistenceRepair = readFileSync(
  new URL('../../migrations/008_job_source_upsert_constraint.sql', import.meta.url),
  'utf8',
);
const watchdog = readFileSync(
  new URL('../../migrations/009_scan_watchdog.sql', import.meta.url),
  'utf8',
);
const goldmanSchedule = readFileSync(
  new URL('../../migrations/010_goldman_scan_schedule.sql', import.meta.url),
  'utf8',
);
const talentBrewSchedule = readFileSync(
  new URL('../../migrations/20260803171004_add_blackrock_barclays_schedules.sql', import.meta.url),
  'utf8',
);
const greenhouseSchedule = readFileSync(
  new URL('../../migrations/20260803180128_add_razorpay_schedule.sql', import.meta.url),
  'utf8',
);
const workdaySchedule = readFileSync(
  new URL('../../migrations/20260804000001_add_workday_schedules.sql', import.meta.url),
  'utf8',
);
const workdayPhase2Schedule = readFileSync(
  new URL('../../migrations/20260804000002_add_workday_phase2_schedules.sql', import.meta.url),
  'utf8',
);
const firecrawlSchedule = readFileSync(
  new URL('../../migrations/20260804000003_add_firecrawl_schedules.sql', import.meta.url),
  'utf8',
);
const greenhousePhase2Schedule = readFileSync(
  new URL('../../migrations/20260805000000_add_greenhouse_phase2_schedules.sql', import.meta.url),
  'utf8',
);
const rcvFirecrawlSchedule = readFileSync(
  new URL('../../migrations/20260806000000_add_rcv_firecrawl_waves.sql', import.meta.url),
  'utf8',
);
const rcvAtsSchedule = readFileSync(
  new URL('../../migrations/20260806000001_add_rcv_ats_schedules.sql', import.meta.url),
  'utf8',
);
const rcvOfficialPageSchedule = readFileSync(
  new URL('../../migrations/20260807000000_add_rcv_official_page_waves.sql', import.meta.url),
  'utf8',
);
const firecrawlQuotaGuard = readFileSync(
  new URL('../../migrations/20260806000002_disable_firecrawl_cron_by_default.sql', import.meta.url),
  'utf8',
);
const pushOutbox = readFileSync(
  new URL('../../migrations/20260806000003_push_notification_outbox.sql', import.meta.url),
  'utf8',
);

test('rotates hydration by never-checked then oldest-checked inventory', () => {
  assert.match(migration, /add column if not exists last_hydrated_at timestamptz/);
  assert.match(migration, /add column if not exists hydrated_metadata_hash text/);
  assert.match(migration, /last_hydrated_at asc nulls first/);
});

test('installs the four staggered source schedules and removes the legacy job', () => {
  const expected = [
    ["first-look-moodys-reconcile", "1,31 * * * *"],
    ["first-look-deshaw-reconcile", "4,34 * * * *"],
    ["first-look-citi-watch", "7,37 * * * *"],
    ["first-look-citi-reconcile", "12 */2 * * *"],
  ];

  for (const [name, schedule] of expected) {
    assert.match(migration, new RegExp(`'${name}'[\\s\\S]*?'${schedule.replaceAll('*', '\\*')}'`));
  }
  assert.match(migration, /'first-look-scan-every-thirty-minutes'/);
});

test('reads scan credentials only from Vault and keeps the helper private', () => {
  assert.match(migration, /name = 'first_look_scan_url'/);
  assert.match(migration, /name = 'first_look_scan_token'/);
  assert.match(migration, /revoke all on function public\.invoke_first_look_scan/);
  assert.doesNotMatch(migration, /sk-or-|service_role\s*=|OPENROUTER_API_KEY\s*=/i);
});

test('repairs the job source identity index so PostgREST can infer the upsert conflict target', () => {
  assert.match(persistenceRepair, /drop index if exists public\.job_sources_external_identity_idx/i);
  assert.match(
    persistenceRepair,
    /create unique index job_sources_external_identity_idx\s+on public\.job_sources \(source_type, source_name, source_external_id\)/i,
  );
  assert.doesNotMatch(persistenceRepair, /where source_external_id is not null/i);
});

test('installs a locked ten-minute watchdog with bounded stale thresholds', () => {
  assert.match(watchdog, /pg_try_advisory_xact_lock/i);
  assert.match(watchdog, /max\(started_at\)[\s\S]*connector_id[\s\S]*run_type/i);
  assert.match(watchdog, /interval '50 minutes'/i);
  assert.match(watchdog, /interval '150 minutes'/i);
  assert.match(watchdog, /'first-look-scan-watchdog'[\s\S]*'\*\/10 \* \* \* \*'/i);
});

test('watchdog can recover every production scan group without embedding credentials', () => {
  for (const group of ['moodys-reconcile', 'deshaw-reconcile', 'citi-watch', 'citi-reconcile']) {
    assert.match(watchdog, new RegExp(`'${group}'`));
  }
  assert.match(watchdog, /invoke_first_look_scan/);
  assert.doesNotMatch(watchdog, /Bearer\s+|first_look_scan_token\s*=|sk-or-/i);
});

test('adds Goldman to the private scan helper, watchdog, and 30-minute schedule', () => {
  assert.match(goldmanSchedule, /'goldman-reconcile'/g);
  assert.match(goldmanSchedule, /goldman-sachs-official-india/);
  assert.match(goldmanSchedule, /'first-look-goldman-reconcile'[\s\S]*'9,39 \* \* \* \*'/);
  assert.doesNotMatch(goldmanSchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds BlackRock and Barclays to the private scan helper and staggered schedules', () => {
  for (const group of ['blackrock-watch', 'blackrock-reconcile', 'barclays-watch', 'barclays-reconcile']) {
    assert.match(talentBrewSchedule, new RegExp(`'${group}'`));
  }
  assert.match(talentBrewSchedule, /first-look-blackrock-watch[\s\S]*'11,41 \* \* \* \*'/);
  assert.match(talentBrewSchedule, /first-look-barclays-watch[\s\S]*'17,47 \* \* \* \*'/);
  assert.match(talentBrewSchedule, /blackrock-official-india/);
  assert.match(talentBrewSchedule, /barclays-official-india/);
  assert.match(talentBrewSchedule, /cron\.unschedule\(existing_job_id\)/);
  assert.doesNotMatch(talentBrewSchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds Razorpay to the private scan helper, watchdog, and staggered schedules', () => {
  assert.match(greenhouseSchedule, /'razorpay-watch'/g);
  assert.match(greenhouseSchedule, /'razorpay-reconcile'/g);
  assert.match(greenhouseSchedule, /razorpay-official-india/);
  assert.match(greenhouseSchedule, /first-look-razorpay-watch[\s\S]*'26,56 \* \* \* \*'/);
  assert.ok(greenhouseSchedule.includes("'29 */2 * * *'"));
  assert.doesNotMatch(greenhouseSchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds Workday staggered schedules and unschedules existing jobs', () => {
  for (const group of ['accenture-watch', 'pwc-reconcile', 'morningstar-watch']) {
    assert.match(workdaySchedule, new RegExp(`'${group}'`));
  }
  assert.match(workdaySchedule, /cron\.unschedule\(j\)/);
  assert.doesNotMatch(workdaySchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds Phase 2 Workday schedules for 5 companies', () => {
  for (const group of ['jpmorgan-watch', 'morgan-stanley-reconcile', 'siemens-watch']) {
    assert.match(workdayPhase2Schedule, new RegExp(`'${group}'`));
  }
  assert.match(workdayPhase2Schedule, /cron\.unschedule\(j\)/);
  assert.doesNotMatch(workdayPhase2Schedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds Firecrawl schedules for 7 companies', () => {
  for (const group of ['amazon-firecrawl-india-watch', 'deloitte-firecrawl-india-reconcile', 'icra-firecrawl-india-watch']) {
    assert.match(firecrawlSchedule, new RegExp(`'${group}'`));
  }
  assert.match(firecrawlSchedule, /cron\.unschedule\(j\)/);
  assert.doesNotMatch(firecrawlSchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds Groww and PhonePe Greenhouse schedules behind the private scan helper', () => {
  for (const group of ['groww-watch', 'groww-reconcile', 'phonepe-watch', 'phonepe-reconcile']) {
    assert.match(greenhousePhase2Schedule, new RegExp(`'${group}'`));
  }
  assert.match(greenhousePhase2Schedule, /invoke_first_look_greenhouse_scan/);
  assert.match(greenhousePhase2Schedule, /recover_stale_first_look_greenhouse_scans/);
  assert.match(greenhousePhase2Schedule, /first-look-groww-reconcile[\s\S]*'9 \*\/2 \* \* \*'/);
  assert.match(greenhousePhase2Schedule, /first-look-phonepe-reconcile[\s\S]*'11 \*\/2 \* \* \*'/);
  assert.doesNotMatch(greenhousePhase2Schedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds four bounded RCV Firecrawl waves behind the private scan helper', () => {
  for (const group of [
    'rcv-firecrawl-wave-1-watch', 'rcv-firecrawl-wave-2-watch',
    'rcv-firecrawl-wave-3-watch', 'rcv-firecrawl-wave-4-watch',
    'rcv-firecrawl-wave-1-reconcile', 'rcv-firecrawl-wave-2-reconcile',
    'rcv-firecrawl-wave-3-reconcile', 'rcv-firecrawl-wave-4-reconcile',
  ]) {
    assert.match(rcvFirecrawlSchedule, new RegExp(`'${group}'`));
  }
  assert.match(rcvFirecrawlSchedule, /invoke_first_look_rcv_firecrawl_scan/);
  assert.doesNotMatch(rcvFirecrawlSchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('adds structured RCV ATS schedules before the Firecrawl fallback', () => {
  for (const group of [
    'state-street-watch', 'northern-trust-reconcile', 'mastercard-watch',
    'visa-reconcile', 'factset-watch', 'bloomberg-reconcile',
    'paytm-watch', 'paytm-reconcile',
  ]) {
    assert.match(rcvAtsSchedule, new RegExp(`'${group}'`));
  }
  assert.match(rcvAtsSchedule, /invoke_first_look_rcv_ats_scan/);
  assert.match(rcvAtsSchedule, /cron\.unschedule\(j\)/);
  assert.doesNotMatch(rcvAtsSchedule, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});

test('disables unattended Firecrawl cron jobs by default', () => {
  assert.match(firecrawlQuotaGuard, /jobname like 'first-look-%firecrawl-%'/i);
  assert.match(firecrawlQuotaGuard, /cron\.unschedule\(j\)/i);
});

test('schedules quota-free official-page RCV waves separately from Firecrawl', () => {
  for (const group of [
    'rcv-official-page-wave-1-watch', 'rcv-official-page-wave-2-watch',
    'rcv-official-page-wave-3-watch', 'rcv-official-page-wave-4-watch',
    'rcv-official-page-wave-5-watch',
    'rcv-official-page-wave-1-reconcile', 'rcv-official-page-wave-2-reconcile',
    'rcv-official-page-wave-3-reconcile', 'rcv-official-page-wave-4-reconcile',
    'rcv-official-page-wave-5-reconcile',
  ]) assert.match(rcvOfficialPageSchedule, new RegExp(`'${group}'`));
  assert.match(rcvOfficialPageSchedule, /invoke_first_look_rcv_official_page_scan/);
  assert.doesNotMatch(rcvOfficialPageSchedule, /firecrawl/i);
});

test('push worker stores credentials in the RLS-locked secrets table, not Vault', () => {
  assert.match(pushOutbox, /create table if not exists public\.first_look_secrets/);
  assert.match(pushOutbox, /from public\.first_look_secrets/);
  assert.match(pushOutbox, /alter table public\.first_look_secrets enable row level security/);
  assert.doesNotMatch(pushOutbox, /vault\.decrypted_secrets|vault\.create_secret/i);
  assert.match(pushOutbox, /'first-look-push-worker'[\s\S]*'\*\/2 \* \* \* \*'/);
  assert.match(pushOutbox, /notification_outbox_job_id_unique/);
  assert.doesNotMatch(pushOutbox, /OPENROUTER_API_KEY\s*=|sk-or-/i);
});
