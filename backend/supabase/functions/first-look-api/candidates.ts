import type {
  CandidateDecision,
  CandidateReason,
  InventoryListing,
} from './types.ts';

const FINANCE_METADATA = /\b(?:finance|financial|fp&a|financial planning|account(?:ing|s)?|audit|assurance|tax|treasury|controller|controllership|investment|banking|equity|credit|ratings?|valuation|m&a|mergers? and acquisitions?|capital markets?|asset management|wealth|private credit|private equity|securities|derivatives?|fixed income|pricing|underwriting|trading|trade support|fund administration|fund accounting|middle office|reconciliation|settlements?|collateral|portfolio reporting|risk|compliance|aml|kyc|regulatory reporting|transaction services|due diligence|restructuring|deals?)\b/i;
const EARLY_CAREER_TITLE = /\b(?:graduate|trainee|intern(?:ship)?|apprentice|analyst|associate|officer|executive|coordinator|specialist|consultant|advisor|researcher)\b/i;
const GENERIC_TITLE = /^(?:graduate|trainee|intern|apprentice|analyst|associate|officer|executive|coordinator|specialist|consultant|advisor|researcher)(?:\s+[ivx0-9]+)?$/i;
const EDUCATION_SIGNAL = /\b(?:mba|pgdm|chartered accountant|\bca\b|cfa|commerce|economics|finance|accounting)\b/i;
const STRONG_NON_FINANCE = /\b(?:software engineering|software development|software (?:engineer|developer)|java developer|python developer|data engineer|engineering|information technology|technology|cybersecurity|systems? analyst|human resources|people operations|talent acquisition|marketing|communications|graphic design|product design|facilities|workplace services|customer service)\b/i;
const MAX_REASONS = 12;

export interface CandidateContext {
  portalCorroborated?: boolean;
}

export function selectCandidate(
  listing: InventoryListing,
  context: CandidateContext = {},
): CandidateDecision {
  const reasons: CandidateReason[] = [];
  const metadata = [listing.title, listing.category, listing.department].filter(Boolean).join(' ');
  const rawMetadata = boundedJsonText(listing.rawMetadata);
  const titleIsStronglyNonFinance = STRONG_NON_FINANCE.test(listing.title);

  if (titleIsStronglyNonFinance) {
    return { status: 'defer', reasons: ['strong_non_finance_category'] };
  }

  if (FINANCE_METADATA.test(metadata)) reasons.push('finance_metadata');
  if (EARLY_CAREER_TITLE.test(listing.title)) reasons.push('early_career_title');
  if (GENERIC_TITLE.test(listing.title.trim())) reasons.push('generic_title');
  if (EDUCATION_SIGNAL.test(rawMetadata)) reasons.push('education_signal');
  if (context.portalCorroborated) reasons.push('portal_corroborated');
  if (isConnectorSpecificCandidate(listing)) reasons.push('connector_rule');

  const positiveReasons = uniqueBounded(reasons);
  if (positiveReasons.length > 0) {
    if (!listing.category?.trim()) reasons.push('missing_category');
    if (!listing.department?.trim()) reasons.push('missing_department');
    return { status: 'hydrate', reasons: uniqueBounded(reasons) };
  }

  if (!listing.category?.trim()) reasons.push('missing_category');
  if (!listing.department?.trim()) reasons.push('missing_department');
  const uncertaintyReasons = uniqueBounded(reasons);
  if (uncertaintyReasons.length > 0) return { status: 'hydrate', reasons: uncertaintyReasons };

  if (STRONG_NON_FINANCE.test(metadata)) return { status: 'defer', reasons: ['strong_non_finance_category'] };

  return { status: 'hydrate', reasons: ['insufficient_exclusion_evidence'] };
}

export function selectDeferredAudit(
  listings: InventoryListing[],
  options: { utcDate: string; limit: number },
): InventoryListing[] {
  const limit = Math.max(0, Math.floor(options.limit));
  return listings
    .filter((listing) => selectCandidate(listing).status === 'defer')
    .map((listing) => ({
      listing,
      score: stableHash(`${listing.connectorId}\u0000${listing.sourceExternalId}\u0000${options.utcDate}`),
    }))
    .sort((left, right) => left.score - right.score
      || left.listing.sourceExternalId.localeCompare(right.listing.sourceExternalId))
    .slice(0, limit)
    .map(({ listing }) => listing);
}

function isConnectorSpecificCandidate(listing: InventoryListing): boolean {
  if (listing.connectorId !== 'deshaw-official-india') return false;
  return /\banalyst\b/i.test(listing.title)
    || /\b(?:desis finance|financial operations|financial research|fresh graduate)\b/i.test(
      [listing.category, listing.department].filter(Boolean).join(' '),
    );
}

function uniqueBounded(reasons: CandidateReason[]): CandidateReason[] {
  return [...new Set(reasons)].slice(0, MAX_REASONS);
}

function boundedJsonText(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value).slice(0, 32_768);
  } catch {
    return '';
  }
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
