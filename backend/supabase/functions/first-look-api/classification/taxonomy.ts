import type { FinanceStatus, LocationStatus } from '../types.ts';

const INDIA = /\b(?:india|indian|andhra pradesh|arunachal pradesh|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal pradesh|jharkhand|karnataka|kerala|madhya pradesh|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|punjab|rajasthan|sikkim|tamil nadu|telangana|tripura|uttar pradesh|uttarakhand|west bengal|delhi|new delhi|ncr|bengaluru|bangalore|gurugram|gurgaon|mumbai|pune|hyderabad|chennai|noida|kolkata|ahmedabad|jaipur|kochi|cochin|thiruvananthapuram|trivandrum|vadodara|baroda|lucknow|chandigarh|indore|bhubaneswar|mysuru|mysore)\b/i;
const UNCERTAIN_REGION = /\b(?:remote|apac|asia|south asia|multiple locations?|hybrid)\b/i;
const EXPLICIT_NON_INDIA = /\b(?:united kingdom|uk|england|london|united states|usa|new york|canada|toronto|singapore|hong kong|australia|sydney|germany|frankfurt|ireland|dublin|poland|warsaw|philippines|manila|malaysia|kuala lumpur|uae|dubai)\b/i;

const EXACT_FINANCE_CONCEPTS = [
  /\bfp&a\b/i,
  /\bfinancial planning(?: and| &) analysis\b/i,
  /\b(?:finance|financial|accounting|audit|assurance|tax|treasury|controllership|controller)\b/i,
  /\b(?:investment banking|equity research|credit research|ratings?|valuation|m&a|mergers? and acquisitions?|capital markets?|asset management|wealth management|private credit|private equity)\b/i,
  /\b(?:securities|derivatives?|fixed income|equities|pricing|underwriting|trading|trade support)\b/i,
  /\b(?:fund accounting|fund administration|middle office|reconciliation|settlements?|collateral|portfolio reporting|investment operations|financial operations)\b/i,
  /\b(?:credit risk|market risk|operational risk|risk management|controls?|regulatory reporting|compliance|aml|kyc|trade monitoring|model validation)\b/i,
  /\b(?:transaction services|financial due diligence|restructuring|deals?|corporate development|financial advisory)\b/i,
];
const LIKELY_FINANCE = /\b(?:banking|investments?|markets?|portfolio|risk|regulatory|credit|economics|commerce|cfa|chartered accountant|\bca\b|mba|pgdm)\b/i;
const STRONG_NON_FINANCE_TITLE = /\b(?:software|java|python|javascript|typescript|golang|full[ -]?stack|developer|dev|programmer|engineer(?:ing)?|cloud|devops|cybersecurity|information technology|technology|technical support|network(?:ing)?|database administrator|data scientist|machine learning|artificial intelligence|ui|ux|frontend|backend|it quality|quality engineering|application development|systems? analyst|travel manager|human resources|\bhr\b|recruiter|talent acquisition|marketing|public relations|communications|legal|counsel|facilities|real estate|event manager|supply chain|logistics|procurement|nurse|security guard)\b/i;
const STRONG_NON_FINANCE_CATEGORY = /\b(?:technology|information technology|it|engineering|software development|application development|cybersecurity|quality engineering|data science)\b/i;
const GENERAL_APPLICATION = /\b(?:general,? exploratory application|without specifying a role|all positions in)\b/i;
const GENERIC_EMPLOYER_FINANCE = /\b(?:financial services?(?: industry)?|banking industry)\b/gi;

export function classifyLocation(location: string): { status: LocationStatus; evidence: string[] } {
  const indiaEvidence = location.match(INDIA)?.[0];
  if (indiaEvidence) return { status: 'india', evidence: [indiaEvidence] };
  if (UNCERTAIN_REGION.test(location) || !location.trim()) return { status: 'uncertain', evidence: [] };
  const nonIndiaEvidence = location.match(EXPLICIT_NON_INDIA)?.[0];
  if (nonIndiaEvidence) return { status: 'not_india', evidence: [nonIndiaEvidence] };
  return { status: 'uncertain', evidence: [] };
}

export function classifyFinance(input: { title: string; jobCategory: string; description: string }): { status: FinanceStatus; evidence: string[] } {
  if (GENERAL_APPLICATION.test(`${input.title} ${input.description}`)) return { status: 'unrelated', evidence: [] };
  const metadata = `${input.title} ${input.jobCategory}`;
  const metadataEvidence = EXACT_FINANCE_CONCEPTS
    .map((pattern) => metadata.match(pattern)?.[0])
    .filter((match): match is string => Boolean(match));
  if (STRONG_NON_FINANCE_TITLE.test(input.title)) return { status: 'unrelated', evidence: [] };
  if (metadataEvidence.length > 0) return { status: 'exact', evidence: [...new Set(metadataEvidence)] };
  if (STRONG_NON_FINANCE_CATEGORY.test(input.jobCategory)) return { status: 'unrelated', evidence: [] };

  const description = input.description.replace(GENERIC_EMPLOYER_FINANCE, '');
  const descriptionEvidence = EXACT_FINANCE_CONCEPTS
    .map((pattern) => description.match(pattern)?.[0])
    .filter((match): match is string => Boolean(match));
  if (descriptionEvidence.length > 0) return { status: 'exact', evidence: [...new Set(descriptionEvidence)] };
  const likely = `${metadata} ${description}`.match(LIKELY_FINANCE)?.[0];
  if (likely) return { status: 'likely', evidence: [likely] };
  return { status: 'unrelated', evidence: [] };
}

export function isStronglyNonFinanceTitle(title: string): boolean {
  return STRONG_NON_FINANCE_TITLE.test(title);
}
