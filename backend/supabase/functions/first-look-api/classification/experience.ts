import type { ExperienceStatus } from '../types.ts';

export interface ExperienceResult {
  status: Exclude<ExperienceStatus, 'unclassified'>;
  minimumYears: number | null;
  maximumYears: number | null;
  evidence: string[];
}

// Strict 0-2 band: only roles whose wording caps experience at 0, 1 or 2 years
// (or the month equivalent). Open-ended floors at or below two years ("at least
// 1", "1+", "at least 2", "2+") and explicit no-experience wording count as
// confirmed 0-2 for the public feed — a 0-2 year candidate satisfies them.
// Floors above two years ("at least 3", "3+") and unknown wording stay out.

const SENIOR_EXECUTIVE_TITLE = /\b(?:vice president|vp|avp|svp|assistant vice president|senior vice president|managing director|executive director|director|associate director|head of|chief [a-z]+ officer|partner|principal|senior manager)\b/i;
const ENTRY_LEVEL_PHRASE = /\b(?:freshers?|recent graduates?|new graduates?|campus hires?|early career|entry[- ]level|no\s+(?:(?:prior|previous|any|prior work)\s+)?experience\s+(?:is\s+)?(?:required|needed|necessary|expected)|zero years?(?: of experience)?|0 years?(?: of experience)?)\b/;
const MID_OR_SENIOR_PHRASE = /\b(?:mid[- ]level|seasoned(?: professional)?|highly experienced|extensive experience|substantial experience)\b/;
const YEAR_UNIT = String.raw`(?:years?|yrs?|yoe|months?)`;

export function parseExperience(input: string): ExperienceResult {
  const text = normalizeExperienceText(input);
  if (!text) return ambiguous([]);

  const seniorMatch = text.match(SENIOR_EXECUTIVE_TITLE)?.[0];
  if (seniorMatch) {
    return {
      status: 'over_two',
      minimumYears: 5,
      maximumYears: null,
      evidence: [seniorMatch],
    };
  }

  const midMatch = text.match(MID_OR_SENIOR_PHRASE)?.[0];
  if (midMatch) {
    return {
      status: 'over_two',
      minimumYears: 3,
      maximumYears: null,
      evidence: [midMatch],
    };
  }

  const preferred = findPreferredOnly(text);
  const requiredText = text.replace(/[^.!?;\n]*\b(?:preferred|desirable|nice to have)\b[^.!?;\n]*/g, ' ');
  const bounds = findRequiredBounds(requiredText);

  if (bounds.length === 0) {
    if (ENTRY_LEVEL_PHRASE.test(text)) {
      const evidence = text.match(ENTRY_LEVEL_PHRASE)?.[0];
      return zeroToTwo(0, 0, evidence ? [evidence] : []);
    }
    if (preferred) {
      return classifyPreferredOnly(preferred);
    }
    return ambiguous([]);
  }

  const hasOpenEnded = bounds.some((bound) => bound.minimum !== null && bound.maximum === null);
  const openFloorMinimum = openFloorMinimumOf(bounds);
  const hasOverTwo = bounds.some((bound) => exceedsTwo(bound.minimum) || exceedsTwo(bound.maximum));
  const hasAtMostTwo = bounds.some((bound) => bound.maximum !== null && bound.maximum <= 2
    && (bound.minimum === null || bound.minimum <= 2));
  const evidence = [...new Set(bounds.map((bound) => bound.evidence))];

  if (hasOpenEnded) {
    // A confirmed 0-2 cap beside an open floor above two ("0-2 years ... minimum
    // 4 years") is contradictory, not a clear senior requirement: ambiguous.
    if (hasOverTwo && hasAtMostTwo) return ambiguous(evidence);
    if (hasOverTwo) return overTwoResult(bounds, evidence);
    // Open floor above two years ("at least 3", "3+") is not a 0-2 target.
    if (openFloorMinimum !== null && openFloorMinimum > 2) return overTwoResult(bounds, evidence);
    // Open floor at or below two years ("at least 1", "1+", "at least 2", "2+")
    // qualifies: a candidate with 0-2 years satisfies the floor.
    const minimumYears = Math.max(minimumKnown(bounds) ?? 0, openFloorMinimum ?? 0);
    return zeroToTwo(minimumYears, maximumKnown(bounds), evidence);
  }

  if (hasOverTwo && hasAtMostTwo) return ambiguous(evidence);
  if (hasOverTwo) return overTwoResult(bounds, evidence);
  if (hasAtMostTwo) {
    const minimumYears = minimumKnown(bounds);
    const maximumYears = maximumKnown(bounds);
    if (!isWithinZeroToTwo(minimumYears, maximumYears)) return ambiguous(evidence);
    return zeroToTwo(minimumYears, maximumYears, evidence);
  }
  return ambiguous(evidence);
}

