(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FirstLookCv = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TERM_GROUPS = {
    finance: ['financial analysis', 'financial modeling', 'financial reporting', 'financial statements', 'finance', 'accounting', 'audit', 'credit', 'risk', 'investment', 'investment research', 'equity research', 'portfolio', 'treasury', 'valuation', 'fund accounting', 'trade operations', 'reconciliation', 'capital markets', 'fp&a', 'budgeting', 'forecasting', 'variance analysis', 'ratio analysis', 'corporate finance', 'accounts payable', 'accounts receivable', 'bookkeeping', 'taxation', 'compliance', 'aml', 'kyc'],
    tools: ['Excel', 'SQL', 'Python', 'Power BI', 'Tableau', 'VBA', 'Bloomberg', 'Alteryx', 'R', 'SAS', 'SAP', 'Oracle', 'PowerPoint', 'MATLAB', 'C++', 'Java', 'AWS', 'Azure', 'GCP', 'Docker', 'Git'],
    business: ['stakeholder management', 'communication', 'presentation', 'project management', 'process improvement', 'business analysis', 'data analysis', 'research', 'reporting', 'operations', 'strategy'],
    credentials: ['MBA', 'PGDM', 'CFA', 'CA', 'CPA', 'FRM', 'ACCA', 'commerce', 'economics', 'finance degree', 'bachelor', 'master', 'degree'],
  };

  const TERM_ALIASES = {
    'financial modeling': ['financial modeling', 'financial modelling'],
    'financial analysis': ['financial analysis', 'financial analyst'],
    'financial reporting': ['financial reporting', 'financial reports'],
    'financial statements': ['financial statements', 'financial statement'],
    Excel: ['excel', 'ms excel', 'microsoft excel'],
    'Power BI': ['power bi', 'powerbi'],
    'PowerPoint': ['powerpoint', 'power point'],
    'data analysis': ['data analysis', 'data analytics'],
    'stakeholder management': ['stakeholder management', 'stakeholder communication'],
  };

  const ROLE_FAMILIES = [
    { id: 'fp-and-a', label: 'FP&A / planning', terms: ['fp&a', 'budgeting', 'forecasting', 'variance analysis', 'financial planning'] },
    { id: 'financial-analysis', label: 'financial analysis', terms: ['financial analyst', 'financial analysis', 'financial modeling', 'valuation'] },
    { id: 'accounting-operations', label: 'accounting / finance operations', terms: ['accounting', 'reconciliation', 'accounts payable', 'accounts receivable', 'bookkeeping', 'audit'] },
    { id: 'risk-credit', label: 'risk / credit', terms: ['credit', 'credit risk', 'risk analysis', 'underwriting', 'aml', 'kyc'] },
    { id: 'research-investments', label: 'research / investments', terms: ['investment research', 'equity research', 'portfolio', 'capital markets', 'investment'] },
  ];

  const SECTION_ALIASES = {
    summary: /^(?:professional )?summary|profile|objective|about me$/i,
    experience: /^(?:professional )?experience|work experience|employment|internship/i,
    education: /^education|academic background|qualifications/i,
    skills: /^(?:technical |core |key )?skills|technologies|competencies|tools/i,
    projects: /^projects?|selected projects|academic projects/i,
    certifications: /^certifications?|licenses/i,
    achievements: /^achievements?|awards?|honors?|leadership|positions? of responsibility/i,
  };

  const ACTION_VERBS = /\b(?:built|created|designed|developed|implemented|automated|analysed|analyzed|improved|reduced|increased|delivered|managed|led|coordinated|launched|researched|modelled|modeled|validated|optimised|optimized|supported|owned|streamlined|measured|trained)\b/i;
  const QUANTIFIED = /(?:\b\d+(?:\.\d+)?\s?%|[$₹€£]\s?[\d,]+|\b\d+(?:\.\d+)?\s?(?:x|users?|customers?|projects?|hours?|days?|months?|years?|items?|records?|pages?)\b|\b(?:million|thousand|crore|lakh)\b)/i;

  function text(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim(); }
  function normalize(value) { return text(value).toLowerCase().replace(/[^a-z0-9+#.&%/-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function unique(values) { return [...new Set(values.filter(Boolean))]; }
  function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function termVariants(term) { return TERM_ALIASES[term] || [term]; }
  function containsTerm(term, value) {
    const haystack = ` ${normalize(value)} `;
    return termVariants(term).some((variant) => {
      const needle = normalize(variant);
      return needle.length > 1 && haystack.includes(` ${needle} `);
    });
  }
  function linesOf(value) { return String(value || '').split(/\r?\n/).map(text).filter(Boolean); }
  function cleanRequirement(value) { return text(value).replace(/^[\u2022*\-\u2013\u2014\d.)]+\s*/, '').replace(/\s+/g, ' ').slice(0, 220); }
  function roleFamily(value) {
    return ROLE_FAMILIES.find((family) => family.terms.some((term) => containsTerm(term, value))) || { id: 'general-finance', label: 'finance / analyst', terms: [] };
  }

  function parseProfile(profile) {
    const lines = linesOf(profile);
    const sections = {};
    let current = 'other';
    lines.forEach((line) => {
      const heading = line.replace(/^#+\s*/, '').replace(/[:|]+$/, '').trim();
      const section = Object.entries(SECTION_ALIASES).find(([, pattern]) => pattern.test(heading))?.[0];
      if (section) current = section;
      if (!sections[current]) sections[current] = [];
      sections[current].push(line);
    });
    const all = lines.join('\n');
    const skills = unique(Object.values(TERM_GROUPS).flat().filter((term) => containsTerm(term, all)));
    const evidenceLines = lines.filter((line) => /^[-*•▪‣]/.test(line) || ACTION_VERBS.test(line));
    return {
      text: String(profile || '').trim(),
      lines,
      sections,
      words: normalize(profile).split(' ').filter(Boolean).length,
      skills,
      evidenceLines,
      quantifiedLines: lines.filter((line) => QUANTIFIED.test(line)),
      actionLines: lines.filter((line) => ACTION_VERBS.test(line)),
      email: (all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '',
      phone: (all.match(/(?:\+?\d[\d ()-]{8,}\d)/) || [])[0] || '',
      linkedin: /linkedin\.com\//i.test(all),
      dates: [...all.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0])),
    };
  }

  function scoreResume(profile) {
    const parsed = parseProfile(profile);
    if (!parsed.words) return { score: null, label: 'Not scoreable', parsed, checks: [], gaps: ['Add the resume text first.'] };
    const sectionsFound = Object.keys(parsed.sections).filter((key) => key !== 'other');
    const sectionScore = Math.min(25, Math.round((unique(sectionsFound).length / 4) * 25));
    const contentScore = Math.min(25, Math.round(Math.min(parsed.words / 450, 1) * 25));
    const evidenceScore = Math.min(20, Math.round((Math.min(parsed.actionLines.length, 8) / 8) * 12 + (Math.min(parsed.quantifiedLines.length, 4) / 4) * 8));
    const contactScore = Math.round((parsed.email ? 7 : 0) + (parsed.phone ? 5 : 0) + (parsed.linkedin ? 3 : 0));
    const atsScore = Math.min(15, Math.round((parsed.skills.length > 2 ? 7 : parsed.skills.length ? 4 : 0) + (parsed.sections.skills ? 4 : 0) + (parsed.sections.experience || parsed.sections.projects ? 4 : 0)));
    const score = Math.min(100, sectionScore + contentScore + evidenceScore + contactScore + atsScore);
    const gaps = [];
    if (!parsed.email || !parsed.phone) gaps.push('Keep email and phone as selectable text.');
    if (!parsed.sections.experience) gaps.push('Add a clearly labelled Experience section, even for internships.');
    if (!parsed.sections.skills) gaps.push('Add a clearly labelled Skills section with tools you genuinely use.');
    if (!parsed.quantifiedLines.length) gaps.push('Add measurable scope or outcomes where your evidence supports it.');
    if (parsed.words < 180) gaps.push('The resume text is very short; the score may understate the profile because evidence is missing.');
    const label = score >= 80 ? 'Strong text readiness' : score >= 60 ? 'Usable, with review points' : 'Needs evidence/structure work';
    return {
      score,
      label,
      parsed,
      checks: [
        { label: 'Readable text', value: parsed.words >= 80 ? 'Pass' : 'Thin', tone: parsed.words >= 80 ? 'good' : 'warn' },
        { label: 'Standard sections', value: `${sectionsFound.length} found`, tone: sectionsFound.length >= 3 ? 'good' : 'warn' },
        { label: 'Evidence bullets', value: `${parsed.actionLines.length} action lines`, tone: parsed.actionLines.length >= 3 ? 'good' : 'warn' },
        { label: 'Quantified evidence', value: parsed.quantifiedLines.length ? `${parsed.quantifiedLines.length} lines` : 'Not found', tone: parsed.quantifiedLines.length ? 'good' : 'warn' },
        { label: 'Contact text', value: parsed.email && parsed.phone ? 'Email + phone' : 'Incomplete', tone: parsed.email && parsed.phone ? 'good' : 'warn' },
      ],
      gaps,
      note: 'Heuristic ATS-readiness signal; it is not an employer ATS score or a hiring probability.',
    };
  }

  function coverLetterRequirement(description) {
    const value = text(description);
    if (!value) return { status: 'unknown', label: 'Posting text unavailable', evidence: '' };
    const match = value.match(/[^.\n]*(?:cover letter|covering letter|motivation letter|letter of motivation)[^.\n]*(?:[.]|$)/i);
    if (!match) return { status: 'not_mentioned', label: 'Not mentioned', evidence: '' };
    const sentence = text(match[0]);
    if (/\b(?:required|must|mandatory|please (?:submit|include|attach)|submit .*cover)/i.test(sentence)) return { status: 'required', label: 'Required/requested', evidence: sentence };
    if (/\boptional\b/i.test(sentence)) return { status: 'optional', label: 'Optional', evidence: sentence };
    return { status: 'mentioned', label: 'Mentioned - review posting', evidence: sentence };
  }

  function requirementTerms(value) {
    const normalized = normalize(value);
    const terms = unique(Object.values(TERM_GROUPS).flat().filter((term) => containsTerm(term, value)));
    const important = normalized.split(' ').filter((word) => word.length > 4 && !/^(about|which|these|those|their|there|should|would|could|other|where|while|using|years?|experience|skills?|ability|strong|working|knowledge|preferred|required|including|responsible|responsibilities)$/.test(word));
    return unique([...terms, ...important.slice(0, 5)]).slice(0, 8);
  }

  function extractRequirements(job) {
    const description = text(job?.description);
    const jobText = `${text(job?.title)}\n${description}`;
    const lines = linesOf(description).map(cleanRequirement).filter((line) => line.length > 12);
    const requirements = [];
    const add = (label, type, priority, source, terms, evidenceText = '') => {
      const cleaned = cleanRequirement(label);
      if (!cleaned || requirements.some((item) => normalize(item.label) === normalize(cleaned))) return;
      requirements.push({ id: `${type}-${requirements.length + 1}`, label: cleaned, type, priority, source, terms: unique(terms), evidenceText });
    };
    const signalTerms = [...TERM_GROUPS.finance, ...TERM_GROUPS.tools, ...TERM_GROUPS.business];
    unique(signalTerms.filter((term) => containsTerm(term, jobText))).forEach((term) => add(term, 'skill', 'signal', 'posting text', [term]));
    lines.filter((line) => /\b(?:must|required|minimum|qualification|proficiency|experience with|knowledge of|familiarity with|responsible for|responsibilities include)\b/i.test(line)).slice(0, 8).forEach((line) => add(line, /\b(?:must|required|minimum)\b/i.test(line) ? 'requirement' : 'responsibility', /\b(?:must|required|minimum)\b/i.test(line) ? 'required' : 'preferred', 'posting text', requirementTerms(line), line));
    const experience = jobText.match(/\b(?:minimum of |at least )?(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*years?\b|\b(\d+(?:\.\d+)?)\+\s*years?\b/i);
    if (experience) add(experience[0], 'experience', 'required', 'posting text', [experience[0]], experience[0]);
    const educationMatch = jobText.match(/\b(?:MBA|PGDM|bachelor[^,.;\n]*|master[^,.;\n]*|CFA|CA|CPA|FRM|degree[^,.;\n]*)\b/i);
    if (educationMatch || /\b(?:commerce|economics)\b/i.test(jobText)) add(educationMatch?.[0] || 'Education requirement', 'education', 'required', 'posting text', requirementTerms(educationMatch?.[0] || jobText));
    if (job?.location || /\b(?:India|Mumbai|Pune|Bengaluru|Bangalore|Hyderabad|Gurugram|Gurgaon|Delhi|Noida|Chennai|Kolkata)\b/i.test(jobText)) add(job.location || 'India location', 'location', 'context', 'source location', requirementTerms(job.location || 'India'));
    return { requirements: requirements.slice(0, 20), coverLetter: coverLetterRequirement(description), textAvailable: Boolean(description), sourceTextLength: description.length };
  }

  function evidenceFor(requirement, profile) {
    const parsed = profile && profile.lines ? profile : parseProfile(profile);
    if (requirement.priority === 'context') return { ...requirement, status: 'context', matches: [], excerpt: '' };
    const matches = requirement.terms.filter((term) => containsTerm(term, parsed.text));
    const excerpt = parsed.lines.find((line) => matches.some((term) => containsTerm(term, line))) || '';
    const exact = matches.length > 0 && (requirement.type === 'skill' || matches.length >= Math.min(2, requirement.terms.length));
    return { ...requirement, status: exact ? 'supported' : 'gap', matches, excerpt };
  }

  function matchJob(job, profile) {
    const parsed = profile && profile.lines ? profile : parseProfile(profile);
    const extraction = extractRequirements(job);
    const jobText = `${text(job?.title)}\n${text(job?.description)}`;
    const family = /\b(?:financial analyst|fp&a|accounting|credit|risk|investment|research)\b/i.test(text(job?.title)) ? roleFamily(text(job?.title)) : roleFamily(jobText);
    const mapped = extraction.requirements.map((requirement) => evidenceFor(requirement, parsed));
    const required = mapped.filter((item) => item.priority === 'required');
    const skills = mapped.filter((item) => item.type === 'skill');
    const supportedRequired = required.filter((item) => item.status === 'supported').length;
    const supportedSkills = skills.filter((item) => item.status === 'supported').length;
    const requiredCoverage = required.length ? supportedRequired / required.length : null;
    const skillCoverage = skills.length ? supportedSkills / skills.length : null;
    const titleTerms = requirementTerms(job?.title || '').filter((term) => term.length > 2);
    const titleCoverage = titleTerms.length ? titleTerms.filter((term) => containsTerm(term, parsed.text)).length / titleTerms.length : null;
    const financeTerms = TERM_GROUPS.finance.filter((term) => containsTerm(term, jobText));
    const profileFinanceTerms = TERM_GROUPS.finance.filter((term) => containsTerm(term, parsed.text));
    const financeRole = financeTerms.length > 0;
    const financeCoverage = financeRole ? (profileFinanceTerms.length ? 1 : 0) : null;
    const dimensions = [requiredCoverage, skillCoverage, titleCoverage, financeCoverage].filter((value) => value !== null);
    const score = dimensions.length ? Math.round((dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length) * 100) : null;
    const hardGaps = mapped.filter((item) => item.status === 'gap' && item.priority === 'required').slice(0, 8);
    if (financeRole && !profileFinanceTerms.length) hardGaps.unshift({ id: 'domain-finance', label: 'Finance-domain evidence', type: 'domain', priority: 'required', status: 'gap', matches: [], excerpt: '', source: 'posting domain', terms: financeTerms });
    const evidence = mapped.filter((item) => item.status === 'supported' && item.excerpt).slice(0, 8).map((item) => ({ term: item.label, excerpt: item.excerpt }));
    const missing = hardGaps.map((item) => item.label).slice(0, 8);
    const confidence = !parsed.words || !extraction.textAvailable ? 'low' : parsed.words >= 180 && extraction.sourceTextLength >= 300 ? 'high' : parsed.words >= 100 && extraction.sourceTextLength >= 100 ? 'medium' : 'low';
    const scoreable = Boolean(parsed.words && extraction.textAvailable);
    return { score: scoreable ? score : null, scoreable, confidence, roleFamily: family, requirements: mapped, evidence, missing, hardGaps, coverLetter: extraction.coverLetter, dimensions: { requiredCoverage, skillCoverage, titleCoverage, financeCoverage }, note: 'Evidence match only. It does not predict hiring, and unsupported requirements remain gaps.' };
  }

  function buildCoverLetter(job, analysis, profile) {
    if (!analysis || !['required', 'mentioned', 'optional'].includes(analysis.coverLetter?.status)) return '';
    const evidence = (analysis.evidence || []).filter((item, index, items) => items.findIndex((candidate) => candidate.excerpt === item.excerpt) === index).slice(0, 3);
    if (evidence.length < 2) return '';
    const terms = unique(evidence.map((item) => item.term).filter((term) => term !== 'finance')).slice(0, 3).join(', ');
    const lines = evidence.map((item) => `- ${item.excerpt}`).join('\n');
    const family = analysis.roleFamily?.label || 'finance / analyst';
    return `Dear Hiring Manager,\n\nI am applying for the ${text(job?.title) || 'open role'} position${job?.company ? ` at ${text(job.company)}` : ''}. I am targeting ${family} work, and the parts of the posting I can support from my profile are ${terms}.\n\nEvidence from my profile:\n${lines}\n\nI have kept this draft limited to experience and skills shown in my profile; it does not claim coverage of the requirements listed as gaps. I would welcome the opportunity to discuss how this background could contribute to the team.\n\nRegards,\n[Your name]\n\nReview before sending: verify each evidence line, replace the bracketed name, and remove any sentence that does not sound like you.`;
  }

  return { parseProfile, scoreResume, coverLetterRequirement, extractRequirements, matchJob, buildCoverLetter, termInText: containsTerm };
});
