const fixture = {
  jobs: [
    {
      id: 'citi_123', company: 'Citi', title: 'Model Validation Analyst', location: 'Mumbai, India',
      description: 'Requires strong skills in Python, SQL, and Financial Modeling.',
      applyUrl: 'https://citi.wd5.myworkdayjobs.com/job/123/apply', applySourceType: 'official_career',
      officialVerified: true, matchTier: 'exact', eligibilityNote: null,
      newestVerificationAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(), sourceHealthState: 'complete',
      sources: [
        { type: 'official_career', name: 'Citi Careers', listingUrl: 'https://jobs.citi.com/job/123', official: true, verifiedAt: new Date().toISOString() },
        { type: 'linkedin', name: 'LinkedIn', listingUrl: 'https://www.linkedin.com/jobs/view/123', official: false, verifiedAt: new Date().toISOString() },
      ],
    },
    {
      id: 'portal_456', company: 'BlackRock', title: 'Financial Analyst', location: 'Gurugram, India',
      description: 'Experience with Excel and Tableau is a must.',
      applyUrl: 'https://www.linkedin.com/jobs/view/456', applySourceType: 'linkedin', officialVerified: false,
      verificationNote: 'Official listing not yet verified', matchTier: 'exact', eligibilityNote: null,
      newestVerificationAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(), sourceHealthState: 'unknown',
      sources: [{ type: 'linkedin', name: 'LinkedIn', listingUrl: 'https://www.linkedin.com/jobs/view/456', official: false, verifiedAt: new Date().toISOString() }],
    },
    {
      id: 'moodys_789', company: "Moody's", title: 'Senior Financial Data Analyst', location: 'Bengaluru, India',
      description: 'Looking for experts in SQL, Excel, and VBA.',
      applyUrl: 'https://careers.moodys.com/en/job/789', applySourceType: 'official_career', officialVerified: true,
      matchTier: 'possible', eligibilityNote: 'Experience or relevance unconfirmed',
      newestVerificationAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(), sourceHealthState: 'complete',
      sources: [{ type: 'official_career', name: "Moody's Careers", listingUrl: 'https://careers.moodys.com/en/job/789', official: true, verifiedAt: new Date().toISOString() }],
    },
    {
      id: 'moodys_790', company: "Moody's", title: 'Senior Financial Data Analyst', location: 'Noida, India',
      description: 'Looking for experts in SQL, Python.',
      applyUrl: 'https://careers.moodys.com/en/job/790', applySourceType: 'official_career', officialVerified: true,
      matchTier: 'possible', eligibilityNote: 'Experience or relevance unconfirmed',
      newestVerificationAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(), sourceHealthState: 'complete',
      sources: [{ type: 'official_career', name: "Moody's Careers", listingUrl: 'https://careers.moodys.com/en/job/790', official: true, verifiedAt: new Date().toISOString() }],
    },
  ],
  coverage: {
    sources: [
      { connectorId: 'citi-official-india', company: 'Citi', latestStatus: 'partial', latestHydrationStatus: 'backlog', reportedTotal: 721, candidateBacklog: 15, lastCompleteReconcileAt: null, reconcile: { status: 'partial', listingsDiscovered: 706, reportedTotal: 721, pagesFetched: 48, pagesExpected: 49 } },
      { connectorId: 'deshaw-official-india', company: 'D. E. Shaw', latestStatus: 'complete', latestHydrationStatus: 'complete', reportedTotal: 93, candidateBacklog: 0, lastCompleteReconcileAt: new Date().toISOString(), reconcile: { status: 'complete', listingsDiscovered: 93, reportedTotal: 93, pagesFetched: 1, pagesExpected: 1 } },
      { connectorId: 'moodys-official-india', company: "Moody's", latestStatus: 'complete', latestHydrationStatus: 'complete', reportedTotal: 4, candidateBacklog: 0, lastCompleteReconcileAt: new Date().toISOString(), reconcile: { status: 'complete', listingsDiscovered: 4, reportedTotal: 4, pagesFetched: 1, pagesExpected: 1 } },
    ],
  },
};

const jobList = document.querySelector('#job-list');
const matchesEmpty = document.querySelector('#matches-empty');
const matchesMeta = document.querySelector('#matches-meta');
const coverageList = document.querySelector('#coverage-list');
const coverageMeta = document.querySelector('#coverage-meta');
const toast = document.querySelector('#toast');
const refreshButton = document.querySelector('#refresh-feed');
const cvProfile = document.querySelector('#cv-profile');
const cvFile = document.querySelector('#cv-file');
const cvResults = document.querySelector('#cv-results');
const cvResultsMeta = document.querySelector('#cv-results-meta');
const cvMeta = document.querySelector('#cv-meta');
const cvQualityMeta = document.querySelector('#cv-quality-meta');
const cvQualityList = document.querySelector('#cv-quality-list');
const companyDirectory = document.querySelector('#company-directory');
const companiesMeta = document.querySelector('#companies-meta');
const companySearch = document.querySelector('#company-search');
const companiesRail = document.querySelector('#companies-rail');
const drawer = document.querySelector('#companies-drawer');
const drawerOverlay = document.querySelector('#drawer-overlay');
const drawerClose = document.querySelector('#drawer-close');
const resumeDropzone = document.querySelector('#resume-dropzone');
let companySearchTerm = '';
let pdfJsPromise = null;
const API_BASE = window.JOB_MONITOR_API || '';
const VAPID_PUBLIC_KEY = window.JOB_MONITOR_VAPID_PUBLIC_KEY || '';
const FIXTURE_MODE = new URLSearchParams(window.location.search).get('fixture') === '1';
let toastTimer;
let currentJobs = [];
let latestCoverage = [];
let latestSnapshotAt = null;
let refreshInFlight = false;
const CV_STORAGE_KEY = 'first-look-master-profile-v1';
const CV_VERSIONS_STORAGE_KEY = 'first-look-profile-versions-v1';
const CV_REVIEW_STORAGE_KEY = 'first-look-review-gate-v1';
const COVER_LETTER_STORAGE_KEY = 'first-look-cover-letter-drafts-v1';
const PORTAL_STORAGE_KEY = 'first-look-portal-listings-v1';
const JOB_STATUS_STORAGE_KEY = 'first-look-job-status-v1';
const JOB_STATUS_TTL_MS = 30 * 60 * 1000;
let autoCheckedTopRoles = false;
const SKILL_KEYWORDS = [
  'Python', 'SQL', 'Excel', 'AWS', 'Financial Modeling', 'Tableau', 
  'Power BI', 'Machine Learning', 'C++', 'Java', 'Bloomberg', 'R', 
  'GCP', 'Azure', 'Snowflake', 'Looker', 'Alteryx', 'VBA'
];

