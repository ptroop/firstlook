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

test('parsed profile exposes stable content-derived bullet IDs', () => {
  const parsed = cv.parseProfile(financeProfile);
  assert.ok(parsed.bullets.length > 0);
  assert.ok(parsed.bullets.every((bullet) => /^b[0-9a-f]+$/.test(bullet.id)));
  const again = cv.parseProfile(financeProfile);
  assert.deepEqual(parsed.bullets.map((bullet) => bullet.id), again.bullets.map((bullet) => bullet.id));
  assert.ok(parsed.bullets.some((bullet) => bullet.isEvidence));
});

test('cover-letter evidence cites the exact profile bullet ID', () => {
  const job = {
    title: 'Financial Analyst',
    company: 'Example Bank',
    description: 'Please attach a cover letter. Financial analysis and Excel are required.',
  };
  const analysis = cv.matchJob(job, financeProfile);
  const draft = cv.buildCoverLetter(job, analysis, financeProfile);
  assert.match(draft, /profile line b[0-9a-f]+/);
  assert.ok(analysis.evidence.some((item) => item.bulletId));
});

test('cover-letter verifier passes verified drafts and flags invented lines', () => {
  const job = {
    title: 'Financial Analyst',
    company: 'Example Bank',
    description: 'Please attach a cover letter. Financial analysis and Excel are required.',
  };
  const analysis = cv.matchJob(job, financeProfile);
  const draft = cv.buildCoverLetter(job, analysis, financeProfile);
  const clean = cv.verifyCoverLetter(draft, financeProfile);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.unverified, []);

  const tampered = draft.replace('financial analysis and reporting experience', 'revenue growth of 500% experience');
  const flagged = cv.verifyCoverLetter(tampered, financeProfile);
  assert.equal(flagged.ok, false);
  assert.ok(flagged.unverified.some((line) => /revenue growth of 500%/.test(line)));
});

test('cover-letter draft uses the profile name and contains no review instructions', () => {
  const job = {
    title: 'Financial Analyst',
    company: 'Example Bank',
    description: 'Please attach a cover letter. Financial analysis and Excel are required.',
  };
  const analysis = cv.matchJob(job, financeProfile);
  const draft = cv.buildCoverLetter(job, analysis, financeProfile);
  assert.match(draft, /Candidate Name/);
  assert.doesNotMatch(draft, /review before sending|replace the bracketed name|I have kept this draft limited/i);
  assert.equal(cv.verifyCoverLetter(draft, financeProfile).ok, true);
});

test('tailored CV selects original evidence without generating bullet prose', () => {
  const job = {
    title: 'Financial Analyst',
    company: 'Example Bank',
    description: 'Financial analysis and Excel are required.',
  };
  const analysis = cv.matchJob(job, financeProfile);
  const tailored = cv.buildTailoredProfile(job, analysis, financeProfile);
  assert.match(tailored.text, /Target role: Financial Analyst at Example Bank/);
  assert.match(tailored.text, /Built Excel financial models/);
  assert.match(tailored.note, /selected and reordered/i);
  assert.doesNotMatch(tailored.text, /highly motivated|results-driven|passionate professional/i);
});

test('role-family templates shape the cover-letter opening', () => {
  const riskProfile = `
Risk Candidate
risk@example.com +91 9000000000

Experience
- Assessed credit risk for corporate borrowers and prepared risk summaries.
- Supported KYC onboarding checks and AML screening for new accounts.

Skills
Credit risk, KYC, AML
`;
  const job = {
    title: 'Credit Risk Analyst',
    company: 'Example Bank',
    description: 'Please attach a cover letter. Credit risk and KYC are required.',
  };
  const analysis = cv.matchJob(job, riskProfile);
  const draft = cv.buildCoverLetter(job, analysis, riskProfile);
  assert.match(draft, /risk and credit role/i);
});

async function docxBytes(doc) {
  if (doc.blob instanceof Uint8Array) return doc.blob;
  if (typeof doc.blob.arrayBuffer === 'function') return new Uint8Array(await doc.blob.arrayBuffer());
  throw new Error('unknown docx blob type');
}

test('buildDocx emits a valid stored ZIP with a readable document.xml', async () => {
  const job = { title: 'Financial Analyst', company: 'Example Bank' };
  const doc = cv.buildDocx({ profile: financeProfile, coverLetter: 'Dear Hiring Manager,\n\nI am applying for this role.', job });
  assert.match(doc.filename, /\.docx$/);
  assert.ok(doc.wordCount > 10);
  const bytes = await docxBytes(doc);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4B, 0x03, 0x04]);
  const latin = Buffer.from(bytes).toString('latin1');
  assert.ok(latin.includes('word/document.xml'));
  assert.ok(latin.includes('[Content_Types].xml'));
  assert.ok(latin.includes('PK\x01\x02'), 'central directory present');
});

test('buildDocx escapes XML-sensitive characters in profile text', async () => {
  const doc = cv.buildDocx({ profile: 'Skills\nExcel <pivot tables> & "macros"\n\nExperience\n- Built a model & report' });
  const latin = Buffer.from(await docxBytes(doc)).toString('latin1');
  assert.ok(latin.includes('&lt;pivot tables&gt;'));
  assert.ok(latin.includes('&amp;'));
  assert.doesNotMatch(latin, /Excel <pivot/);
});
