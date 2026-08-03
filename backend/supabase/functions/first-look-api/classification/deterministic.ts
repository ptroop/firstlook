import type { ClassificationMethod, ExperienceStatus, FinanceStatus, LocationStatus, MatchTier } from '../types.ts';
import { parseExperience } from './experience.ts';
import { classifyFinance, classifyLocation } from './taxonomy.ts';

export interface DeterministicJobInput {
  title: string;
  location: string;
  description: string;
  jobCategory: string;
  experienceText: string;
}

export interface DeterministicClassification {
  locationStatus: LocationStatus;
  financeStatus: FinanceStatus;
  experienceStatus: Exclude<ExperienceStatus, 'unclassified'>;
  minimumYears: number | null;
  maximumYears: number | null;
  matchTier: MatchTier;
  classificationMethod: ClassificationMethod;
  evidence: { location: string[]; finance: string[]; experience: string[] };
}

export function classifyDeterministically(input: DeterministicJobInput): DeterministicClassification {
  const location = classifyLocation(input.location);
  const finance = classifyFinance(input);
  const experience = parseExperience(`${input.experienceText}\n${input.description}`);
  return {
    locationStatus: location.status,
    financeStatus: finance.status,
    experienceStatus: experience.status,
    minimumYears: experience.minimumYears,
    maximumYears: experience.maximumYears,
    matchTier: composeMatchTier(location.status, finance.status, experience.status),
    classificationMethod: 'deterministic',
    evidence: { location: location.evidence, finance: finance.evidence, experience: experience.evidence },
  };
}

export function composeMatchTier(location: LocationStatus, finance: FinanceStatus, experience: ExperienceStatus): MatchTier {
  if (location === 'not_india' || finance === 'unrelated' || experience === 'over_two') return 'not_targeted';
  if (location === 'india' && finance === 'exact' && experience === 'zero_to_two') return 'exact';
  return 'possible';
}