function extractSkills(text) {
  if (!text) return [];
  const skills = [];
  const lowerText = text.toLowerCase();
  for (const kw of SKILL_KEYWORDS) {
    const regex = new RegExp(`\\b${kw.replace(/[+]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      skills.push(kw);
    }
  }
  return skills.slice(0, 5);
}

function renderJobs(jobs) {
  currentJobs = Array.isArray(jobs) ? jobs : [];
  renderCompanyDirectory();
  renderCvMatches();
  if (!jobs.length) {
    showFeedState('No matching roles yet', 'Prior listings are kept when a career-page scan is incomplete.', '0 roles');
    return;
  }

  matchesEmpty.hidden = true;
  jobList.hidden = false;
  matchesMeta.textContent = `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'}${latestSnapshotAt ? ` · feed updated ${formatAge(latestSnapshotAt)}` : ''}`;

  const byCompany = {};
  for (const job of jobs) {
    if (!byCompany[job.company]) byCompany[job.company] = [];
    byCompany[job.company].push(job);
  }

  const sortedCompanies = Object.keys(byCompany).sort((a, b) => a.localeCompare(b));

  jobList.innerHTML = sortedCompanies.map(company => {
    const companyJobs = byCompany[company];
    const headerHtml = `
      <div class="company-category-header" onclick="this.parentElement.classList.toggle('is-expanded')">
        <div class="company-category-info">
          <h3>${escapeHtml(company)}</h3>
          <span class="vacancy-count">${companyJobs.length} ${companyJobs.length === 1 ? 'vacancy' : 'vacancies'}</span>
        </div>
        <div class="company-category-chevron">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>
    `;

    const jobsHtml = companyJobs.map(job => {
      const sources = Array.isArray(job.sources) ? job.sources : [];
      const applyUrl = directApplyUrl(job);
      const roleUrl = roleReviewUrl(job);
      const applyLabel = job.officialApplyUrl ? 'Apply direct' : 'Open role';
      const statusBadges = [
        `<span class="badge badge-match">${job.matchTier === 'exact' ? 'Strong match' : 'Check match'}</span>`,
        job.experienceYears ? `<span class="badge">Experience ${escapeHtml(formatExperienceRange(job.experienceYears))}</span>` : '',
        job.officialVerified
          ? '<span class="badge">Official source</span>'
          : '<span class="badge badge-warning">Official not verified</span>',
        ...unique(sources.filter((source) => !source.official).map((source) => `<span class="badge">${escapeHtml(sourceLabel(source.type))}</span>`)),
      ].join('');

      const extractedSkills = extractSkills(`${job.title} ${job.description || ''}`);
      const skillsHtml = extractedSkills.length > 0 
        ? `<div class="badge-row skills-row" style="margin-top: 14px;">${extractedSkills.map(s => `<span class="badge badge-skill">${escapeHtml(s)}</span>`).join('')}</div>`
        : '';

      const sourceLinks = sources.map((source) => {
        const url = safeUrl(source.detailUrl || source.listingUrl || source.applyUrl);
        if (!url) return '';
        return `<a href="${url}" target="_blank" rel="noreferrer"><span>${escapeHtml(source.name || sourceLabel(source.type))}</span><small>${source.official ? 'Official' : 'Portal'} / ${escapeHtml(formatAge(source.verifiedAt))}</small></a>`;
      }).join('');
      const note = job.eligibilityNote || job.verificationNote;

      const jobId = jobIdentity(job);
      return `
        <article class="job-card" data-job-id="${escapeAttribute(jobId)}">
          <div class="job-main">
            <h3>${escapeHtml(job.title)}</h3>
            <p class="job-location">${escapeHtml(job.location || 'Location not listed')}</p>
            <div class="badge-row">${statusBadges}</div>
            ${skillsHtml}
            ${note ? `<p class="job-note">${escapeHtml(note)}</p>` : ''}
          </div>
          <div class="job-actions">
            <span class="verified-time">Verified ${escapeHtml(formatAge(job.newestVerificationAt))}</span>
            <span class="job-status-area" data-status-job-id="${escapeAttribute(jobId)}">${statusBadgeHtml(jobId)}<button class="text-button job-status-check" type="button" data-status-job-id="${escapeAttribute(jobId)}">Check if open</button></span>
            ${applyUrl ? `<a class="button button-accent" href="${applyUrl}" target="_blank" rel="noreferrer">${applyLabel}</a>` : '<span class="apply-unavailable">Direct Apply link pending</span>'}
            ${roleUrl && roleUrl !== applyUrl ? `<a class="text-button" href="${roleUrl}" target="_blank" rel="noreferrer">Review role</a>` : ''}
          </div>
          <details class="source-details">
            <summary>Sources (${sources.length})</summary>
            <div class="source-list">${sourceLinks || '<span>No active source link</span>'}</div>
          </details>
        </article>
      `;
    }).join('');

    return `
      <div class="company-category">
        ${headerHtml}
        <div class="company-jobs-list">
          ${jobsHtml}
        </div>
      </div>
    `;
  }).join('');
}

function profileText() {
  return cvProfile?.value.trim() || '';
}

function cvEngine() {
  return window.FirstLookCv || null;
}

function renderCvQuality() {
  if (!cvQualityMeta || !cvQualityList) return;
  const engine = cvEngine();
  const profile = profileText();
  if (!engine || !profile) {
    cvQualityMeta.textContent = 'No profile yet';
    cvQualityList.innerHTML = '<p class="cv-quality-empty">A local readability check, not an employer ATS score.</p>';
    return;
  }
  const result = engine.scoreResume(profile);
  cvQualityMeta.textContent = result.score === null ? 'Not scoreable' : `${result.score}/100 · ${result.label}`;
  const checks = result.checks.map((check) => `<div class="cv-quality-row"><span>${escapeHtml(check.label)}</span><strong class="is-${escapeAttribute(check.tone)}">${escapeHtml(check.value)}</strong></div>`).join('');
  const gaps = result.gaps.length ? `<div class="cv-quality-gaps"><strong>Review points</strong><ul>${result.gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('')}</ul></div>` : '<p class="cv-quality-good">No basic structure gaps detected.</p>';
  cvQualityList.innerHTML = `${checks}${gaps}<p class="cv-quality-note">${escapeHtml(result.note)}</p>`;
}

function jobIdentity(job) {
  return String(job?.id || `${job?.company || ''}|${job?.title || ''}|${job?.location || ''}`);
}

function loadCoverLetterDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(COVER_LETTER_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (_error) {
    return {};
  }
}

let coverLetterDrafts = loadCoverLetterDrafts();
let portalListings = loadPortalListings();

function loadReviewedDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(CV_REVIEW_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (_error) {
    return {};
  }
}

let reviewedDrafts = loadReviewedDrafts();

function isDraftReviewed(jobId) {
  return Boolean(reviewedDrafts[jobId]);
}

function setDraftReviewed(jobId, reviewed) {
  if (reviewed) reviewedDrafts[jobId] = { at: new Date().toISOString() };
  else delete reviewedDrafts[jobId];
  try { localStorage.setItem(CV_REVIEW_STORAGE_KEY, JSON.stringify(reviewedDrafts)); } catch (_error) { /* private mode */ }
}

function loadProfileVersions() {
  try {
    const stored = JSON.parse(localStorage.getItem(CV_VERSIONS_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (_error) {
    return [];
  }
}

let profileVersions = loadProfileVersions();

function saveProfileVersions() {
  try { localStorage.setItem(CV_VERSIONS_STORAGE_KEY, JSON.stringify(profileVersions)); } catch (_error) { /* private mode */ }
}

function renderProfileVersions() {
  const container = document.querySelector('#cv-versions');
  if (!container) return;
  if (!profileVersions.length) {
    container.innerHTML = '<p class="cv-quality-empty">No saved profile versions yet. Save a version before large edits to keep a restorable point.</p>';
    return;
  }
  container.innerHTML = profileVersions.map((version) => `
    <div class="cv-version-item">
      <span title="${escapeAttribute(version.text.length)} characters"><strong>${escapeHtml(version.label || 'Unnamed')}</strong> · ${escapeHtml(version.createdAt ? new Date(version.createdAt).toLocaleString() : '')}</span>
      <span class="cv-version-actions"><button class="text-button cv-version-restore" type="button" data-version-id="${escapeAttribute(version.createdAt)}">Restore</button><button class="text-button cv-version-delete" type="button" data-version-id="${escapeAttribute(version.createdAt)}">Delete</button></span>
    </div>`).join('');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function loadJobStatusCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(JOB_STATUS_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (_error) {
    return {};
  }
}

let jobStatusCache = loadJobStatusCache();

function saveJobStatusCache() {
  try { localStorage.setItem(JOB_STATUS_STORAGE_KEY, JSON.stringify(jobStatusCache)); } catch (_error) { /* private mode */ }
}

function cachedJobStatus(jobId) {
  const entry = jobStatusCache[jobId];
  if (!entry || !entry.checkedAt || !['open', 'closed', 'unknown'].includes(entry.status)) return null;
  if (Date.now() - Date.parse(entry.checkedAt) > JOB_STATUS_TTL_MS) return null;
  return entry;
}

function statusBadgeHtml(jobId) {
  const entry = cachedJobStatus(jobId);
  if (!entry) return '';
  const label = entry.status === 'open' ? 'Open' : entry.status === 'closed' ? 'Closed' : 'Unverified';
  return `<span class="job-status-badge is-${escapeAttribute(entry.status)}" title="${escapeAttribute(entry.note || '')}">${label}</span>`;
}

function renderStatusArea(area, result) {
  area.innerHTML = '';
  const badge = document.createElement('span');
  badge.className = `job-status-badge is-${result.status}`;
  badge.textContent = result.status === 'open' ? 'Open' : result.status === 'closed' ? 'Closed' : 'Unverified';
  if (result.note) badge.title = result.note;
  const when = document.createElement('span');
  when.className = 'job-status-checked';
  when.textContent = formatAge(result.checkedAt);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-button job-status-check';
  button.dataset.statusJobId = area.dataset.statusJobId;
  button.textContent = 'Check again';
  area.append(badge, when, button);
}

function updateStatusAreas(jobId) {
  const result = cachedJobStatus(jobId);
  if (!result) return;
  document.querySelectorAll(`.job-status-area[data-status-job-id="${CSS.escape(jobId)}"]`).forEach((area) => renderStatusArea(area, result));
}

async function checkJobStatus(jobId) {
  const response = await fetch(`${API_BASE.replace(/\/$/, '')}/job-status?id=${encodeURIComponent(jobId)}`).then(requireJson);
  const result = { status: response.status, checkedAt: response.checkedAt, note: response.note };
  jobStatusCache[jobId] = result;
  saveJobStatusCache();
  return result;
}

async function checkJobStatusFor(jobId, button) {
  if (!API_BASE) {
    showToast('The job feed is not connected.');
    return;
  }
  const originalLabel = button ? button.textContent : '';
  if (button) { button.disabled = true; button.textContent = 'Checking…'; }
  try {
    const result = await checkJobStatus(jobId);
    updateStatusAreas(jobId);
    const message = result.status === 'open' ? 'This posting is live.' : result.status === 'closed' ? 'This posting appears to be closed.' : 'Could not verify this posting.';
    showToast(`${message} ${result.note || ''}`);
  } catch (_error) {
    showToast('Could not check this posting right now.');
    if (button) { button.disabled = false; button.textContent = originalLabel; }
  }
}

function autoCheckTopRoles() {
  if (autoCheckedTopRoles || !API_BASE) return;
  autoCheckedTopRoles = true;
  const targets = currentJobs.filter((job) => job.matchTier === 'exact' && !cachedJobStatus(jobIdentity(job))).slice(0, 3);
  let index = 0;
  const run = async () => {
    if (index >= targets.length) return;
    const job = targets[index];
    index += 1;
    try {
      await checkJobStatus(jobIdentity(job));
      updateStatusAreas(jobIdentity(job));
    } catch (_error) { /* keep the list stable; user can check manually */ }
    setTimeout(run, 400);
  };
  run();
}

function loadPortalListings() {
  try {
    const stored = JSON.parse(localStorage.getItem(PORTAL_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    const valid = stored.map(normalizePortalListing).filter(Boolean);
    if (valid.length !== stored.length) {
      localStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch (_error) {
    return [];
  }
}

function isLikelyPortalFinanceRole(listing) {
  const title = String(listing?.title || '');
  const location = String(listing?.location || '');
  if (!/\b(?:india|bengaluru|bangalore|mumbai|pune|hyderabad|gurugram|gurgaon|delhi|noida|chennai|kolkata|ahmedabad|jaipur)\b/i.test(location)) return false;
  if (/\b(?:software|developer|engineer|engineering|cloud|devops|cyber|data scientist|machine learning|frontend|backend|ui|ux|designer|design|creative|brand|visual|product manager|project manager|marketing|sales|business development|customer success|customer experience|recruit|human resources|legal|support|operations manager|assistant manager|senior analyst|senior associate|senior specialist|senior consultant|senior accountant|team lead|team leader|manager|tele ?caller|collections|loan recovery|growth management|voice ?over|content creator|architect|sap|abap|servicenow|itsm|itam|testing|quality analyst|digital analyst|demand planner|replenishment|data management|information management|personal assistant|executive assistant|helpdesk|vendor onboarding|talent management|human capital|strats|chat process|ccm|aiml|applied ai|agentic|intelligence automation|automation|dm \/ am \/ se|managing consultant|people leader|deputy manager|dgm)\b/i.test(title)) return false;
  if (/^(?:about the team|responsibilities|qualifications|india|team member|german,? ?nct|csg laf|prospect application for future jobs)$/i.test(title.trim())) return false;
  const specificFinance = /\b(?:finance|financial|account(?:ing)?|audit|credit|risk|investment|investments|research|portfolio|treasury|tax|valuation|fund|banking|capital markets|reconciliation|compliance|aml|kyc|fp&a|controller)\b/i.test(title);
  const financeAnalyst = /\b(?:financial|finance|credit|risk|investment|research|portfolio|fund|treasury|tax|valuation|equity|banking)\b[\w /&-]{0,30}\banalyst\b/i.test(title);
  return specificFinance || financeAnalyst;
}

function normalizePortalListing(value) {
  if (!value || typeof value !== 'object' || !value.title || !value.listingUrl || !isLikelyPortalFinanceRole(value)) return null;
  const sourceType = ['linkedin', 'naukri', 'iimjobs', 'indeed', 'other'].includes(value.sourceType) ? value.sourceType : 'other';
  const listingUrl = safeUrl(value.listingUrl);
  if (!listingUrl) return null;
  const applyUrl = safeUrl(value.applyUrl || '');
  const id = `portal_${simpleHash(`${sourceType}|${listingUrl}`)}`;
  return {
    id,
    company: String(value.company || 'Company not identified').trim().slice(0, 120),
    title: String(value.title).trim().slice(0, 180),
    location: String(value.location).trim().slice(0, 120),
    description: '',
    applyUrl: applyUrl || listingUrl,
    officialApplyUrl: '',
    officialDetailUrl: '',
    officialVerified: false,
    verificationNote: 'Portal discovery only; official employer listing not verified',
    matchTier: 'possible',
    newestVerificationAt: String(value.capturedAt || new Date().toISOString()),
    sourceHealthState: 'unknown',
    sources: [{ type: sourceType, name: String(value.sourceName || sourceType), listingUrl, detailUrl: listingUrl, applyUrl: applyUrl || listingUrl, official: false, verifiedAt: String(value.capturedAt || new Date().toISOString()) }],
  };
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

function savePortalListings() {
  try { localStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(portalListings)); } catch (_error) { showToast('This browser blocked local portal storage.'); }
}

function saveCoverLetterDraft(jobId, value) {
  coverLetterDrafts[jobId] = value;
  try {
    localStorage.setItem(COVER_LETTER_STORAGE_KEY, JSON.stringify(coverLetterDrafts));
    showToast('Cover-letter draft saved on this device.');
  } catch (_error) {
    showToast('This browser blocked local draft storage.');
  }
}

function buildCvBrief(job, result) {
  const evidence = result.evidence.length
    ? `<ul>${result.evidence.map(({ term, excerpt }) => `<li><strong>${escapeHtml(term)}</strong> — “${escapeHtml(excerpt)}”</li>`).join('')}</ul>`
    : '<p>No matching evidence line was found in the saved profile.</p>';
  const requirements = result.requirements.length
    ? `<details class="cv-requirements"><summary>Requirement evidence (${result.requirements.length})</summary><ul>${result.requirements.map((item) => { const statusLabel = item.status === 'supported' ? 'Supported' : item.status === 'context' ? 'Context' : 'Gap'; return `<li class="requirement-${item.status}"><strong>${statusLabel}</strong> ${escapeHtml(item.label)}${item.excerpt ? `<small>Evidence: ${escapeHtml(item.excerpt)}</small>` : ''}</li>`; }).join('')}</ul></details>`
    : '<p>Role requirements are not scoreable from the available posting text.</p>';
  const reviewPoints = result.missing.length
    ? `<p class="cv-brief-warning">Hard gaps to review: ${escapeHtml(result.missing.join(', '))}. Add nothing unless your existing experience, coursework or project work supports it.</p>`
    : '<p>No hard evidence gaps were detected in the available requirements.</p>';
  const score = result.score === null ? 'Not scoreable' : `${result.score}/100 evidence match`;
  const eligibility = job.matchTier ? `<p>Monitor eligibility: <strong>${escapeHtml(job.matchTier)}</strong>${job.eligibilityNote ? ` — ${escapeHtml(job.eligibilityNote)}` : ''}</p>` : '';
  return `<p><strong>${escapeHtml(score)}</strong> · confidence: ${escapeHtml(result.confidence)}. This is evidence matching, not a hiring prediction.</p>${eligibility}<p>Use only evidence already present in your profile for <strong>${escapeHtml(job.title)}</strong>.</p>${evidence}${requirements}${reviewPoints}`;
}

function renderCvMatches() {
  if (!cvResults || !cvResultsMeta) return;
  const profile = profileText();
  renderCvQuality();
  if (!profile) {
    cvResultsMeta.textContent = 'No profile yet';
    cvResults.innerHTML = '<div class="cv-empty"><h3>No profile yet.</h3><p>Upload or paste your resume above.</p></div>';
    return;
  }
  if (!currentJobs.length) {
    cvResultsMeta.textContent = 'No open roles yet';
    cvResults.innerHTML = '<div class="cv-empty"><h3>No open roles yet.</h3><p>Your profile is saved; matches appear when the feed returns roles.</p></div>';
    return;
  }
  const engine = cvEngine();
  if (!engine) {
    cvResultsMeta.textContent = 'CV evaluator unavailable';
    cvResults.innerHTML = '<div class="cv-empty"><h3>Evaluation is unavailable.</h3><p>Reload the page so the local evaluator can load.</p></div>';
    return;
  }
  const ranked = currentJobs.map((job) => ({ job, result: engine.matchJob(job, profile) }))
    .sort((left, right) => (right.result.score ?? -1) - (left.result.score ?? -1))
    .slice(0, 10);
  cvResultsMeta.textContent = `Top ${ranked.length} of ${currentJobs.length} roles`;
  cvResults.innerHTML = ranked.map(({ job, result }) => {
    const applyUrl = directApplyUrl(job);
    const roleUrl = roleReviewUrl(job);
    const jobId = jobIdentity(job);
    const canDraftCoverLetter = ['required', 'mentioned', 'optional'].includes(result.coverLetter.status);
    const draft = canDraftCoverLetter ? (coverLetterDrafts[jobId] || engine.buildCoverLetter(job, result, profile)) : '';
    const reviewed = isDraftReviewed(jobId);
    const verifyReport = canDraftCoverLetter && draft ? engine.verifyCoverLetter(draft, profile) : null;
    const verifyNote = verifyReport && !verifyReport.ok
      ? `<p class="cv-brief-warning">Verifier found ${verifyReport.unverified.length} line${verifyReport.unverified.length === 1 ? '' : 's'} not backed by the profile: ${escapeHtml(verifyReport.unverified.slice(0, 3).join(' · '))}. Edit or remove before exporting.</p>`
      : '';
    const coverLetterPanel = canDraftCoverLetter && draft
      ? `<div class="cover-letter-panel" id="cover-letter-panel-${escapeAttribute(jobId)}" hidden>
          <p class="cover-status"><strong>Cover letter: ${escapeHtml(result.coverLetter.label)}</strong>${result.coverLetter.evidence ? ` — ${escapeHtml(result.coverLetter.evidence)}` : ''}</p>
          <label class="field-label" for="cover-letter-${escapeAttribute(jobId)}">Conservative evidence-backed draft</label>
          <textarea class="cover-letter-textarea" id="cover-letter-${escapeAttribute(jobId)}" rows="13">${escapeHtml(draft)}</textarea>
          ${verifyNote}
          <label class="review-gate"><input class="cover-letter-review" type="checkbox" data-cover-job-id="${escapeAttribute(jobId)}"${reviewed ? ' checked' : ''} /> I reviewed every line of this draft against my profile before use.</label>
          <div class="cv-controls"><button class="button button-dark cover-letter-save" type="button" data-cover-job-id="${escapeAttribute(jobId)}">Save draft</button><button class="text-button cover-letter-copy" type="button" data-cover-job-id="${escapeAttribute(jobId)}"${reviewed ? '' : ' disabled'} title="${reviewed ? '' : 'Tick the review checkbox first.'}">Copy draft</button><button class="text-button cover-letter-export" type="button" data-cover-job-id="${escapeAttribute(jobId)}"${reviewed && (!verifyReport || verifyReport.ok) ? '' : ' disabled'} title="${reviewed ? (verifyReport && !verifyReport.ok ? 'Fix unverified lines first.' : '') : 'Tick the review checkbox first.'}">Export .docx</button></div>
          <p class="privacy-note">Local draft only. Review every line; unmatched requirements are not filled in and no metrics or experience were invented.</p>
        </div>`
      : `<div class="cover-letter-panel" hidden><p class="cover-letter-empty">${result.coverLetter.status === 'not_mentioned' ? 'Cover letter is not mentioned in this posting; no draft was generated.' : result.coverLetter.status === 'unknown' ? 'The posting text is unavailable, so the cover-letter requirement cannot be determined.' : 'No evidence-backed draft is available until at least two profile lines support the role.'}</p></div>`;
    const coverButton = canDraftCoverLetter && draft ? `<button class="text-button cover-letter-toggle" type="button" data-cover-job-id="${escapeAttribute(jobId)}">Review cover letter (${escapeHtml(result.coverLetter.label)})</button>` : '';
    const score = result.score === null ? 'Not scoreable' : `${result.score}/100 evidence match`;
    return `<article class="cv-result">
      <div class="cv-result-top"><div><h4>${escapeHtml(job.title)}</h4><p class="cv-result-company">${escapeHtml(job.company || '')}</p><p class="cv-result-location">${escapeHtml(job.location || 'Location not listed')}</p></div><span class="cv-score">${escapeHtml(score)}</span></div>
      <div class="cv-result-tags">${result.evidence.slice(0, 5).map(({ term }) => `<span class="badge">Supported: ${escapeHtml(term)}</span>`).join('')}${result.missing.slice(0, 5).map((term) => `<span class="badge badge-missing">Gap: ${escapeHtml(term)}</span>`).join('')}<span class="badge">Cover: ${escapeHtml(result.coverLetter.label)}</span></div>
      <div class="cv-result-actions">${applyUrl ? `<a class="button button-accent" href="${applyUrl}" target="_blank" rel="noreferrer">${job.officialApplyUrl ? 'Apply direct' : 'Open role'}</a>` : ''}${roleUrl && roleUrl !== applyUrl ? `<a class="text-button" href="${roleUrl}" target="_blank" rel="noreferrer">Review role</a>` : ''}<button class="text-button cv-brief-toggle" type="button" data-cv-job-id="${escapeAttribute(jobId)}">Show evidence brief</button>${coverButton}</div>
      <div class="cv-brief" id="cv-brief-${escapeAttribute(jobId)}" hidden>${buildCvBrief(job, result)}</div>
      ${coverLetterPanel}
    </article>`;
  }).join('');
}

function loadStoredProfile() {
  if (!cvProfile) return;
  try { cvProfile.value = localStorage.getItem(CV_STORAGE_KEY) || ''; } catch (_error) { /* private mode */ }
  renderCvMatches();
}

function saveProfile() {
  if (!cvProfile) return;
  const value = profileText();
  try { localStorage.setItem(CV_STORAGE_KEY, value); } catch (_error) { showToast('This browser blocked local profile storage.'); return; }
  cvMeta.textContent = value ? 'Saved on this device' : 'Private on this device';
  renderCvMatches();
  showToast(value ? 'Profile saved on this device.' : 'Profile cleared.');
}

function renderCoverage(payload) {
  const sources = Array.isArray(payload?.sources)
    ? payload.sources.filter((source) => source?.latestStatus !== 'unsupported')
    : [];
  latestCoverage = sources;
  renderCompanyDirectory();
  if (!sources.length) {
    coverageMeta.textContent = 'No scan history';
    coverageList.innerHTML = '<p class="coverage-empty">Coverage will appear after the first source scan.</p>';
    return;
  }

  const hasErrors = sources.some(s => s.latestStatus === 'failed' || s.latestStatus === 'anomalous');
  const hasBacklog = sources.some(s => Number(s.candidateBacklog || 0) > 0);
  const healthDot = document.getElementById('health-dot');
  if (healthDot) {
    healthDot.className = 'health-dot ' + (hasErrors ? 'error' : (hasBacklog ? 'warning' : 'success'));
  }

  coverageMeta.textContent = `${sources.length} verified ${sources.length === 1 ? 'source' : 'sources'}`;
  coverageList.innerHTML = sources.map((source) => {
    const status = source.latestStatus || 'unknown';
    const progress = source.reconcile || source.watch;
    const statusText = status === 'complete'
      ? 'Current'
      : status === 'partial' || status === 'anomalous'
        ? 'Full scan incomplete - keeping prior listings'
        : status === 'failed'
          ? 'Source unavailable - keeping prior listings'
          : 'Not checked';
    const counts = progress && Number.isFinite(progress.listingsDiscovered)
      ? `${progress.listingsDiscovered}${Number.isFinite(progress.reportedTotal) ? ` of ${progress.reportedTotal}` : ''} summaries`
      : 'Count unavailable';
    const backlog = Number(source.candidateBacklog || 0);
    return `
      <article class="coverage-item coverage-${escapeAttribute(status)}">
        <div><h4>${escapeHtml(source.company)}</h4><p>${escapeHtml(statusText)}</p></div>
        <div class="coverage-counts"><span>${escapeHtml(counts)}</span><small>${backlog > 0 ? `${backlog} details queued` : 'Details current'}</small></div>
      </article>
    `;
  }).join('');
}

function renderCompanyDirectory() {
  if (!companyDirectory || !companiesMeta) return;
  const catalog = Array.isArray(window.COMPANY_CATALOG) ? window.COMPANY_CATALOG : [];
  const term = companySearchTerm.trim().toLowerCase();
  const visible = term
    ? catalog.filter((company) => String(company.name).toLowerCase().includes(term) || String(company.segment || '').toLowerCase().includes(term))
    : catalog;
  const groups = visible.reduce((result, company) => {
    if (!result[company.segment]) result[company.segment] = [];
    result[company.segment].push(company);
    return result;
  }, {});
  const liveRoleCount = catalog.filter((company) => currentJobs.some((job) => sameCompany(job.company, company.name))).length;
  const prefix = term ? `${visible.length} of ${catalog.length}` : String(catalog.length);
  companiesMeta.textContent = `${prefix} employers · ${liveRoleCount} with matching roles in the current snapshot`;
  companyDirectory.innerHTML = Object.entries(groups).map(([segment, companies]) => `
    <section class="company-group">
      <div class="company-group-heading"><h3>${escapeHtml(segment)}</h3><span>${companies.length}</span></div>
      <div class="company-directory-grid">
        ${companies.map((company) => {
          const url = safeUrl(company.url);
          const source = latestCoverage.find((candidate) => sameCompany(candidate.company, company.name));
          const roles = currentJobs.filter((job) => sameCompany(job.company, company.name)).length;
          const sourceStatus = source?.latestStatus || '';
          const sourceLabel = sourceStatus === 'complete'
            ? 'Verified source'
            : sourceStatus === 'failed'
              ? 'Source unavailable'
              : sourceStatus === 'partial' || sourceStatus === 'anomalous'
                ? `Source ${sourceStatus}`
                : source
                  ? 'Source not checked'
                  : 'No verified scan yet';
          const roleLabel = roles > 0
            ? `${roles} matching role${roles === 1 ? '' : 's'}`
            : 'No matching role in snapshot';
          return `<article class="company-directory-card">
            <div><h4>${escapeHtml(company.name)}</h4><span class="company-source-status ${sourceStatus === 'complete' ? 'is-registered' : ''}">${escapeHtml(sourceLabel)} · ${escapeHtml(roleLabel)}</span></div>
            ${url ? `<a class="text-button" href="${url}" target="_blank" rel="noreferrer">Career page</a>` : ''}
          </article>`;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function companyKey(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const aliases = {
    jpmorgan: 'jpmorgan',
    jpmorganchase: 'jpmorgan',
    deloitteusi: 'deloitte',
    deloitte: 'deloitte',
    pwc: 'pwc',
    pwcsdc: 'pwc',
    spglobal: 'spglobal',
    moodys: 'moodys',
  };
  return aliases[normalized] || normalized;
}

function sameCompany(left, right) {
  return companyKey(left) === companyKey(right);
}

function showFeedState(title, message, meta) {
  matchesEmpty.querySelector('h3').textContent = title;
  matchesEmpty.querySelector('p').textContent = message;
  matchesMeta.textContent = meta;
  matchesEmpty.hidden = false;
  jobList.hidden = true;
}

function showCoverageError() {
  latestCoverage = [];
  renderCompanyDirectory();
  const healthDot = document.getElementById('health-dot');
  if (healthDot) healthDot.className = 'health-dot error';
  coverageMeta.textContent = 'Connection error';
  coverageList.innerHTML = '<p class="coverage-empty">Source health is temporarily unavailable. Existing job cards are unchanged.</p>';
}

function navigate(view) {
  closeDrawer();
  const target = document.querySelector(`[data-section="${CSS.escape(view)}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.view === view));
}

let lastDrawerTrigger = null;

function openDrawer(trigger) {
  if (!drawer) return;
  lastDrawerTrigger = trigger || null;
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.inert = false;
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  if (drawerOverlay) drawerOverlay.hidden = false;
  document.body.classList.add('drawer-locked');
  document.querySelectorAll('.nav-link[data-drawer], #companies-rail').forEach((element) => element.setAttribute('aria-expanded', 'true'));
  document.querySelectorAll('.nav-link[data-drawer]').forEach((link) => link.classList.add('is-active'));
  companySearch?.focus();
}

function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.inert = true;
  drawer.removeAttribute('role');
  drawer.removeAttribute('aria-modal');
  if (drawerOverlay) drawerOverlay.hidden = true;
  document.body.classList.remove('drawer-locked');
  document.querySelectorAll('.nav-link[data-drawer], #companies-rail').forEach((element) => element.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.nav-link[data-drawer]').forEach((link) => link.classList.remove('is-active'));
  const trigger = lastDrawerTrigger;
  lastDrawerTrigger = null;
  if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) trigger.focus();
}

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('./lib/pdfjs/pdf.min.mjs')
      .then((module) => {
        module.GlobalWorkerOptions.workerSrc = './lib/pdfjs/pdf.worker.min.mjs';
        return module;
      })
      .catch((error) => {
        pdfJsPromise = null;
        throw error;
      });
  }
  return pdfJsPromise;
}

async function extractPdfText(file) {
  const pdfjs = await loadPdfJs();
  const documentTask = pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
  const doc = await documentTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY = null;
    let line = '';
    const lines = [];
    for (const item of content.items) {
      if (typeof item.str !== 'string' || !item.str) continue;
      const y = item.transform ? item.transform[5] : null;
      const isNewLine = item.hasEOL || (lastY !== null && y !== null && Math.abs(y - lastY) > 3);
      if (isNewLine && line) {
        lines.push(line.trimEnd());
        line = '';
      }
      if (y !== null) lastY = y;
      line += `${item.str} `;
    }
    if (line.trim()) lines.push(line.trimEnd());
    pages.push(lines.join('\n'));
  }
  await doc.destroy();
  return pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function importFileIntoProfile(file) {
  if (!file || !cvProfile) return;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (cvMeta) cvMeta.textContent = 'Reading PDF…';
    try {
      const text = await extractPdfText(file);
      if (text.length < 40) {
        showToast('No readable text found. This PDF may be a scanned image — paste your profile instead.');
        if (cvMeta) cvMeta.textContent = 'PDF had no readable text';
        return;
      }
      cvProfile.value = text;
      if (cvMeta) cvMeta.textContent = 'Imported from PDF — save to keep it';
      renderCvMatches();
      showToast(`Extracted ${text.length} characters from ${file.name}.`);
    } catch (error) {
      console.error('PDF import failed', error);
      showToast('That PDF could not be read. Paste your profile as text instead.');
      if (cvMeta) cvMeta.textContent = 'PDF import failed';
    }
    return;
  }
  const raw = await file.text();
  if (file.name.toLowerCase().endsWith('.html')) {
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    cvProfile.value = parsed.body?.innerText || raw;
  } else {
    cvProfile.value = raw;
  }
  if (cvMeta) cvMeta.textContent = 'Imported — save to keep it';
  renderCvMatches();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3400);
}

async function loadData({ manual = false } = {}) {
  if (manual) {
    if (refreshInFlight) return;
    refreshInFlight = true;
    if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = 'Refreshing…'; }
  }
  try {
    if (FIXTURE_MODE) {
      renderJobs([...fixture.jobs, ...portalListings]);
      renderCoverage(fixture.coverage);
      return;
    }
    if (!API_BASE) {
      showFeedState('Job feed not connected', 'Add the Supabase Edge Function URL to load current roles.', 'Not connected');
      showCoverageError();
      return;
    }

    const base = API_BASE.replace(/\/$/, '');
    const cacheBust = manual ? `?refresh=${Date.now()}` : '';
    const [jobsResult, coverageResult] = await Promise.allSettled([
      fetch(`${base}/jobs${cacheBust}`).then(requireJson),
      fetch(`${base}/coverage${cacheBust}`).then(requireJson),
    ]);
    if (jobsResult.status === 'fulfilled') {
      latestSnapshotAt = jobsResult.value?.snapshotAt || null;
      renderJobs([...(Array.isArray(jobsResult.value.jobs) ? jobsResult.value.jobs : []), ...portalListings]);
      autoCheckTopRoles();
    } else showFeedState('Job feed unavailable', 'The monitor could not be reached. Try again shortly.', 'Connection error');
    if (coverageResult.status === 'fulfilled') renderCoverage(coverageResult.value);
    else showCoverageError();
    if (manual) showToast(jobsResult.status === 'fulfilled' || coverageResult.status === 'fulfilled'
      ? `Fetched the latest snapshot${latestSnapshotAt ? ` — feed updated ${formatAge(latestSnapshotAt)}` : ''}.`
      : 'Refresh failed; existing data was kept.');
  } finally {
    if (manual) {
      refreshInFlight = false;
      if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = 'Refresh now'; }
    }
  }
}

async function requireJson(response) {
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

function sourceLabel(type) {
  return ({ official_career: 'Career page', linkedin: 'LinkedIn', naukri: 'Naukri', iimjobs: 'IIMJobs', indeed: 'Indeed' })[type] || 'Other source';
}

function formatAge(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 'time unavailable';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days > 60) return 'not recently checked';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatExperienceRange(years) {
  if (!years) return '';
  const bothKnown = years.minimum !== null && years.maximum !== null;
  if (bothKnown && years.minimum === years.maximum) return `${years.minimum} ${years.minimum === 1 ? 'yr' : 'yrs'}`;
  if (bothKnown) return `${years.minimum}-${years.maximum} yrs`;
  if (years.maximum !== null) return `up to ${years.maximum} yrs`;
  if (years.minimum !== null) return `${years.minimum}+ yrs`;
  return '';
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? escapeAttribute(url.href) : '';
  } catch (_error) {
    return '';
  }
}

function isGenericCareerUrl(value) {
  try {
    const url = new URL(String(value));
    return /\/(?:careers|jobs|work-with-us|search|index\.html)\/?$/i.test(url.pathname)
      || /\.myworkdayjobs\.com\/careers\/?$/i.test(url.pathname)
      || (url.hostname.replace(/^www\./i, '').toLowerCase() === 'apply.deshawindia.com'
        && url.pathname.toLowerCase() === '/applicationpage1.html'
        && url.searchParams.get('entity')?.toUpperCase() === 'DESIS');
  } catch (_error) {
    return true;
  }
}

function directApplyUrl(job) {
  const candidate = job?.officialApplyUrl || (job?.officialVerified ? job?.applyUrl : '');
  if (!candidate || isGenericCareerUrl(candidate)) return '';
  return safeUrl(candidate);
}

function roleReviewUrl(job) {
  const candidate = job?.officialDetailUrl || job?.applyUrl;
  if (!candidate || isGenericCareerUrl(candidate)) return '';
  return safeUrl(candidate);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function unique(values) {
  return [...new Set(values)];
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

document.addEventListener('click', async (event) => {
  const drawerTrigger = event.target.closest('[data-drawer]');
  if (drawerTrigger) {
    openDrawer(drawerTrigger);
    return;
  }

  const viewTrigger = event.target.closest('[data-view]');
  if (viewTrigger) navigate(viewTrigger.dataset.view);

  const briefToggle = event.target.closest('.cv-brief-toggle');
  if (briefToggle) {
    const brief = document.querySelector(`#cv-brief-${CSS.escape(briefToggle.dataset.cvJobId || '')}`);
    if (brief) {
      brief.hidden = !brief.hidden;
      briefToggle.textContent = brief.hidden ? 'Show tailoring brief' : 'Hide tailoring brief';
    }
    return;
  }

  const coverToggle = event.target.closest('.cover-letter-toggle');
  if (coverToggle) {
    const panel = document.querySelector(`#cover-letter-panel-${CSS.escape(coverToggle.dataset.coverJobId || '')}`);
    if (panel) {
      panel.hidden = !panel.hidden;
      coverToggle.textContent = panel.hidden ? 'Draft cover letter' : 'Hide cover letter';
    }
    return;
  }

  const coverSave = event.target.closest('.cover-letter-save');
  if (coverSave) {
    const jobId = coverSave.dataset.coverJobId || '';
    const textarea = document.querySelector(`#cover-letter-${CSS.escape(jobId)}`);
    if (textarea) saveCoverLetterDraft(jobId, textarea.value);
    return;
  }

  const coverReview = event.target.closest('.cover-letter-review');
  if (coverReview) {
    setDraftReviewed(coverReview.dataset.coverJobId || '', coverReview.checked);
    const panel = coverReview.closest('.cover-letter-panel');
    if (panel) {
      const jobId = coverReview.dataset.coverJobId || '';
      const textarea = panel.querySelector(`#cover-letter-${CSS.escape(jobId)}`);
      const engine = cvEngine();
      const report = engine && textarea ? engine.verifyCoverLetter(textarea.value, profileText()) : null;
      const exportAllowed = coverReview.checked && (!report || report.ok);
      const copyButton = panel.querySelector('.cover-letter-copy');
      const exportButton = panel.querySelector('.cover-letter-export');
      if (copyButton) copyButton.disabled = !coverReview.checked;
      if (exportButton) {
        exportButton.disabled = !exportAllowed;
        exportButton.title = exportAllowed ? '' : (coverReview.checked && report && !report.ok ? 'Fix unverified lines first.' : 'Tick the review checkbox first.');
      }
      if (coverReview.checked && report && !report.ok) {
        showToast(`Review recorded, but ${report.unverified.length} line${report.unverified.length === 1 ? '' : 's'} still need fixing before export.`);
        return;
      }
    }
    showToast(coverReview.checked ? 'Review recorded on this device.' : 'Review gate cleared.');
    return;
  }

  const coverCopy = event.target.closest('.cover-letter-copy');
  if (coverCopy) {
    if (coverCopy.disabled) return;
    const textarea = document.querySelector(`#cover-letter-${CSS.escape(coverCopy.dataset.coverJobId || '')}`);
    if (!textarea) return;
    try {
      await navigator.clipboard.writeText(textarea.value);
      showToast('Cover-letter draft copied.');
    } catch (_error) {
      textarea.select();
      showToast('Copy was blocked. The draft is selected for manual copy.');
    }
    return;
  }

  const coverExport = event.target.closest('.cover-letter-export');
  if (coverExport) {
    if (coverExport.disabled) return;
    const engine = cvEngine();
    if (!engine) return;
    const jobId = coverExport.dataset.coverJobId || '';
    const job = currentJobs.find((candidate) => jobIdentity(candidate) === jobId);
    if (!job) return;
    const textarea = document.querySelector(`#cover-letter-${CSS.escape(jobId)}`);
    if (!textarea) return;
    const report = engine.verifyCoverLetter(textarea.value, profileText());
    if (!report.ok) {
      showToast(`Export blocked: ${report.unverified.length} line${report.unverified.length === 1 ? '' : 's'} are not backed by the profile.`);
      return;
    }
    try {
      const doc = engine.buildDocx({ profile: profileText(), coverLetter: textarea.value, job });
      downloadBlob(doc.blob, doc.filename);
      showToast('Exported an ATS-readable .docx (cover letter + profile).');
    } catch (_error) {
      showToast('The .docx export failed on this browser.');
    }
    return;
  }

  const versionSave = event.target.closest('#cv-save-version');
  if (versionSave) {
    const profile = profileText();
    if (!profile) {
      showToast('Add profile text before saving a version.');
      return;
    }
    const labelInput = document.querySelector('#cv-version-name');
    const label = (labelInput?.value || '').trim().slice(0, 40);
    profileVersions = [{ label: label || `Version ${profileVersions.length + 1}`, text: profile, createdAt: new Date().toISOString() }, ...profileVersions].slice(0, 12);
    saveProfileVersions();
    if (labelInput) labelInput.value = '';
    renderProfileVersions();
    showToast('Profile version saved on this device.');
    return;
  }

  const versionRestore = event.target.closest('.cv-version-restore');
  if (versionRestore) {
    const version = profileVersions.find((candidate) => candidate.createdAt === versionRestore.dataset.versionId);
    if (version && cvProfile) {
      cvProfile.value = version.text;
      if (cvMeta) cvMeta.textContent = 'Restored from a saved version — save to keep it';
      renderCvMatches();
      showToast('Version restored to the editor. Save to keep it as the master.');
    }
    return;
  }

  const versionDelete = event.target.closest('.cv-version-delete');
  if (versionDelete) {
    profileVersions = profileVersions.filter((candidate) => candidate.createdAt !== versionDelete.dataset.versionId);
    saveProfileVersions();
    renderProfileVersions();
    showToast('Profile version deleted.');
    return;
  }

  const profileExport = event.target.closest('#cv-export-profile');
  if (profileExport) {
    const engine = cvEngine();
    const profile = profileText();
    if (!engine || !profile) {
      showToast('Add profile text before exporting.');
      return;
    }
    try {
      const doc = engine.buildDocx({ profile });
      downloadBlob(doc.blob, doc.filename);
      showToast('Exported your profile as an ATS-readable .docx.');
    } catch (_error) {
      showToast('The .docx export failed on this browser.');
    }
    return;
  }

  const statusCheck = event.target.closest('.job-status-check');
  if (statusCheck) {
    checkJobStatusFor(statusCheck.dataset.statusJobId || '', statusCheck);
    return;
  }

  const alertsButton = event.target.closest('#alerts-button');
  if (!alertsButton) return;
  if (!('Notification' in window)) {
    showToast('Alerts are not available in this browser.');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('Alerts are off. You can change this in browser settings.');
    return;
  }

  alertsButton.textContent = 'Alerts on';
  if (!API_BASE || !VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Permission is on. Server delivery is not connected yet.');
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/push/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription),
    });
    if (!response.ok) throw new Error(`Subscription returned ${response.status}`);
    showToast('Alerts are on for new matching roles.');
  } catch (_error) {
    showToast('Browser permission is on, but the subscription was not saved.');
  }
});

document.querySelector('#save-profile')?.addEventListener('click', saveProfile);
document.querySelector('#clear-profile')?.addEventListener('click', () => {
  if (cvProfile) cvProfile.value = '';
  saveProfile();
});
refreshButton?.addEventListener('click', () => loadData({ manual: true }));
document.querySelector('#portal-file')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const imported = values.map(normalizePortalListing).filter(Boolean);
    const byId = new Map(portalListings.map((listing) => [listing.id, listing]));
    imported.forEach((listing) => byId.set(listing.id, listing));
    portalListings = [...byId.values()];
    savePortalListings();
    renderJobs([...currentJobs.filter((job) => !String(job.id || '').startsWith('portal_')), ...portalListings]);
    showToast(imported.length ? `Imported ${imported.length} finance-relevant portal listing${imported.length === 1 ? '' : 's'} locally.` : 'No India finance listing passed the local noise filter.');
  } catch (_error) {
    showToast('That portal JSON could not be read.');
  }
  event.target.value = '';
});
document.querySelector('#clear-portal-listings')?.addEventListener('click', () => {
  portalListings = [];
  savePortalListings();
  renderJobs(currentJobs.filter((job) => !String(job.id || '').startsWith('portal_')));
  showToast('Imported portal listings cleared from this device.');
});
cvProfile?.addEventListener('input', () => {
  if (cvMeta) cvMeta.textContent = 'Unsaved changes';
  renderCvQuality();
});
cvFile?.addEventListener('change', () => {
  importFileIntoProfile(cvFile.files?.[0]);
  cvFile.value = '';
});

if (resumeDropzone) {
  ['dragenter', 'dragover'].forEach((name) => resumeDropzone.addEventListener(name, (event) => {
    event.preventDefault();
    resumeDropzone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => resumeDropzone.addEventListener(name, (event) => {
    event.preventDefault();
    resumeDropzone.classList.remove('is-dragging');
  }));
  resumeDropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file && /\.(pdf|txt|md|html)$/i.test(file.name)) {
      importFileIntoProfile(file);
    } else {
      showToast('Drop a .pdf, .txt, .md or .html resume file.');
    }
  });
}

drawerClose?.addEventListener('click', closeDrawer);
drawerOverlay?.addEventListener('click', closeDrawer);
companiesRail?.addEventListener('click', () => openDrawer(companiesRail));
document.querySelector('.wordmark')?.addEventListener('click', closeDrawer);
companySearch?.addEventListener('input', (event) => {
  companySearchTerm = event.target.value || '';
  renderCompanyDirectory();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawer?.classList.contains('is-open')) closeDrawer();
});

window.FirstLookUI = { renderJobs, renderCoverage, safeUrl };
renderCompanyDirectory();
renderProfileVersions();
loadStoredProfile();
loadData();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
