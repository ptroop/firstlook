import { classifyDeterministically } from './classification/deterministic.ts';
import type { Classification, NormalizedJob } from './types.ts';

export function classifyJob(job: NormalizedJob): Classification {
  const result = classifyDeterministically(job);
  if (result.locationStatus === 'not_india') return 'not_india';
  if (result.financeStatus === 'unrelated') return 'not_finance';
  if (result.experienceStatus === 'zero_to_two') return 'match';
  if (result.experienceStatus === 'over_two') return 'experience_over_limit';
  return 'experience_unknown';
}