/** True only when both known bounds sit inside the inclusive 0-2 year band. */
export function isWithinZeroToTwo(minimumYears: number | null, maximumYears: number | null): boolean {
  if (minimumYears !== null && (minimumYears < 0 || minimumYears > 2)) return false;
  if (maximumYears !== null && (maximumYears < 0 || maximumYears > 2)) return false;
  if (minimumYears !== null && maximumYears !== null && minimumYears > maximumYears) return false;
  return true;
}

/** Serving-layer helper: only confirmed zero_to_two inside the 0-2 band. */
export function isStrictZeroToTwoExperience(result: ExperienceResult): boolean {
  return result.status === 'zero_to_two' && isWithinZeroToTwo(result.minimumYears, result.maximumYears);
}

function classifyPreferredOnly(preferred: string): ExperienceResult {
  const openEnded = /\d+(?:\.\d+)?\+\s*(?:years?|yrs?|yoe|months?)/.test(preferred);
  const preferredYears = preferredRangeYears(preferred);
  if (openEnded || preferredYears.some((value) => value > 2)) {
    return { status: 'over_two', minimumYears: null, maximumYears: null, evidence: [preferred] };
  }
  if (preferredYears.length > 0 && preferredYears.every((value) => value <= 2)) {
    const minimumYears = Math.min(...preferredYears);
    const maximumYears = Math.max(...preferredYears);
    return zeroToTwo(minimumYears, maximumYears, [preferred]);
  }
  return zeroToTwo(null, null, [preferred]);
}

function findRequiredBounds(text: string): Bound[] {
  const bounds: Bound[] = [];
  const consumed: Array<[number, number]> = [];

  collect(text, new RegExp(String.raw`\bup to\s+(\d+(?:\.\d+)?)\s*(${YEAR_UNIT})\b`, 'g'), (match) => ({
    minimum: 0,
    maximum: toYears(Number(match[1]), match[2]),
    evidence: match[0],
  }), bounds, consumed);

  collect(text, new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(${YEAR_UNIT})\b`, 'g'), (match) => ({
    minimum: toYears(Number(match[1]), match[3]),
    maximum: toYears(Number(match[2]), match[3]),
    evidence: match[0],
  }), bounds, consumed);

  collect(text, new RegExp(String.raw`\b(?:minimum(?: of)?|at least|more than|over)\s+(\d+(?:\.\d+)?)\+?\s*(${YEAR_UNIT})\b`, 'g'), (match) => {
    const kind = match[0];
    const value = toYears(Number(match[1]), match[2]);
    // "more than" / "over" is a floor strictly above the stated number.
    const minimum = /\b(?:more than|over)\b/.test(kind) ? value + 0.01 : value;
    return { minimum, maximum: null, evidence: match[0] };
  }, bounds, consumed);

  collect(text, new RegExp(String.raw`\b(\d+(?:\.\d+)?)\+\s*(${YEAR_UNIT})\b`, 'g'), (match) => ({
    minimum: toYears(Number(match[1]), match[2]),
    maximum: null,
    evidence: match[0],
  }), bounds, consumed);

  // "requires 5 years", "must have 3 years", "with 4 years experience"
  collect(text, new RegExp(String.raw`\b(?:requires?|must(?:\s+have|\s+possess)?|needs?|with|possess(?:es|ing)?)\s+(\d+(?:\.\d+)?)\s*(${YEAR_UNIT})\b`, 'g'), (match) => {
    const value = toYears(Number(match[1]), match[2]);
    return { minimum: value, maximum: value, evidence: match[0] };
  }, bounds, consumed);

  // "5 years of experience" / "3 yrs experience required"
  collect(text, new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*(${YEAR_UNIT})\b(?=[^.!?;\n]{0,40}\b(?:required|experience|needed|need|must|minimum|relevant)\b)`, 'g'), (match) => {
    const value = toYears(Number(match[1]), match[2]);
    return { minimum: value, maximum: value, evidence: match[0] };
  }, bounds, consumed);

  return bounds;
}

