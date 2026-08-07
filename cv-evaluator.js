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
    {
      id: 'fp-and-a', label: 'FP&A / planning', terms: ['fp&a', 'budgeting', 'forecasting', 'variance analysis', 'financial planning'],
      letter: 'I am interested in this FP&A / planning role. My profile shows financial planning, budgeting, forecasting and variance-analysis work that maps to the responsibilities listed.',
    },
    {
      id: 'financial-analysis', label: 'financial analysis', terms: ['financial analyst', 'financial analysis', 'financial modeling', 'valuation'],
      letter: 'I am interested in this financial analysis role. My profile shows financial analysis, financial modeling and reporting work that maps to the responsibilities listed.',
    },
    {
      id: 'accounting-operations', label: 'accounting / finance operations', terms: ['accounting', 'reconciliation', 'accounts payable', 'accounts receivable', 'bookkeeping', 'audit'],
      letter: 'I am interested in this accounting and finance-operations role. My profile shows reconciliation, bookkeeping and control work that maps to the responsibilities listed.',
    },
    {
      id: 'risk-credit', label: 'risk / credit', terms: ['credit', 'credit risk', 'risk analysis', 'underwriting', 'aml', 'kyc'],
      letter: 'I am interested in this risk and credit role. My profile shows credit, risk and compliance work that maps to the responsibilities listed.',
    },
    {
      id: 'research-investments', label: 'research / investments', terms: ['investment research', 'equity research', 'portfolio', 'capital markets', 'investment'],
      letter: 'I am interested in this research and investments role. My profile shows investment research, portfolio and capital-markets work that maps to the responsibilities listed.',
    },
  ];

  // Stable content-derived bullet IDs so profile versions can be diffed and
  // cover-letter evidence lines can reference the exact profile line they
  // came from.
  function simpleHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function bulletId(line) {
    return `b${simpleHash(normalize(line))}`;
  }

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
    const displayName = lines.slice(0, 5).find((line) => {
      const value = text(line);
      return value && !/@/.test(value) && !/\d{7,}/.test(value)
        && !Object.values(SECTION_ALIASES).some((pattern) => pattern.test(value));
    }) || '';
    const skills = unique(Object.values(TERM_GROUPS).flat().filter((term) => containsTerm(term, all)));
    const evidenceLines = lines.filter((line) => /^[-*•▪‣]/.test(line) || ACTION_VERBS.test(line));
    // Every line gets a stable content-derived bullet ID so a cover-letter
    // draft can cite the exact profile line it quotes and profile versions
    // can be diffed by ID.
    const bullets = lines.map((line) => ({ id: bulletId(line), text: line, isEvidence: /^[-*•▪‣]/.test(line) || ACTION_VERBS.test(line) }));
    return {
      text: String(profile || '').trim(),
      displayName,
      lines,
      sections,
      words: normalize(profile).split(' ').filter(Boolean).length,
      skills,
      evidenceLines,
      quantifiedLines: lines.filter((line) => QUANTIFIED.test(line)),
      actionLines: lines.filter((line) => ACTION_VERBS.test(line)),
      bullets,
      bulletById: new Map(bullets.map((bullet) => [bullet.id, bullet])),
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
    const evidence = mapped.filter((item) => item.status === 'supported' && item.excerpt).slice(0, 8).map((item) => ({ term: item.label, excerpt: item.excerpt, bulletId: parsed.bulletById ? (() => { const match = parsed.lines.find((line) => item.excerpt && normalize(line) === normalize(item.excerpt)); return match ? bulletId(match) : null; })() : null }));
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
    const lines = evidence.map((item) => (/^[-*•▪‣]/.test(item.excerpt) ? item.excerpt : `- ${item.excerpt}`)).join('\n');
    const familyTemplate = ROLE_FAMILIES.find((family) => family.id === analysis.roleFamily?.id);
    const familyLabel = familyTemplate?.id === 'risk-credit' ? 'risk and credit' : (familyTemplate?.label || 'finance / analyst');
    const bulletRefs = evidence.map((item) => item.bulletId ? `(profile line ${item.bulletId})` : '').filter(Boolean).join(' ');
    const parsed = profile && profile.lines ? profile : parseProfile(profile);
    const opening = terms
      ? `My profile contains documented evidence relevant to this ${familyLabel} role, including ${terms}.`
      : `My profile contains documented evidence relevant to this ${familyLabel} role.`;
    const name = parsed.displayName || '[Your name]';
    return `Dear Hiring Manager,\n\nPlease consider my application for the ${text(job?.title) || 'open role'} position${job?.company ? ` at ${text(job.company)}` : ''}. ${opening}\n\nRelevant evidence from my profile${bulletRefs ? ` ${bulletRefs}` : ''}:\n${lines}\n\nI would welcome the opportunity to discuss how this documented experience could support the team.\n\nThank you for your consideration.\n\nRegards,\n${name}`;
  }

  // Tailored CV export is selection and ordering only. It never rewrites a
  // profile bullet or adds a claim; the target-role line is explicit metadata.
  function buildTailoredProfile(job, analysis, profile) {
    const parsed = profile && profile.lines ? profile : parseProfile(profile);
    const selectedIds = new Set((analysis?.evidence || []).map((item) => item.bulletId).filter(Boolean));
    const output = [];
    let currentSection = 'other';
    const firstHeadingIndex = parsed.lines.findIndex((line) => {
      const heading = line.replace(/^#+\s*/, '').replace(/[:|]+$/, '').trim();
      return Object.values(SECTION_ALIASES).some((pattern) => pattern.test(heading));
    });
    parsed.lines.forEach((line, index) => {
      const heading = line.replace(/^#+\s*/, '').replace(/[:|]+$/, '').trim();
      const section = Object.entries(SECTION_ALIASES).find(([, pattern]) => pattern.test(heading))?.[0];
      if (section) currentSection = section;
      const keepContact = index < (firstHeadingIndex >= 0 ? firstHeadingIndex : Math.min(parsed.lines.length, 5));
      const keepStructured = ['education', 'skills', 'certifications'].includes(currentSection);
      const keepEvidence = selectedIds.has(bulletId(line));
      if (section) {
        const laterHasContent = parsed.lines.slice(index + 1).some((candidate) => {
          const candidateId = bulletId(candidate);
          return selectedIds.has(candidateId) || ['education', 'skills', 'certifications'].includes(currentSection);
        });
        if (laterHasContent || keepStructured) output.push(line);
      } else if (keepContact || keepEvidence || keepStructured) {
        output.push(line);
      }
    });
    const target = text(job?.title);
    const header = target ? `Target role: ${target}${job?.company ? ` at ${text(job.company)}` : ''}` : 'Tailored profile';
    return {
      text: `${header}\n\n${output.join('\n')}`.trim(),
      selectedBulletIds: [...selectedIds],
      includedLineCount: output.length,
      note: 'Original profile lines selected and reordered locally; no bullet text was generated or rewritten.',
    };
  }

  // Verifier: proves every evidence line in a draft exists verbatim in the
  // profile, so a draft cannot quietly invent credentials. Returns the bullet
  // IDs that failed so the human review gate can surface them.
  function verifyCoverLetter(draft, profile) {
    const parsed = profile && profile.lines ? profile : parseProfile(profile);
    const clean = (line) => text(line).replace(/^[-*•▪‣]\s*/, '').replace(/\s+$/, '');
    const draftLines = linesOf(draft).map(clean);
    const profileSet = new Set(parsed.lines.map((line) => normalize(clean(line))));
    const verified = [];
    const unverified = [];
    const templateMarkers = /(?:^|\s)(?:dear hiring manager|please consider my application for the|my profile contains documented evidence|relevant evidence from my profile|i would welcome the opportunity|thank you for your consideration|regards|profile line b[0-9a-f]+|\[your name\])(?:$|[.,;:\s])/i;
    draftLines.forEach((line) => {
      if (!line) return;
      if (templateMarkers.test(line)) { verified.push(line); return; }
      if (parsed.displayName && normalize(clean(line)) === normalize(parsed.displayName)) { verified.push(line); return; }
      if (profileSet.has(normalize(clean(line)))) { verified.push(line); return; }
      unverified.push(line);
    });
    return { ok: unverified.length === 0, verified, unverified, totalLines: draftLines.length };
  }

  // ATS-safe DOCX builder: minimal OOXML with a stored-entry ZIP writer so the
  // document opens in Word, LibreOffice and Google Docs without any library.
  // Paragraphs carry real text runs (no text boxes or images) so a parser can
  // read the document the same way a human does.
  function buildDocx({ profile, coverLetter, job, filename = 'first-look-application' }) {
    const name = job?.company || job?.title || 'Application';
    const subject = job?.title || 'finance role';
    const paragraphs = [];
    if (coverLetter) {
      paragraphs.push({ text: `Cover letter - ${subject}${job?.company ? ` at ${job.company}` : ''}`, heading: true });
      linesOf(coverLetter).forEach((line) => paragraphs.push({ text: line }));
      paragraphs.push({ text: '' });
    }
    paragraphs.push({ text: 'Profile / resume', heading: true });
    linesOf(profile).forEach((line) => paragraphs.push({ text: line, bullet: /^[-*•▪‣]/.test(line) }));
    return {
      filename: `${filename.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'application'}.docx`,
      blob: zipStore({ document: paragraphs, name, subject }),
      wordCount: paragraphs.reduce((sum, paragraph) => sum + paragraph.text.split(/\s+/).filter(Boolean).length, 0),
    };
  }

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function xmlEscape(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function zipStore({ document, name, subject }) {
    const encoder = new TextEncoder();
    const zipNow = new Date();
    const dosTime = ((zipNow.getHours() << 11) | (zipNow.getMinutes() << 5) | (Math.floor(zipNow.getSeconds() / 2))) & 0xFFFF;
    const dosDate = (((zipNow.getFullYear() - 1980) << 9) | ((zipNow.getMonth() + 1) << 5) | zipNow.getDate()) & 0xFFFF;
    const bodyXml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      ...document.map((paragraph) => {
        const props = paragraph.bullet ? '<w:pPr><w:ind w:left="360"/></w:pPr>' : '';
        const run = paragraph.heading
          ? '<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">' + xmlEscape(paragraph.text || ' ') + '</w:t></w:r>'
          : paragraph.bullet
            ? '<w:r><w:t xml:space="preserve">• ' + xmlEscape(paragraph.text.replace(/^[-*•▪‣]\s*/, '')) + '</w:t></w:r>'
            : '<w:r><w:t xml:space="preserve">' + xmlEscape(paragraph.text || ' ') + '</w:t></w:r>';
        return '<w:p>' + props + run + '</w:p>';
      }),
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
    ].join('');
    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${xmlEscape(name)} - ${xmlEscape(subject)}</dc:title><dc:subject>${xmlEscape(subject)}</dc:subject></cp:coreProperties>`;
    const appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>First Look local monitor</Application></Properties>';
    const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    const files = [
      { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
      { path: '_rels/.rels', data: encoder.encode(relsXml) },
      { path: 'word/document.xml', data: encoder.encode(bodyXml) },
      { path: 'word/_rels/document.xml.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>') },
      { path: 'docProps/core.xml', data: encoder.encode(coreXml) },
      { path: 'docProps/app.xml', data: encoder.encode(appXml) },
    ];
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach(({ path, data }) => {
      const nameBytes = encoder.encode(path);
      const crc = crc32(data);
      const localHeader = new Uint8Array(30);
      localHeader[0] = 0x50; localHeader[1] = 0x4B; localHeader[2] = 0x03; localHeader[3] = 0x04;
      localHeader[4] = 20; localHeader[5] = 0;
      localHeader[6] = 0; localHeader[7] = 0;
      localHeader[8] = 0; localHeader[9] = 0;
      localHeader[10] = dosTime & 0xFF; localHeader[11] = dosTime >> 8;
      localHeader[12] = dosDate & 0xFF; localHeader[13] = dosDate >> 8;
      localHeader[14] = crc & 0xFF; localHeader[15] = (crc >> 8) & 0xFF; localHeader[16] = (crc >> 16) & 0xFF; localHeader[17] = (crc >> 24) & 0xFF;
      localHeader[18] = data.length & 0xFF; localHeader[19] = (data.length >> 8) & 0xFF; localHeader[20] = (data.length >> 16) & 0xFF; localHeader[21] = (data.length >> 24) & 0xFF;
      localHeader[22] = data.length & 0xFF; localHeader[23] = (data.length >> 8) & 0xFF; localHeader[24] = (data.length >> 16) & 0xFF; localHeader[25] = (data.length >> 24) & 0xFF;
      localHeader[26] = nameBytes.length & 0xFF; localHeader[27] = nameBytes.length >> 8;
      localHeader[28] = 0; localHeader[29] = 0;
      chunks.push(localHeader, nameBytes, data);
      central.push({ path, nameBytes, data, crc, offset });
      offset += 30 + nameBytes.length + data.length;
    });
    const centralDirectory = [];
    let centralOffset = 0;
    central.forEach(({ path, nameBytes, data, crc, offset: localOffset }) => {
      const header = new Uint8Array(46);
      header[0] = 0x50; header[1] = 0x4B; header[2] = 0x01; header[3] = 0x02;
      header[4] = 20; header[5] = 0;
      header[6] = 20; header[7] = 0;
      header[8] = 0; header[9] = 0;
      header[10] = 0; header[11] = 0;
      header[12] = dosTime & 0xFF; header[13] = dosTime >> 8;
      header[14] = dosDate & 0xFF; header[15] = dosDate >> 8;
      header[16] = crc & 0xFF; header[17] = (crc >> 8) & 0xFF; header[18] = (crc >> 16) & 0xFF; header[19] = (crc >> 24) & 0xFF;
      header[20] = data.length & 0xFF; header[21] = (data.length >> 8) & 0xFF; header[22] = (data.length >> 16) & 0xFF; header[23] = (data.length >> 24) & 0xFF;
      header[24] = data.length & 0xFF; header[25] = (data.length >> 8) & 0xFF; header[26] = (data.length >> 16) & 0xFF; header[27] = (data.length >> 24) & 0xFF;
      header[28] = nameBytes.length & 0xFF; header[29] = nameBytes.length >> 8;
      header[30] = 0; header[31] = 0;
      header[32] = 0; header[33] = 0;
      header[34] = 0; header[35] = 0;
      header[36] = 0; header[37] = 0;
      header[38] = 0; header[39] = 0; header[40] = 0; header[41] = 0;
      header[42] = localOffset & 0xFF; header[43] = (localOffset >> 8) & 0xFF; header[44] = (localOffset >> 16) & 0xFF; header[45] = (localOffset >> 24) & 0xFF;
      centralDirectory.push(header, nameBytes);
      centralOffset += 46 + nameBytes.length;
    });
    const eocd = new Uint8Array(22);
    eocd[0] = 0x50; eocd[1] = 0x4B; eocd[2] = 0x05; eocd[3] = 0x06;
    eocd[4] = 0; eocd[5] = 0;
    eocd[6] = 0; eocd[7] = 0;
    eocd[8] = central.length & 0xFF; eocd[9] = central.length >> 8;
    eocd[10] = central.length & 0xFF; eocd[11] = central.length >> 8;
    eocd[12] = centralOffset & 0xFF; eocd[13] = (centralOffset >> 8) & 0xFF; eocd[14] = (centralOffset >> 16) & 0xFF; eocd[15] = (centralOffset >> 24) & 0xFF;
    eocd[16] = offset & 0xFF; eocd[17] = (offset >> 8) & 0xFF; eocd[18] = (offset >> 16) & 0xFF; eocd[19] = (offset >> 24) & 0xFF;
    eocd[20] = 0; eocd[21] = 0;
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0) + eocd.length;
    const output = new Uint8Array(total);
    let position = 0;
    chunks.concat(centralDirectory, [eocd]).forEach((chunk) => { output.set(chunk, position); position += chunk.length; });
    if (typeof Blob !== 'undefined') {
      return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    return output;
  }

  return { parseProfile, scoreResume, coverLetterRequirement, extractRequirements, matchJob, buildCoverLetter, buildTailoredProfile, verifyCoverLetter, buildDocx, termInText: containsTerm };
});
