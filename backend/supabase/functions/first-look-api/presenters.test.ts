import test from 'node:test';
import assert from 'node:assert/strict';

import { presentJob } from './presenters.ts';

test('maps database job columns to the PWA contract', () => {
  assert.deepEqual(presentJob({
    source_company: "Moody's",
    apply_url: 'https://career8.successfactors.com/apply',
    title: 'Senior Financial Data Analyst',
    location: 'Bengaluru, India',
    description: 'Credit analysis',
    first_seen_at: '2026-08-03T00:00:00Z',
    posted_at: '2026-07-29T00:00:00Z'
  }), {
    company: "Moody's",
    applyUrl: 'https://career8.successfactors.com/apply',
    title: 'Senior Financial Data Analyst',
    location: 'Bengaluru, India',
    description: 'Credit analysis',
    firstSeenAt: '2026-08-03T00:00:00Z',
    postedAt: '2026-07-29T00:00:00Z'
  });
});