function collect(
  text: string,
  pattern: RegExp,
  makeBound: (match: RegExpExecArray) => Bound,
  bounds: Bound[],
  consumed: Array<[number, number]>,
): void {
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (consumed.some(([usedStart, usedEnd]) => start < usedEnd && end > usedStart)) continue;
    if (isCorporateHistoryPhrase(text, start, end)) continue;
    bounds.push(makeBound(match));
    consumed.push([start, end]);
  }
}

function isCorporateHistoryPhrase(text: string, start: number, end: number): boolean {
  const prefix = text.slice(Math.max(0, start - 24), start);
  if (!/\b(?:more than|over|nearly|almost|founded in|since)\s*$/i.test(prefix)
    && !/\b(?:more than|over)\s+\d/.test(text.slice(start, end))) {
    return false;
  }
  // Real requirements usually continue with experience/required wording.
  const suffix = text.slice(end, end + 40);
  if (/\b(?:experience|required|needed|relevant|in (?:finance|banking|accounting|audit|risk))\b/i.test(suffix)) {
    return false;
  }
  // Bare "more than 150 years" / "founded in 1869" style history.
  return true;
}

function findPreferredOnly(text: string): string | null {
  return text.match(new RegExp(String.raw`\b\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\+?\s*${YEAR_UNIT}[^.!?;\n]{0,20}\b(?:preferred|desirable|nice to have)\b`))?.[0] ?? null;
}

function preferredRangeYears(preferred: string): number[] {
  const match = preferred.match(new RegExp(String.raw`(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\+?\s*(${YEAR_UNIT})`));
  if (!match) return [];
  const unit = match[3];
  const values = [toYears(Number(match[1]), unit)];
  if (match[2]) values.push(toYears(Number(match[2]), unit));
  return values;
}

function normalizeExperienceText(input: string): string {
  const numberWords: Record<string, string> = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  };
  return input
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/â€“|â€”/g, '-')
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (word) => numberWords[word])
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toYears(value: number, unit: string): number {
  return unit.startsWith('month') ? value / 12 : value;
}

function exceedsTwo(value: number | null): boolean {
  return value !== null && value > 2;
}

function minimumKnown(bounds: Bound[]): number | null {
  const values = bounds.map((bound) => bound.minimum).filter((value): value is number => value !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

function maximumKnown(bounds: Bound[]): number | null {
  const values = bounds.map((bound) => bound.maximum).filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function zeroToTwo(minimumYears: number | null, maximumYears: number | null, evidence: string[]): ExperienceResult {
  return { status: 'zero_to_two', minimumYears, maximumYears, evidence };
}

function overTwoResult(bounds: Bound[], evidence: string[]): ExperienceResult {
  return {
    status: 'over_two',
    minimumYears: minimumKnown(bounds),
    maximumYears: maximumKnown(bounds),
    evidence,
  };
}

function openFloorMinimumOf(bounds: Bound[]): number | null {
  const values = bounds
    .filter((bound) => bound.maximum === null && bound.minimum !== null)
    .map((bound) => bound.minimum as number);
  return values.length > 0 ? Math.min(...values) : null;
}

function ambiguous(evidence: string[]): ExperienceResult {
  return { status: 'ambiguous', minimumYears: null, maximumYears: null, evidence };
}

interface Bound {
  minimum: number | null;
  maximum: number | null;
  evidence: string;
}
