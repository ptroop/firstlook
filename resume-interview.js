(function initResumeInterview(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FirstLookResumeInterview = api;
})(typeof window !== 'undefined' ? window : globalThis, function createResumeInterview() {
  const STORAGE_KEY = 'first-look-resume-interview-v1';
  const SCHEMA_VERSION = 1;
  const MAX_TEXT = 4000;
  const MAX_ARRAY_ITEMS = 6;

  const questionGroups = [
    {
      id: 'target',
      label: 'Target',
      intro: 'A resume is only useful relative to the roles you want next. Pick a direction, then add a posting when you want a role-specific version.',
      questions: [
        {
          id: 'targetRoles',
          type: 'checkboxes',
          label: 'Which role families are you applying for? Pick up to three.',
          help: 'Choose the closest honest categories. This is used for tailoring and role ranking, not as a claim on the resume.',
          options: ['Financial analysis / FP&A', 'Credit / risk', 'Investment / equity research', 'Accounting / finance operations', 'Valuation / corporate development', 'Other adjacent finance role'],
          maxChoices: 3,
          recommended: true,
        },
        {
          id: 'targetLevel',
          type: 'select',
          label: 'What opportunity level are you targeting?',
          help: 'Select the level you would actually apply to today.',
          options: ['Internship', 'Graduate / campus role', 'Entry-level / analyst', '0-2 years experience', 'Experienced hire', 'Not decided'],
        },
        {
          id: 'targetLocation',
          type: 'textarea',
          label: 'Where can you work, and what are your practical constraints?',
          help: 'Mention cities, remote or hybrid preference, relocation, work authorization, and joining availability only if relevant. Do not add a home address.',
        },
        {
          id: 'targetJobDescription',
          type: 'textarea',
          label: 'Do you have one target job description to tailor against?',
          help: 'Paste the posting text or the relevant requirements. Leave blank for a general master profile; do not paste confidential employer data.',
        },
      ],
    },
    {
      id: 'context',
      label: 'Candidate context',
      intro: 'The parser can find headings and dates, but it cannot reliably know which context a recruiter needs to understand your work.',
      questions: [
        {
          id: 'educationContext',
          type: 'textarea',
          label: 'What education should be represented accurately?',
          help: 'Degree, specialization, institution, expected graduation, relevant coursework, academic distinction, or certification. Include only facts you want shown.',
        },
        {
          id: 'leadExperience',
          type: 'textarea',
          label: 'Which one or two experiences should lead the story?',
          help: 'Give the employer or project, title or role, dates, what it was, and your personal responsibility. Internship, academic project, leadership, volunteer, and paid work can all count when relevant.',
          recommended: true,
        },
        {
          id: 'projectContext',
          type: 'textarea',
          label: 'Which project deserves a place, and what was its outcome?',
          help: 'Include the problem, your contribution, tools or data, who used or reviewed it, outcome, and a public link if one exists.',
        },
        {
          id: 'skillsEvidence',
          type: 'textarea',
          label: 'Which skills are proven in your work, and which are only coursework or learning?',
          help: 'Separate tools you used to produce something from tools you only studied. This keeps the skills section defensible.',
        },
      ],
    },
    {
      id: 'evidence',
      label: 'Evidence interview',
      intro: 'For the strongest experience, answer the questions behind a credible bullet. Exact numbers are ideal, ranges are acceptable, and “unknown” is better than a made-up metric.',
      questions: [
        {
          id: 'personalContribution',
          type: 'textarea',
          label: 'What did you personally do, decide, build, analyze, or improve?',
          help: 'Describe your contribution, not only the team’s result. Use plain language first; the resume wording comes later.',
          recommended: true,
        },
        {
          id: 'impactOutcome',
          type: 'textarea',
          label: 'What changed because of that work?',
          help: 'Think about the “so what”: a decision enabled, risk reduced, time saved, revenue or cost affected, accuracy improved, process made faster, or people served.',
          recommended: true,
        },
        {
          id: 'scopeMetric',
          type: 'textarea',
          label: 'What scale or measurement can you defend?',
          help: 'Consider ₹ value, %, records, customers, portfolio size, turnaround time, error rate, team size, countries, or frequency. State exact, approximate, range, or “no defensible metric”.',
          recommended: true,
        },
        {
          id: 'toolsAndMethods',
          type: 'textarea',
          label: 'Which tools, methods, or finance concepts did you actually use there?',
          help: 'Name Excel functions, SQL, Python, Power BI, financial modeling, valuation, accounting, risk methods, or other tools only where they were used in the work.',
        },
        {
          id: 'evidenceSource',
          type: 'textarea',
          label: 'How could you verify or explain this claim in an interview?',
          help: 'A report, project link, dashboard, repository, manager or client feedback, work sample, or a clear explanation is useful. Links are optional and stay on this device.',
        },
        {
          id: 'safeDisclosure',
          type: 'textarea',
          label: 'What must be anonymized or kept confidential?',
          help: 'Give safe substitutions such as “large listed bank” or a percentage/range. Never paste passwords, customer data, internal documents, or non-public employer information.',
        },
      ],
    },
    {
      id: 'guardrails',
      label: 'Guardrails',
      intro: 'These answers control what the product may suggest. They prevent keyword stuffing, overclaiming, and unnecessary personal data collection.',
      questions: [
        {
          id: 'honestGaps',
          type: 'textarea',
          label: 'Which target requirements are not yet proven, but could be supported honestly?',
          help: 'Mention coursework, a project, or a learning plan only if it is true. A gap should remain a gap rather than being hidden by invented experience.',
        },
        {
          id: 'resumeConstraints',
          type: 'textarea',
          label: 'What resume constraints should we respect?',
          help: 'For example: one page, two pages, no photo, no date of birth, no salary history, English only, campus format, or a specific employer form.',
        },
        {
          id: 'neverAdd',
          type: 'textarea',
          label: 'What should never be added, rewritten, or inferred?',
          help: 'List claims, metrics, credentials, employers, or personal details that require your explicit approval or must stay out.',
        },
      ],
    },
  ];

  const questions = questionGroups.flatMap((group) => group.questions.map((question) => ({ ...question, groupId: group.id })));

  function asText(value) {
    return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
  }

  function normalizeAnswers(input) {
    const source = input && typeof input === 'object' ? input : {};
    const answers = {};
    questions.forEach((question) => {
      const value = source[question.id];
      if (question.type === 'checkboxes') {
        const maxChoices = Number(question.maxChoices || MAX_ARRAY_ITEMS);
        answers[question.id] = Array.isArray(value)
          ? [...new Set(value.map(asText).filter(Boolean))].slice(0, maxChoices)
          : [];
      } else {
        answers[question.id] = asText(value);
      }
    });
    return answers;
  }

  function load(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return { schemaVersion: SCHEMA_VERSION, answers: {}, updatedAt: null };
    try {
      const raw = JSON.parse(store.getItem(STORAGE_KEY) || '{}');
      return {
        schemaVersion: SCHEMA_VERSION,
        answers: normalizeAnswers(raw.answers),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
      };
    } catch (_error) {
      return { schemaVersion: SCHEMA_VERSION, answers: {}, updatedAt: null };
    }
  }

  function save(answers, storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const record = { schemaVersion: SCHEMA_VERSION, answers: normalizeAnswers(answers), updatedAt: new Date().toISOString() };
    if (store) store.setItem(STORAGE_KEY, JSON.stringify(record));
    return record;
  }

  function clear(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (store) store.removeItem(STORAGE_KEY);
    return { schemaVersion: SCHEMA_VERSION, answers: {}, updatedAt: null };
  }

  function hasAnswer(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(asText(value));
  }

  function completion(state) {
    const answers = state?.answers || state || {};
    const answered = questions.filter((question) => hasAnswer(answers[question.id])).length;
    const recommended = questions.filter((question) => question.recommended);
    const recommendedAnswered = recommended.filter((question) => hasAnswer(answers[question.id])).length;
    return {
      answered,
      total: questions.length,
      recommendedAnswered,
      recommendedTotal: recommended.length,
      percent: Math.round((answered / questions.length) * 100),
    };
  }

  function audit(profileResult, state) {
    const parsed = profileResult?.parsed || profileResult || {};
    const answers = state?.answers || state || {};
    const prompts = [];
    if (!hasAnswer(answers.targetRoles)) prompts.push('Choose the role families you want this profile to support.');
    if (!hasAnswer(answers.targetJobDescription)) prompts.push('Paste a target posting when you want role-specific tailoring.');
    if (!parsed.sections?.experience && !parsed.sections?.projects && !hasAnswer(answers.leadExperience) && !hasAnswer(answers.projectContext)) {
      prompts.push('Add context for at least one relevant experience or project.');
    }
    if (!parsed.quantifiedLines?.length && !hasAnswer(answers.scopeMetric)) prompts.push('Describe the scale or outcome of one achievement; use “no defensible metric” if none exists.');
    if (!hasAnswer(answers.personalContribution)) prompts.push('Separate your personal contribution from the team result.');
    if (!hasAnswer(answers.safeDisclosure)) prompts.push('Confirm what can be disclosed or anonymized before drafting.');
    if (!hasAnswer(answers.neverAdd)) prompts.push('Set the claims and details that require explicit approval.');
    return prompts.slice(0, 6);
  }

  return { STORAGE_KEY, SCHEMA_VERSION, questionGroups, questions, normalizeAnswers, load, save, clear, completion, audit };
});
