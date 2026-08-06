const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cv = require('./cv-evaluator.js');
const indiaFinanceBenchmark = fs.readFileSync('./fixtures/india-finance-entry-level-resume.txt', 'utf8');

const technicalProfile = `
Jyothi Swaroop Perisetty
swaroop@example.com +91 8555097302

Education
B.Tech, National Institute of Technology Raipur

Experience
- Developed an RFID-based maintenance tracking system for industrial tools.

Projects
- Implemented a Python and PyTorch graph-based classification pipeline.

Skills
Python, C++, Embedded Linux, Git
`;

const financeProfile = `
Candidate Name
candidate@example.com +91 9000000000

Summary
MBA finance candidate with financial analysis and reporting experience.

Experience
- Built Excel financial models and analysed monthly variance reports for stakeholders.
- Improved reconciliation controls and prepared investment research summaries.

Education
MBA Finance

Skills
Excel, SQL, Power BI, financial modeling, financial analysis
`;

test('resume readiness is a transparent local heuristic with review points', () => {
  const result = cv.scoreResume(technicalProfile);
  assert.equal(typeof result.score, 'number');
  assert.match(result.note, /not an employer ATS score/i);
  assert.ok(result.checks.some((check) => check.label === 'Evidence bullets'));
});

test('sanitized Indian finance 0-2 benchmark is recognized without personal data', () => {
  const readiness = cv.scoreResume(indiaFinanceBenchmark);
  const analysis = cv.matchJob({
    title: 'Financial Analyst',
    company: 'Example Capital',
    location: 'Mumbai, India',
    description: 'Please attach a cover letter. Financial analysis, Excel and budgeting experience are required. A degree in finance or commerce is preferred.',
  }, indiaFinanceBenchmark);
  assert.ok(readiness.score >= 60);
  assert.equal(analysis.coverLetter.status, 'required');
  assert.ok(analysis.score >= 75);
  assert.equal(analysis.hardGaps.length, 0);
  assert.ok(analysis.evidence.some((item) => /financial analysis/i.test(item.term)));
});

test('technical keyword overlap cannot overrate a finance role without finance evidence', () => {
  const result = cv.matchJob({
    title: 'Financial Analyst',
    location: 'Mumbai, India',
    description: 'Financial modeling and financial analysis are required. Python and SQL are useful.',
  }, technicalProfile);
  assert.equal(result.scoreable, true);
  assert.ok(result.score < 50);
  assert.ok(result.hardGaps.some((gap) => gap.label === 'Finance-domain evidence'));
});

test('finance evidence supports a finance role without making a hiring prediction', () => {
  const result = cv.matchJob({
    title: 'Financial Analyst',
    location: 'Mumbai, India',
    description: 'Financial modeling and financial analysis are required. Excel and SQL are required.',
  }, financeProfile);
  assert.ok(result.score >= 70);
  assert.equal(result.hardGaps.length, 0);
  assert.match(result.note, /does not predict hiring/i);
});

test('cover-letter drafting follows the posting requirement and evidence gate', () => {
  assert.equal(cv.coverLetterRequirement('Please attach a cover letter.').status, 'required');
  assert.equal(cv.coverLetterRequirement('A cover letter is optional.').status, 'optional');
  assert.equal(cv.coverLetterRequirement('Submit a resume and references.').status, 'not_mentioned');
  assert.equal(cv.coverLetterRequirement('').status, 'unknown');

  const job = {
    title: 'Financial Analyst',
    company: 'Example Bank',
    description: 'Please attach a cover letter. Financial analysis and Excel are required.',
  };
  const analysis = cv.matchJob(job, financeProfile);
  const draft = cv.buildCoverLetter(job, analysis, financeProfile);
  assert.ok(draft.length > 0);
  assert.match(draft, /financial analysis/i);
  assert.doesNotMatch(draft, /increased revenue by|reduced costs by/i);
  assert.equal(cv.buildCoverLetter(job, { ...analysis, evidence: [] }, financeProfile), '');
});

test('missing role description is not scored', () => {
  const result = cv.matchJob({ title: 'Analyst', location: 'India', description: '' }, financeProfile);
  assert.equal(result.score, null);
  assert.equal(result.scoreable, false);
  assert.equal(result.coverLetter.status, 'unknown');
});
