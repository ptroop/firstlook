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
