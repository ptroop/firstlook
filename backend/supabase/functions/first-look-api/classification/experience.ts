import type { ExperienceStatus } from '../types.ts';

export interface ExperienceResult {
  status: Exclude<ExperienceStatus, 'unclassified'>;
  minimumYears: number | null;
  maximumYears: number | null;
  evidence: string[];
}

const SENIOR_EXECUTIVE_TITLE = /\b(?:vice president|vp|avp|svp|assistant vice president|senior vice president|managing director|executive director|director|associate director|head of|chief [a-z]+ officer|partner|principal|senior manager)\b/i;

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

  const preferred = findPreferredOnly(text);
  const requiredText = text.replace(/[^.!?;\n]*\b(?:preferred|desirable|nice to have)\b[^.!?;\n]*/g, ' ');
  const bounds = findRequiredBounds(requiredText);

  if (bounds.length === 0) {
    if (/\b(?:freshers?|recent graduates?|entry level|no (?:prior|previous) experience (?:is )?required)\b/.test(text)) {
      const evidence = text.match(/\b(?:freshers?|recent graduates?|entry level|no (?:prior|previous) experience (?:is )?required)\b/)?.[0];
      return zeroToTwo(0, 0, evidence ? [evidence] : []);
    }
    if (preferred) return zeroToTwo(null, null, [preferred]);
    return ambiguous([]);
  }

  const hasOpenEndedAtOrBelowTwo = bounds.some((bound) => bound.minimum !== null
    && bound.minimum <= 2 && bound.maximum === null);
  const hasOverTwo = bounds.some((bound) => (bound.minimum ?? 0) > 2 || (bound.maximum ?? 0) > 2);
  const hasAtMostTwo = bounds.some((bound) => bound.maximum !== null && bound.maximum <= 2);
  const evidence = [...new Set(bounds.map((bound) => bound.evidence))];

  if ((hasOverTwo && hasAtMostTwo) || hasOpenEndedAtOrBelowTwo) return ambiguous(evidence);
  if (hasOverTwo) {
    return {
      status: 'over_two',
      minimumYears: minimumKnown(bounds),
      maximumYears: maximumKnown(bounds),
      evidence,
    };
  }
  if (hasAtMostTwo) return zeroToTwo(minimumKnown(bounds), maximumKnown(bounds), evidence);
  return ambiguous(evidence);
}

function findRequiredBounds(text: string): Bound[] {
  const bounds: Bound[] = [];
  const consumed: Array<[number, number]> = [];

  collect(text, /\bup to\s+(\d+(?:\.\d+)?)\s*(years?|months?)\b/g, (match) => ({
    minimum: 0,
    maximum: toYears(Number(match[1]), match[2]),
    evidence: match[0],
  }), bounds, consumed);
  collect(text, /\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(years?|months?)\b/g, (match) => ({
    minimum: toYears(Number(match[1]), match[3]),
    maximum: toYears(Number(match[2]), match[3]),
    evidence: match[0],
  }), bounds, consumed);
  collect(text, /\b(?:minimum(?: of)?|at least)\s+(\d+(?:\.\d+)?)\+?\s*(years?|months?)\b/g, (match) => ({
    minimum: toYears(Number(match[1]), match[2]),
    maximum: null,
    evidence: match[0],
  }), bounds, consumed);
  collect(text, /\b(\d+(?:\.\d+)?)\+\s*(years?|months?)\b/g, (match) => ({
    minimum: toYears(Number(match[1]), match[2]),
    maximum: null,
    evidence: match[0],
  }), bounds, consumed);
  collect(text, /\b(\d+(?:\.\d+)?)\s*(years?|months?)\b(?=[^.!?;\n]{0,30}\b(?:required|experience|needed|need|must|minimum)\b)/g, (match) => {
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
    if (isCorporateHistoryPhrase(text, start)) continue;
    bounds.push(makeBound(match));
    consumed.push([start, end]);
  }
}

function isCorporateHistoryPhrase(text: string, start: number): boolean {
  const prefix = text.slice(Math.max(0, start - 24), start);
  return /\b(?:more than|over|nearly|almost|founded in|since)\s*$/i.test(prefix);
}

function findPreferredOnly(text: string): string | null {
  return text.match(/\b\d+(?:\.\d+)?(?:\s*(?:-|to)\s*\d+(?:\.\d+)?)?\+?\s*(?:years?|months?)[^.!?;\n]{0,20}\b(?:preferred|desirable|nice to have)\b/)?.[0] ?? null;
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

function ambiguous(evidence: string[]): ExperienceResult {
  return { status: 'ambiguous', minimumYears: null, maximumYears: null, evidence };
}
