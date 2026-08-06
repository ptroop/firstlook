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
  /\b(?:credit risk|market risk|operational risk|risk management|financial controls?|internal controls?|sox controls?|regulatory controls?|regulatory reporting|financial compliance|regulatory compliance|trade compliance|aml|kyc|sanctions?|financial crime|trade monitoring|model validation)\b/i,
  /\b(?:transaction services|financial due diligence|restructuring|deals?|corporate development|financial advisory)\b/i,
];
const LIKELY_FINANCE = /\b(?:banking|investments?|markets?|portfolio|risk|regulatory|credit|economics|commerce|cfa|chartered accountant|\bca\b|mba|pgdm)\b/i;
const STRONG_NON_FINANCE_TITLE = /(?:\b(?:software|java|python|javascript|typescript|golang|full[ -]?stack|developer|dev|programmer|engineer(?:ing)?|cloud|devops|cybersecurity|information technology|technology|technical support|network(?:ing)?|database administrator|data scientist|machine learning|artificial intelligence|frontend|backend|it quality|quality engineering|application development|systems? analyst|travel manager|human resources|\bhr\b|recruiter|talent acquisition|marketing|public relations|communications|legal|counsel|facilities|real estate|event manager|supply chain|logistics|procurement|nurse|security guard|sales|business development|customer success|customer service|customer support|account manager|product manager|product owner|product designer|designer|design|creative|brand|visual|recruitment|administrative|environmental|health and safety|\behs\b|safety)\b|\bui\b|\bux\b)/i;

// Serving-layer noise: titles that are clearly not 0-2 year finance-analyst
// work even though the employer is a bank or fintech. Kept separate from the
// finance classifier so the DB classification stays conservative while the
// public feed drops collections, tele-sales, field roles, IT and admin noise.
const NON_FINANCE_TITLE_NOISE = /(?:\b(?:tele ?caller|telesales|collections|loan recovery|recovery agent|growth management|dgm|voice ?over|voice of customer|voc|content (?:creator|strategy)|customer experience|campaign operations|admin ?& operations|administrative assistant|helpdesk|vendor onboarding|personal assistant|executive assistant|talent management|human capital|tech ops|strats|chat process|digital analyst|digitalization|digital operations|digital client services|product delivery|product operations|demand planner|replenishment planner|computational|data science researcher|media analytics|information management|data management|data governance|data strategy|quality analyst|test analyst|testing|sap|abap|employee central|enterprise apps|architect|itsm|itam|servicenow|hardware asset management|identity and access management|digital privacy|digigov|request for proposal|vendor management|performance & reward|reward analyst|security specialist|aiml|agentic|intelligence automation|automation|sapco|ofsaa|epm|video)\b|\boracle (?:epm|ofsaa|cloud|fusion)\b|\bai\s*\/\s*ml\b|\bapplied ai\b|\bqa\b|\bccm\b)/i;

// Senior bands that never belong in a strict 0-2 year feed. "Senior Financial
// Data Analyst" (a verified entry-level Moody's title) intentionally does not
// match because the words are not contiguous.
const SENIOR_TITLE_NOISE = /(?:\b(?:senior specialist|senior accountant|senior consultant|senior quantitative|senior product|senior member|senior internal auditor|senior executive|senior business analyst|managing consultant|team leader|people leader|deputy manager|vice president|vp|avp|svp|assistant vice president|senior vice president|managing director|executive director|associate director|director|head of|chief [a-z]+ officer|partner|principal|senior manager|lead manager|group manager|assistant manager|senior analyst|senior associate|lead analyst|manager|team lead|mgr)\b|\b(?:dm\s*\/\s*am\s*\/\s*se)\b|\bsr\.?\s+(?:analyst|associate|specialist|accountant|consultant|manager|quality|product)\b|\blead\b)/i;

// Parsing artifacts and exploratory application pages, not vacancies.
const GARBAGE_TITLE = /^(?:about the team|responsibilities|qualifications|india|team member|german,? ?nct|csg laf|prospect application for future jobs|all positions in)$/i;

// Titles from ATS feeds frequently join path segments with underscores
// ("IN_Manager_Employee Central_SAP"). Underscores are word characters, so
// word-boundary checks would silently miss them; normalize to spaces first.
function normalizedTitle(title: string): string {
  return String(title || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isNonFinanceTitle(title: string): boolean {
  const value = normalizedTitle(title);
  return STRONG_NON_FINANCE_TITLE.test(value) || NON_FINANCE_TITLE_NOISE.test(value);
}

export function isSeniorTitle(title: string): boolean {
  return SENIOR_TITLE_NOISE.test(normalizedTitle(title));
}

export function isGarbageTitle(title: string): boolean {
  return GARBAGE_TITLE.test(title.trim());
}

export function isNoiseTitle(title: string): boolean {
  return isNonFinanceTitle(title) || isSeniorTitle(title) || isGarbageTitle(title);
}
const STRONG_NON_FINANCE_CATEGORY = /\b(?:technology|information technology|it|engineering|software development|application development|cybersecurity|quality engineering|data science|sales|business development|customer success|customer service|human resources|marketing|legal|product management|procurement)\b/i;
const GENERAL_APPLICATION = /\b(?:general,? exploratory application|without specifying a role|all positions in|prospect application for future jobs)\b/i;
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
