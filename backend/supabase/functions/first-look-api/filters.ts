import type { Classification, NormalizedJob } from './types.ts';

const INDIA_WORDS = /\b(?:india|bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|chennai|noida|kolkata|ahmedabad)\b/i;
const FINANCE_WORDS = /\b(?:finance|financial|banking|investment|credit|ratings?|risk|treasury|valuation|accounting|audit|advisory|markets?|fp&a|corporate development|structured finance)\b/i;
const ACCEPTED_EXPERIENCE = /(?:\b0\s*(?:-|–|to)\s*[012]\s+years?\b|\bup\s+to\s+[012]\s+years?\b|\b[012]\s+years?\s+or\s+less\b|\bfreshers?\b|\bentry[- ]level\b|\bgraduate\s+(?:role|program(?:me)?|opportunit(?:y|ies))\b)/i;
const OVER_LIMIT_EXPERIENCE = /(?:\b(?:minimum|at\s+least)\s+(?:of\s+)?([3-9]|\d{2,})\+?\s+years?\b|\b([3-9]|\d{2,})\+\s+years?\b|\b([3-9]|\d{2,})\s*(?:-|–|to)\s*\d+\s+years?\b)/i;

export function classifyJob(job: NormalizedJob): Classification {
  if (!INDIA_WORDS.test(job.location)) return 'not_india';

  const financeText = `${job.title} ${job.jobCategory} ${job.description}`;
  if (!FINANCE_WORDS.test(financeText)) return 'not_finance';

  if (ACCEPTED_EXPERIENCE.test(job.experienceText)) return 'match';
  if (OVER_LIMIT_EXPERIENCE.test(job.experienceText)) return 'experience_over_limit';
  return 'experience_unknown';
}

