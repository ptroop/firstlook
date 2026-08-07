const fixture = {
  jobs: [
    {
      id: 'citi_123', company: 'Citi', title: 'Model Validation Analyst', location: 'Mumbai, India',
      description: 'Requires strong skills in Python, SQL, and Financial Modeling.',
      applyUrl: 'https://citi.wd5.myworkdayjobs.com/job/123/apply', applySourceType: 'official_career',
      officialVerified: true, matchTier: 'exact', eligibilityNote: null,
      postedAt: new Date(Date.now() - 2 * 86400000).toISOString(), firstSeenAt: new Date(Date.now() - 3 * 86400000).toISOString(),
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
      postedAt: new Date(Date.now() - 40 * 86400000).toISOString(), firstSeenAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      newestVerificationAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(), sourceHealthState: 'unknown',
      sources: [{ type: 'linkedin', name: 'LinkedIn', listingUrl: 'https://www.linkedin.com/jobs/view/456', official: false, verifiedAt: new Date().toISOString() }],
    },
    {
      id: 'moodys_789', company: "Moody's", title: 'Senior Financial Data Analyst', location: 'Bengaluru, India',
      description: 'Looking for experts in SQL, Excel, and VBA.',
      applyUrl: 'https://careers.moodys.com/en/job/789', applySourceType: 'official_career', officialVerified: true,
      matchTier: 'possible', eligibilityNote: 'Experience or relevance unconfirmed',
      postedAt: new Date(Date.now() - 12 * 86400000).toISOString(), firstSeenAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      newestVerificationAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(), sourceHealthState: 'complete',
      sources: [{ type: 'official_career', name: "Moody's Careers", listingUrl: 'https://careers.moodys.com/en/job/789', official: true, verifiedAt: new Date().toISOString() }],
    },
    {
      id: 'moodys_790', company: "Moody's", title: 'Senior Financial Data Analyst', location: 'Noida, India',
      description: 'Looking for experts in SQL, Python.',
      applyUrl: 'https://careers.moodys.com/en/job/790', applySourceType: 'official_career', officialVerified: true,
      matchTier: 'possible', eligibilityNote: 'Experience or relevance unconfirmed',
      postedAt: new Date(Date.now() - 45 * 86400000).toISOString(), firstSeenAt: new Date(Date.now() - 45 * 86400000).toISOString(),
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
const candidateSection = document.querySelector('#candidate-section');
const candidateList = document.querySelector('#candidate-list');
const candidateMeta = document.querySelector('#candidate-meta');
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
const applicationKitEmpty = document.querySelector('#application-kit-empty');
const applicationKitPanel = document.querySelector('#application-kit-panel');
const applicationKitList = document.querySelector('#application-kit-list');
const applicationKitMeta = document.querySelector('#application-kit-meta');
let companySearchTerm = '';
let pdfJsPromise = null;
const API_BASE = window.JOB_MONITOR_API || '';
const VAPID_PUBLIC_KEY = window.JOB_MONITOR_VAPID_PUBLIC_KEY || '';
const FIXTURE_MODE = new URLSearchParams(window.location.search).get('fixture') === '1';
let toastTimer;
let currentJobs = [];
let currentCandidates = [];
let latestCoverage = [];
let latestSnapshotAt = null;
let refreshInFlight = false;
const CV_STORAGE_KEY = 'first-look-master-profile-v1';
const CV_VERSIONS_STORAGE_KEY = 'first-look-profile-versions-v1';
const CV_REVIEW_STORAGE_KEY = 'first-look-review-gate-v1';
const CV_EVIDENCE_REVIEW_STORAGE_KEY = 'first-look-cv-evidence-review-v1';
const COVER_LETTER_STORAGE_KEY = 'first-look-cover-letter-drafts-v1';
const PORTAL_STORAGE_KEY = 'first-look-portal-listings-v1';
const ROLE_LINK_STORAGE_KEY = 'first-look-role-links-v1';
const JOB_STATUS_STORAGE_KEY = 'first-look-job-status-v1';
const JOB_STATUS_TTL_MS = 30 * 60 * 1000;
let autoCheckedTopRoles = false;
let selectedApplicationKitId = null;
let feedRecencyDays = 0;
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

function jobListedAt(job) {
  return job?.postedAt || job?.firstSeenAt || '';
}

function jobListedTimestamp(job) {
  const parsed = Date.parse(jobListedAt(job));
  return Number.isFinite(parsed) ? parsed : 0;
}

function jobListedDays(job) {
  const timestamp = jobListedTimestamp(job);
  if (!timestamp) return null;
  if (timestamp > Date.now()) return null; // future-dated employer post (clock skew/typo): treat as unknown
  return Math.floor((Date.now() - timestamp) / 86400000);
}

function formatListedAge(value) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 'date unknown';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days < 2) return 'just now';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365) || 1;
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function visibleFeedJobs() {
  if (!feedRecencyDays) return currentJobs;
  return currentJobs.filter((job) => {
    const days = jobListedDays(job);
    return days === null || days <= feedRecencyDays;
  });
}

function renderFeedFilter() {
  const container = document.querySelector('#feed-filter');
  if (!container) return;
  container.querySelectorAll('.feed-recency').forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.days || 0) === feedRecencyDays);
  });
}

function renderJobs(jobs) {
  currentJobs = Array.isArray(jobs) ? jobs : [];
  renderFeedFilter();
  renderCompanyDirectory();
  renderCvMatches();
  renderApplicationWorkspace();
  if (!jobs.length) {
    showFeedState('No matching roles yet', 'Prior listings are kept when a career-page scan is incomplete.', '0 roles');
    return;
  }

  const visible = visibleFeedJobs();
  if (!visible.length) {
    showFeedState(`No roles listed in the last ${feedRecencyDays} days`, 'Widen the recency filter to see older verified roles.', `${jobs.length} roles in snapshot · filter: last ${feedRecencyDays} days`);
    return;
  }

  matchesEmpty.hidden = true;
  jobList.hidden = false;
  const filteredLabel = feedRecencyDays && visible.length !== jobs.length ? ` of ${jobs.length}` : '';
  matchesMeta.textContent = `${visible.length}${filteredLabel} ${visible.length === 1 ? 'role' : 'roles'}${latestSnapshotAt ? ` · feed updated ${formatAge(latestSnapshotAt)}` : ''}`;

  const byCompany = {};
  for (const job of visible) {
    if (!byCompany[job.company]) byCompany[job.company] = [];
    byCompany[job.company].push(job);
  }
  for (const company of Object.keys(byCompany)) {
    byCompany[company].sort((left, right) => jobListedTimestamp(right) - jobListedTimestamp(left));
  }

  const sortedCompanies = Object.keys(byCompany).sort((left, right) => {
    const newestLeft = Math.max(...byCompany[left].map(jobListedTimestamp));
    const newestRight = Math.max(...byCompany[right].map(jobListedTimestamp));
    return newestRight - newestLeft || left.localeCompare(right);
  });

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
      const listedAt = jobListedAt(job);
      const listedDays = jobListedDays(job);
      const newBadge = listedDays !== null && listedDays <= 7 ? '<span class="badge badge-new">New</span>' : '';
      const isRoleLink = String(job.id || '').startsWith('link_');
      const statusBadges = [
        `${newBadge}`,
        isRoleLink ? '<span class="badge badge-warning">Pasted link</span>' : '',
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
            <span class="verified-time">${listedAt ? `Listed ${escapeHtml(formatListedAge(listedAt))} · ` : ''}Verified ${escapeHtml(formatAge(job.newestVerificationAt))}</span>
            <span class="job-status-area" data-status-job-id="${escapeAttribute(jobId)}">${statusBadgeHtml(jobId)}<button class="text-button job-status-check" type="button" data-status-job-id="${escapeAttribute(jobId)}">Check if open</button></span>
            <button class="text-button application-kit-open" type="button" data-application-job-id="${escapeAttribute(jobId)}">Prepare kit</button>
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

function renderCandidates(candidates) {
  currentCandidates = Array.isArray(candidates) ? candidates : [];
  if (!candidateSection || !candidateList || !candidateMeta) return;
  if (!currentCandidates.length) {
    candidateSection.hidden = true;
    candidateMeta.textContent = '';
    candidateList.innerHTML = '';
    return;
  }

  const byCompany = currentCandidates.reduce((groups, candidate) => {
    const company = String(candidate.company || 'Employer').trim();
    (groups[company] ||= []).push(candidate);
    return groups;
  }, {});
  candidateSection.hidden = false;
  candidateMeta.textContent = `${currentCandidates.length} awaiting detail checks`;
  candidateList.innerHTML = Object.keys(byCompany).sort((a, b) => a.localeCompare(b)).map((company) => `
    <div class="candidate-company">
      <div class="candidate-company-heading"><strong>${escapeHtml(company)}</strong><span>${byCompany[company].length}</span></div>
      ${byCompany[company].slice(0, 12).map((candidate) => {
        const detailUrl = safeUrl(candidate.officialDetailUrl || candidate.sources?.[0]?.detailUrl || '');
        const reasons = Array.isArray(candidate.candidateReasons) ? candidate.candidateReasons.slice(0, 3).join(' · ') : '';
        return `<article class="candidate-card">
          <div><h4>${escapeHtml(candidate.title)}</h4><p>${escapeHtml(candidate.location || 'India')}</p><div class="badge-row"><span class="badge badge-warning">Full JD pending</span><span class="badge">Official source</span></div>${reasons ? `<small>Why it was queued: ${escapeHtml(reasons)}</small>` : ''}</div>
          ${detailUrl ? `<a class="text-button" href="${detailUrl}" target="_blank" rel="noreferrer">Review source</a>` : ''}
        </article>`;
      }).join('')}
      ${byCompany[company].length > 12 ? `<p class="candidate-more">${byCompany[company].length - 12} more candidates are queued for this employer.</p>` : ''}
    </div>
  `).join('');
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

function applicationKitStore() {
  return window.FirstLookApplicationKit || null;
}

function applicationJob(jobId) {
  const liveJob = currentJobs.find((job) => jobIdentity(job) === String(jobId));
  if (liveJob) return liveJob;
  return applicationKitStore()?.get(jobId)?.job || null;
}

function profileContact() {
  const engine = cvEngine();
  const profile = profileText();
  const parsed = engine && profile ? engine.scoreResume(profile).parsed : null;
  const linkedinUrl = profile.match(/https?:\/\/(?:www\.)?linkedin\.com\/[\w./?=-]+/i)?.[0] || '';
  return {
    name: parsed?.displayName || '',
    email: parsed?.email || '',
    phone: parsed?.phone || '',
    linkedinUrl,
  };
}

function prepareApplicationKit(jobId) {
  const store = applicationKitStore();
  const job = applicationJob(jobId);
  if (!store || !job) return;
  store.upsert(job);
  selectedApplicationKitId = jobIdentity(job);
  renderApplicationWorkspace();
  navigate('applications');
}

function renderApplicationWorkspace() {
  if (!applicationKitPanel || !applicationKitList || !applicationKitEmpty || !applicationKitMeta) return;
  const store = applicationKitStore();
  if (!store) return;
  const records = store.all();
  const selected = selectedApplicationKitId ? store.get(selectedApplicationKitId) : null;
  applicationKitMeta.textContent = `${records.length} saved ${records.length === 1 ? 'kit' : 'kits'} · private on this device`;
  applicationKitEmpty.hidden = Boolean(selected);
  applicationKitPanel.hidden = !selected;

  if (selected) {
    const job = selected.job;
    const directUrl = safeUrl(job.officialApplyUrl || (job.officialVerified ? job.applyUrl : ''));
    const roleUrl = safeUrl(job.officialDetailUrl || job.applyUrl);
    const contact = { ...profileContact(), ...(selected.contact || {}) };
    const reviewedEvidence = isCvEvidenceReviewed(selected.id);
    const reviewedCover = isDraftReviewed(selected.id);
    const outreachReviewed = selected.outreachDraftReviewed;
    const domain = employerDomain(job);
    const authUser = window.FirstLookAuth?.currentUser() || null;
    const lookupDisabled = !API_BASE || !domain;
    const lookupTitle = !API_BASE
      ? 'The monitor backend is not connected.'
      : !domain
        ? 'No employer domain is known for this role.'
        : authUser
          ? 'Look up a verified email for this contact via Hunter (server-side).'
          : 'Sign in first — the lookup runs server-side.';
    const lookupLabel = authUser ? 'Find email via Hunter' : 'Sign in to find email';
    const outreachTerms = (() => {
      const engine = cvEngine();
      const profile = profileText();
      if (!engine || !profile) return [];
      try { return (engine.matchJob(applicationJob(selectedApplicationKitId) || job, profile).evidence || []).slice(0, 3).map((item) => item.term); } catch (_error) { return []; }
    })();
    const hasProfile = Boolean(cvEngine() && profileText());
    const outreachHint = outreachTerms.length
      ? `Evidence anchors for this role: ${outreachTerms.map((term) => `<strong>${escapeHtml(term)}</strong>`).join(', ')}.`
      : hasProfile
        ? 'No role text is available for this kit yet, so no evidence anchors could be derived.'
        : 'Add and save a master profile to build the draft from your evidence.';
    const evidenceBadge = contact.emailSource
      ? (contact.emailVerified
        ? '<span class="badge badge-match">Email verified valid</span>'
        : `<span class="badge">Email ${contact.emailConfidence !== null ? `${contact.emailConfidence}% confidence` : 'found'}</span>`)
      : '';
    const evidenceSource = contact.emailSource && /^https:\/\//.test(contact.emailSource)
      ? `<a class="text-button" href="${escapeAttribute(contact.emailSource)}" target="_blank" rel="noreferrer">Evidence source</a>`
      : '';
    const verificationBadge = contact.verificationStatus && contact.verifiedEmail === contact.email
      ? `<span class="badge verdict-${verdictTone(contact.verificationStatus)}">${escapeHtml(contact.verificationLabel || contact.verificationStatus.replace(/_/g, ' '))}</span>`
      : '';
    const verificationStale = contact.verifiedEmail && contact.verificationStatus && contact.verifiedEmail !== contact.email
      ? '<span class="section-meta">Email changed — verify again.</span>'
      : '';
    const provenanceBadge = contact.lookupAt
      ? '<span class="badge">Hunter lookup</span>'
      : (contact.sourceUrl ? '<span class="badge badge-match">User-sourced · evidence attached</span>' : '');
    const canVerify = Boolean(API_BASE) && Boolean(contact.email);
    const suggestDisabled = !domain || String(contact.name || '').trim().split(/\s+/).length < 2;
    const suggestTitle = !domain ? 'No employer domain is known for this role.' : 'Learned only from your own delivered sends — enter a full contact name first.';
    const resultRow = selected.outreachSentAt
      ? `<div class="outreach-result-row">
          <span class="section-meta">How did it go?</span>
          <button class="text-button outreach-result${selected.outreachResult === 'delivered' ? ' is-active' : ''}" type="button" data-result="delivered">Delivered</button>
          <button class="text-button outreach-result${selected.outreachResult === 'bounced' ? ' is-active' : ''}" type="button" data-result="bounced">Bounced</button>
          <button class="text-button outreach-result${selected.outreachResult === 'replied' ? ' is-active' : ''}" type="button" data-result="replied">Replied</button>
        </div>`
      : '';
    const followUpRows = selected.followUps.map((followUp, index) => `
      <div class="follow-up-row ${followUp.sent ? 'is-sent' : (followUp.at && followUp.at <= new Date().toISOString().slice(0, 10)) ? 'is-due' : ''}">
        <span class="follow-up-date">${escapeHtml(followUp.at ? formatDate(followUp.at) : 'No date')}</span>
        <span class="follow-up-note">${escapeHtml(followUp.note || '')}</span>
        <label class="follow-up-sent-label"><input class="follow-up-sent" type="checkbox" data-followup-index="${index}"${followUp.sent ? ' checked' : ''} /> Sent</label>
        <button class="text-button follow-up-remove" type="button" data-followup-index="${index}">Remove</button>
      </div>`).join('');
    applicationKitPanel.innerHTML = `
      <div class="application-kit-heading">
        <div><p class="eyebrow">Selected role</p><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company)} · ${escapeHtml(job.location || 'India')}</p></div>
        <span class="badge ${job.officialVerified ? 'badge-match' : 'badge-warning'}">${job.officialVerified ? 'Official source' : 'Portal lead'}</span>
      </div>
      <div class="application-kit-grid">
        <label class="field-label">Stage<select id="application-kit-status">${applicationKitStore().statuses.map((status) => `<option value="${status}"${selected.status === status ? ' selected' : ''}>${escapeHtml(status.replace('_', ' '))}</option>`).join('')}</select></label>
        <div class="application-kit-checks"><span class="field-label">Review gates</span><span class="kit-check ${reviewedEvidence ? 'is-complete' : ''}">${reviewedEvidence ? '✓' : '○'} CV evidence</span><span class="kit-check ${reviewedCover ? 'is-complete' : ''}">${reviewedCover ? '✓' : '○'} Cover letter</span></div>
      </div>
      <label class="field-label" for="application-kit-answers">Saved application answers <span class="field-help">Drafts only; review each employer question manually.</span></label>
      <textarea id="application-kit-answers" class="application-kit-textarea" rows="5" placeholder="Question: Why this role?\nAnswer: ...">${escapeHtml(selected.answers)}</textarea>
      <label class="field-label" for="application-kit-notes">Notes <span class="field-help">Keep decisions, missing documents and follow-up context here.</span></label>
      <textarea id="application-kit-notes" class="application-kit-textarea" rows="4" placeholder="Next action...">${escapeHtml(selected.notes)}</textarea>
      <div class="application-contact-block">
        <div class="application-kit-subheading"><h4>Recruiter / referral evidence</h4><span class="section-meta">Lookup stays opt-in and server-side; you send the email.</span></div>
        <div class="application-kit-contact-grid">
          <label class="field-label">Name<input id="application-contact-name" value="${escapeAttribute(contact.name)}" maxlength="160" /></label>
          <label class="field-label">Role<input id="application-contact-title" value="${escapeAttribute(contact.title)}" maxlength="180" placeholder="Recruiter, alumnus..." /></label>
          <label class="field-label">Type<select id="application-contact-type">${['recruiter', 'referral', 'alumni', 'other'].map((type) => `<option value="${type}"${contact.type === type ? ' selected' : ''}>${type}</option>`).join('')}</select></label>
          <label class="field-label">LinkedIn URL<input id="application-contact-linkedin" value="${escapeAttribute(contact.linkedinUrl)}" maxlength="500" placeholder="Paste a profile URL" /></label>
          <label class="field-label">Professional email<input id="application-contact-email" value="${escapeAttribute(contact.email)}" maxlength="240" type="email" /></label>
          <label class="field-label">Evidence URL<input id="application-contact-source" value="${escapeAttribute(contact.sourceUrl)}" maxlength="500" placeholder="Where this was found" /></label>
        </div>
        <div class="contact-lookup-line">
          <span class="section-meta">Employer domain: <strong>${escapeHtml(domain || 'unknown')}</strong></span>
          <button class="text-button" type="button" id="application-contact-lookup"${lookupDisabled ? ' disabled' : ''} title="${escapeAttribute(lookupTitle)}">${escapeHtml(lookupLabel)}</button>
          <button class="text-button" type="button" id="application-contact-verify"${canVerify ? '' : ' disabled'} title="${canVerify ? 'Free check: format, role account, disposable domain, and whether the domain accepts mail.' : 'Enter an email first.'}">Verify email</button>
          <button class="text-button" type="button" id="application-contact-suggest"${suggestDisabled ? ' disabled' : ''} title="${escapeAttribute(suggestTitle)}">Suggest from your sends</button>
          ${verificationBadge}${verificationStale}
          ${provenanceBadge}
          ${evidenceBadge}${evidenceSource}
          ${contact.lookupAt ? `<span class="section-meta">Looked up ${escapeHtml(formatAge(contact.lookupAt))}</span>` : ''}
          ${contact.emailSource ? `<button class="text-button" type="button" id="application-contact-clear-lookup">Clear evidence</button>` : ''}
        </div>
        <p class="privacy-note">Do not infer an address. Save only a public or user-provided contact and retain its source.</p>
      </div>
      <div class="application-outreach-block">
        <div class="application-kit-subheading"><h4>Cold email draft</h4><span class="section-meta">Built from the role and your matched evidence. First Look never sends email.</span></div>
        <p class="outreach-evidence">${outreachHint}</p>
        <textarea id="application-outreach-draft" class="application-kit-textarea" rows="8" placeholder="Hi [Name],&#10;&#10;I applied for the [role] at [company] and wanted to introduce myself...">${escapeHtml(selected.outreachDraft)}</textarea>
        <label class="review-gate"><input class="outreach-review" type="checkbox"${outreachReviewed ? ' checked' : ''} /> I reviewed every line of this draft against my profile before sending.</label>
        <div class="cv-controls">
          <button class="button button-dark" type="button" id="application-outreach-build">Build draft</button>
          <button class="text-button" type="button" id="application-outreach-copy"${outreachReviewed && selected.outreachDraft ? '' : ' disabled'} title="${outreachReviewed && selected.outreachDraft ? '' : 'Tick the review checkbox first.'}">Copy draft</button>
          ${outreachReviewed && contact.email && selected.outreachDraft ? '<button class="button" type="button" id="application-outreach-mailto">Open in email app</button>' : ''}
          <button class="text-button" type="button" id="application-outreach-sent">${selected.outreachSentAt ? `Sent ${escapeHtml(formatAge(selected.outreachSentAt))} — undo` : 'Mark as sent'}</button>
        </div>
        ${resultRow}
        <p class="privacy-note">Keep the first message to 4-5 lines and ask for a brief chat, not a job. One or two polite follow-ups, 5-7 days apart, is the research-backed ceiling. Marking a send as delivered or replied teaches the app the employer's email pattern — your own private corpus.</p>
      </div>
      <div class="application-followups">
        <div class="application-kit-subheading"><h4>Follow-up tracker</h4><span class="section-meta">Add after you send the first message.</span></div>
        <div class="follow-up-list" id="application-followup-list">${followUpRows || '<p class="cv-quality-empty">No follow-ups yet.</p>'}</div>
        <div class="follow-up-add">
          <input id="application-followup-at" type="date" aria-label="Follow-up date" />
          <input id="application-followup-note" maxlength="1000" placeholder="Follow-up note" aria-label="Follow-up note" />
          <button class="text-button" type="button" id="application-followup-draft" title="Fill the note with a short draft">Draft note</button>
          <button class="text-button" type="button" id="application-followup-add">Add follow-up</button>
        </div>
      </div>
      <div class="application-kit-actions">
        ${directUrl ? `<a class="button button-accent" href="${directUrl}" target="_blank" rel="noreferrer">Open application</a>` : ''}
        ${roleUrl && roleUrl !== directUrl ? `<a class="text-button" href="${roleUrl}" target="_blank" rel="noreferrer">Review role</a>` : ''}
        <button class="button button-dark" type="button" id="application-kit-save">Save kit</button>
        <button class="text-button" type="button" id="application-kit-export">Export for First Look Copilot</button>
      </div>`;
  }

  applicationKitList.innerHTML = records.map((record) => {
    const followUpLabel = followUpStatus(record);
    return `
    <article class="application-kit-row">
      <div><h4>${escapeHtml(record.job.title)}</h4><p>${escapeHtml(record.job.company)} · ${escapeHtml(record.status.replace('_', ' '))}${followUpLabel ? ` · <span class="badge badge-warning">${escapeHtml(followUpLabel)}</span>` : ''}${record.outreachResult ? ` · <span class="badge">${escapeHtml(record.outreachResult)}</span>` : ''}</p><small>Updated ${escapeHtml(formatAge(record.updatedAt))}</small></div>
      <button class="text-button application-kit-select" type="button" data-application-job-id="${escapeAttribute(record.id)}">Open kit</button>
    </article>`;
  }).join('');
}

function employerDomain(job) {
  const catalog = Array.isArray(window.COMPANY_CATALOG) ? window.COMPANY_CATALOG : [];
  const entry = catalog.find((company) => sameCompany(company.name, job?.company || ''));
  if (entry?.url) {
    try { return new URL(entry.url).hostname.replace(/^www\./i, '').toLowerCase(); } catch (_error) { /* fall through */ }
  }
  const candidate = job?.officialDetailUrl || job?.officialApplyUrl || job?.applyUrl;
  try {
    const hostname = new URL(candidate).hostname.replace(/^www\./i, '').toLowerCase();
    if (!/\.(?:linkedin|naukri|indeed|iimjobs)\.com$/.test(hostname)) return hostname;
  } catch (_error) { /* none */ }
  return '';
}

function firstWord(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function headlineFromProfile(profile) {
  return String(profile || '').split('\n').map((item) => item.trim()).find(Boolean)?.slice(0, 100) || '';
}

function formatDate(value) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value || 'No date');
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function followUpStatus(record) {
  const pending = (record?.followUps || []).filter((item) => !item.sent && item.at).sort((left, right) => left.at.localeCompare(right.at))[0];
  if (!pending) return '';
  const today = new Date().toISOString().slice(0, 10);
  if (pending.at <= today) return 'Follow-up due';
  const days = Math.ceil((Date.parse(`${pending.at}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000);
  if (days <= 3) return `Follow-up in ${days}d`;
  return `Follow-up ${pending.at.slice(5).replace('-', '/')}`;
}

function buildOutreachDraft() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  const engine = cvEngine();
  const profile = profileText();
  if (!engine || !profile) {
    showToast('Save a master profile first — the draft is built from your evidence.');
    return;
  }
  const record = store.get(selectedApplicationKitId);
  const contact = { ...profileContact(), ...(record?.contact || {}) };
  const me = profileContact();
  const result = engine.matchJob(job, profile);
  const evidence = (result.evidence || []).slice(0, 3).map((item) => item.term);
  const firstName = firstWord(contact.name) || 'there';
  const myName = contact.name || me.name || 'Your name';
  const parsed = engine.scoreResume(profile).parsed || {};
  const headline = headlineFromProfile(profile);
  const lines = [
    `Hi ${firstName},`,
    '',
    evidence.length
      ? `I just applied for the ${job.title} opening at ${job.company}${job.location ? ` (${job.location})` : ''} and wanted to introduce myself — my background lines up directly, with hands-on evidence in ${evidence.join(', ')}.`
      : `I just applied for the ${job.title} opening at ${job.company}${job.location ? ` (${job.location})` : ''} and wanted to introduce myself.`,
    '',
    `I'm ${myName}${headline ? ` — ${headline}` : ''}. Would a 10-minute call this week be convenient? I'd love a couple of questions about the team and the role.`,
    '',
    'Thank you,',
    myName,
  ];
  if (me.email || parsed.email) lines.push(me.email || parsed.email);
  if (me.phone || parsed.phone) lines.push(me.phone || parsed.phone);
  store.upsert(job, { outreachDraft: lines.join('\n') });
  showToast('Draft built from your evidence — the email client subject is filled automatically.');
  renderApplicationWorkspace();
}

function openOutreachMailto() {
  const store = applicationKitStore();
  const record = selectedApplicationKitId ? store?.get(selectedApplicationKitId) : null;
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !record?.outreachDraftReviewed || !job) return;
  const textarea = document.querySelector('#application-outreach-draft');
  const draft = (textarea ? textarea.value : record.outreachDraft) || '';
  const email = document.querySelector('#application-contact-email')?.value || record.contact.email || '';
  if (!email || !draft.trim()) { showToast('Add the contact email and a draft first.'); return; }
  const body = draft.split('\n').filter((line) => !/^subject\s*:/i.test(line.trim())).join('\n').trim();
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Application: ${job.title} at ${job.company}`)}&body=${encodeURIComponent(body)}`;
}

async function copyOutreachDraft() {
  const record = selectedApplicationKitId ? applicationKitStore()?.get(selectedApplicationKitId) : null;
  if (!record?.outreachDraftReviewed) return;
  const textarea = document.querySelector('#application-outreach-draft');
  const draft = (textarea ? textarea.value : record.outreachDraft) || '';
  if (!draft.trim()) return;
  try {
    await navigator.clipboard.writeText(draft);
    showToast('Outreach draft copied.', 'ok');
  } catch (_error) {
    const textarea = document.querySelector('#application-outreach-draft');
    if (textarea) textarea.select();
    showToast('Copy was blocked. The draft is selected for manual copy.');
  }
}

function setOutreachReviewed(checked) {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  store.upsert(job, { outreachDraftReviewed: checked });
  renderApplicationWorkspace();
  showToast(checked ? 'Outreach review recorded on this device.' : 'Outreach review gate cleared.');
}

function markOutreachSent() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  const record = store.get(selectedApplicationKitId);
  store.upsert(job, { outreachSentAt: record.outreachSentAt ? '' : new Date().toISOString() });
  renderApplicationWorkspace();
  showToast(record.outreachSentAt ? 'Outreach marked as unsent.' : 'Outreach marked as sent — follow-ups start here.');
}

function followUpDraftText() {
  const record = selectedApplicationKitId ? applicationKitStore()?.get(selectedApplicationKitId) : null;
  const job = record?.job || {};
  const contact = { ...profileContact(), ...(record?.contact || {}) };
  const firstName = firstWord(contact.name) || 'there';
  return `Hi ${firstName}, just bumping this — I applied for ${job.title || 'the role'} at ${job.company || 'your team'} last week and remain very interested. Happy to chat whenever a few minutes open up.`;
}

function insertFollowUpDraft() {
  const note = document.querySelector('#application-followup-note');
  if (!note) return;
  note.value = followUpDraftText();
  note.focus();
}

function addFollowUp() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  const record = store.get(selectedApplicationKitId);
  const at = document.querySelector('#application-followup-at')?.value || '';
  const note = document.querySelector('#application-followup-note')?.value || '';
  if (!at && !note) { showToast('Set a date or a note for the follow-up.'); return; }
  const followUps = [...(record?.followUps || [])];
  if (followUps.length >= 2) { showToast('Keep it to 2 follow-ups per contact — more reads as spam.'); return; }
  followUps.push({ id: `follow-${Date.now()}`, at, note, sent: false });
  store.upsert(job, { followUps });
  renderApplicationWorkspace();
  showToast('Follow-up added to this kit.');
}

function patchFollowUps(mutator) {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  const record = store.get(selectedApplicationKitId);
  store.upsert(job, { followUps: mutator([...(record?.followUps || [])]) });
  renderApplicationWorkspace();
}

function toggleFollowUpSent(index, sent) {
  patchFollowUps((followUps) => followUps.map((item, itemIndex) => (itemIndex === index ? { ...item, sent } : item)));
}

function removeFollowUp(index) {
  patchFollowUps((followUps) => followUps.filter((_item, itemIndex) => itemIndex !== index));
  showToast('Follow-up removed.');
}

async function findRecruiterEmail() {
  const auth = window.FirstLookAuth;
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!auth || !store || !job) return;
  if (!auth.currentUser()) {
    renderAuthForm();
    document.querySelector('#application-auth-bar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Sign in first — recruiter lookup runs server-side.');
    return;
  }
  if (!API_BASE) { showToast('The monitor backend is not connected.'); return; }
  const domain = employerDomain(job);
  if (!domain) { showToast('No employer domain is known for this role.'); return; }
  const record = store.get(selectedApplicationKitId);
  const contact = { ...profileContact(), ...(record?.contact || {}) };
  const nameParts = String(contact.name || '').trim().split(/\s+/);
  if (nameParts.length < 2) { showToast('Enter a full contact name (first and last) first.'); return; }
  const firstName = nameParts[0].slice(0, 120);
  const lastName = nameParts.slice(1).join(' ').slice(0, 120);
  const button = document.querySelector('#application-contact-lookup');
  if (button) { button.disabled = true; button.textContent = 'Looking up…'; }
  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/contact/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${window.FirstLookAuth.sessionToken()}` },
      body: JSON.stringify({ firstName, lastName, domain }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Lookup failed (${response.status})`);
    if (payload.error === 'no_result') {
      renderApplicationWorkspace();
      showToast(payload.note || 'Hunter found no email for this person.');
      return;
    }
    store.upsert(job, {
      contact: {
        ...contact,
        email: payload.email,
        emailSource: payload.source,
        emailConfidence: payload.confidence,
        emailVerified: payload.verification === 'valid',
        lookupAt: payload.observedAt,
      },
    });
    renderApplicationWorkspace();
    showToast(`Found ${payload.email}. Check the confidence and evidence source before outreach.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Lookup failed.');
    renderApplicationWorkspace();
  }
}

function verdictTone(status) {
  return { accepts_mail: 'ok', role_account: 'warn', disposable: 'bad', domain_no_mx: 'bad', invalid_format: 'bad' }[status] || 'muted';
}

async function verifyContactEmail() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  if (!API_BASE) { showToast('The monitor backend is not connected.'); return; }
  const record = store.get(selectedApplicationKitId);
  const contact = { ...profileContact(), ...(record?.contact || {}) };
  const email = (document.querySelector('#application-contact-email')?.value || contact.email || '').trim();
  if (!email) { showToast('Enter an email to verify first.'); return; }
  const button = document.querySelector('#application-contact-verify');
  if (button) { button.disabled = true; button.textContent = 'Verifying…'; }
  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/email/verify?email=${encodeURIComponent(email)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Verification failed (${response.status})`);
    store.upsert(job, {
      contact: {
        ...contact,
        email,
        verifiedEmail: email,
        verificationStatus: payload.status,
        verificationLabel: payload.label,
        verificationProvider: payload.provider || '',
        verificationCheckedAt: payload.checkedAt,
      },
    });
    renderApplicationWorkspace();
    showToast(payload.label || 'Verification complete.');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Verification failed.');
    renderApplicationWorkspace();
  }
}

function suggestContactEmail() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job || !window.FirstLookCorpus) return;
  const record = store.get(selectedApplicationKitId);
  const contact = { ...profileContact(), ...(record?.contact || {}) };
  const domain = employerDomain(job);
  const nameParts = String(contact.name || '').trim().split(/\s+/);
  if (!domain || nameParts.length < 2) { showToast('Enter a full contact name and use a role with a known employer domain.'); return; }
  const suggestion = window.FirstLookCorpus.suggest(domain, nameParts[0], nameParts[nameParts.length - 1]);
  if (!suggestion) {
    showToast('No learned pattern for this domain yet — mark sent emails as delivered to build one.');
    return;
  }
  const emailInput = document.querySelector('#application-contact-email');
  if (emailInput) emailInput.value = suggestion.email;
  showToast(`Pattern suggestion (${suggestion.pattern} from ${suggestion.sampleCount} confirmed send${suggestion.sampleCount === 1 ? '' : 's'}) — unconfirmed; verify before sending.`);
}

function isOwnProfileEmail(email) {
  const own = profileContact().email;
  return Boolean(own && email && String(email).trim().toLowerCase() === own.trim().toLowerCase());
}

function recordOutreachResult(result) {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  const record = store?.get(selectedApplicationKitId);
  if (!store || !job || !record) return;
  const contact = { ...profileContact(), ...(record.contact || {}) };
  store.upsert(job, { outreachResult: result });
  const isOwnEmail = isOwnProfileEmail(contact.email);
  if (contact.email && !isOwnEmail) {
    window.FirstLookCorpus?.recordResult({ name: contact.name || '', email: contact.email, result });
  }
  renderApplicationWorkspace();
  showToast(isOwnEmail
    ? 'Recorded. (This is your own email, so it was not added to the pattern corpus.)'
    : result === 'delivered'
      ? 'Recorded — this confirmed send teaches the app the domain pattern.'
      : result === 'replied'
        ? 'Recorded — a reply is the strongest signal; it feeds the corpus too.'
        : 'Recorded as bounced — kept in history but never learned from.');
}

function clearLookupEvidence() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  const record = store.get(selectedApplicationKitId);
  const contact = { ...profileContact(), ...(record?.contact || {}) };
  store.upsert(job, {
    contact: { ...contact, email: '', emailSource: '', emailConfidence: null, emailVerified: false, lookupAt: '' },
  });
  renderApplicationWorkspace();
  showToast('Stored lookup evidence cleared.');
}

let pendingAuthEmail = '';

function renderAuthBar() {
  const bar = document.querySelector('#application-auth-bar');
  if (!bar) return;
  const auth = window.FirstLookAuth;
  if (!auth) { bar.hidden = true; return; }
  bar.hidden = false;
  if (!auth.isConfigured()) {
    bar.innerHTML = '<span class="auth-status">Recruiter lookup is off: add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in index.html.</span>';
    return;
  }
  const user = auth.currentUser();
  if (user?.email) {
    bar.innerHTML = `<span class="auth-status is-signed-in">Recruiter lookup unlocked · signed in as <strong>${escapeHtml(user.email)}</strong></span><button class="text-button" type="button" id="auth-sign-out">Sign out</button>`;
    return;
  }
  bar.innerHTML = `<span class="auth-status">Recruiter lookup runs server-side behind your own sign-in. Sign in to find a named contact's email for a saved role.</span><button class="text-button" type="button" id="auth-show-form">Sign in with email</button>`;
}

function renderAuthForm() {
  const bar = document.querySelector('#application-auth-bar');
  if (!bar) return;
  bar.innerHTML = `<form class="auth-form" id="auth-form">
    <label class="field-label" for="auth-email">Email<input id="auth-email" type="email" required maxlength="200" placeholder="you@example.com" /></label>
    <div class="cv-controls"><button class="button button-dark" type="submit">Send sign-in link</button><button class="text-button" type="button" id="auth-cancel">Cancel</button></div>
  </form>`;
  document.querySelector('#auth-email')?.focus();
}

function renderAuthCodeForm(email) {
  pendingAuthEmail = email;
  const bar = document.querySelector('#application-auth-bar');
  if (!bar) return;
  bar.innerHTML = `<form class="auth-form" id="auth-code-form">
    <span class="auth-status">Check <strong>${escapeHtml(email)}</strong>. Open the link in this browser, or paste the 6-digit code from the email.</span>
    <label class="field-label" for="auth-code">Code<input id="auth-code" required maxlength="8" inputmode="numeric" placeholder="123456" /></label>
    <div class="cv-controls"><button class="button button-dark" type="submit">Verify</button><button class="text-button" type="button" id="auth-cancel">Cancel</button></div>
  </form>`;
  document.querySelector('#auth-code')?.focus();
}

async function sendAuthLink() {
  const email = document.querySelector('#auth-email')?.value || '';
  const button = document.querySelector('#auth-form button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = 'Sending…'; }
  try {
    await window.FirstLookAuth.sendMagicLink(email);
    renderAuthCodeForm(email);
    showToast('Sign-in link sent. Check your inbox.');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not send the sign-in link.');
    renderAuthBar();
  }
}

async function verifyAuthCode() {
  const code = document.querySelector('#auth-code')?.value || '';
  if (!pendingAuthEmail || !code) { showToast('Enter the code from the email.'); return; }
  try {
    const user = await window.FirstLookAuth.verifyOtpCode(pendingAuthEmail, code);
    pendingAuthEmail = '';
    renderAuthBar();
    renderApplicationWorkspace();
    showToast(`Signed in as ${user?.email || ''}. Recruiter lookup is unlocked.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'That code could not be verified.');
  }
}

async function signOutFlow() {
  await window.FirstLookAuth.signOut();
  renderAuthBar();
  renderApplicationWorkspace();
  showToast('Signed out. Recruiter lookup is locked again.');
}

function renderHiringSignals() {
  const list = document.querySelector('#hiring-signal-list');
  const meta = document.querySelector('#hiring-signal-meta');
  if (!list) return;
  const signals = window.FirstLookHiringSignals?.all() || [];
  if (meta) meta.textContent = `${signals.length} saved ${signals.length === 1 ? 'signal' : 'signals'} · unverified`;
  if (!signals.length) {
    list.innerHTML = '<p class="cv-quality-empty">No signals saved yet. Capture a “we are hiring” post you want to review later — it is never treated as a verified role.</p>';
    return;
  }
  list.innerHTML = signals.map((signal) => `
    <article class="hiring-signal-row">
      <div>
        <h4>${escapeHtml(signal.company)}${signal.title ? ` — ${escapeHtml(signal.title)}` : ''}</h4>
        <p><span class="badge badge-warning">Unverified</span> ${escapeHtml(signal.sourceType)} · ${escapeHtml(formatAge(signal.capturedAt))}</p>
        ${signal.note ? `<small>${escapeHtml(signal.note)}</small>` : ''}
        ${signal.contactName ? `<small>Contact in post: ${escapeHtml(signal.contactName)}${signal.contactEmail ? ` (${escapeHtml(signal.contactEmail)})` : ''}</small>` : ''}
      </div>
      <div class="hiring-signal-actions">
        ${signal.postUrl ? `<a class="text-button" href="${escapeAttribute(signal.postUrl)}" target="_blank" rel="noreferrer">Open post</a>` : ''}
        <button class="text-button hiring-signal-kit" type="button" data-signal-id="${escapeAttribute(signal.id)}">Create kit from signal</button>
        <button class="text-button hiring-signal-remove" type="button" data-signal-id="${escapeAttribute(signal.id)}">Remove</button>
      </div>
    </article>`).join('');
}

function addHiringSignal() {
  const store = window.FirstLookHiringSignals;
  if (!store) return;
  const sourceType = document.querySelector('#hiring-signal-source')?.value || 'other';
  const postUrl = document.querySelector('#hiring-signal-url')?.value || '';
  const company = document.querySelector('#hiring-signal-company')?.value || '';
  const title = document.querySelector('#hiring-signal-title')?.value || '';
  const contact = document.querySelector('#hiring-signal-contact')?.value || '';
  const note = document.querySelector('#hiring-signal-note')?.value || '';
  if (!/^https:\/\//.test(postUrl)) { showToast('The post URL must start with https://'); return; }
  if (!company) { showToast('Add the company named in the post.'); return; }
  const contactName = contact.includes('@') ? '' : contact.slice(0, 160);
  const contactEmail = contact.includes('@') ? contact.trim().slice(0, 240) : '';
  store.add({ sourceType, postUrl, company, title, contactName, contactEmail, note });
  document.querySelector('#hiring-signal-form')?.reset();
  renderHiringSignals();
  showToast('Hiring signal saved as unverified. Confirm the role on the employer site before outreach.');
}

function removeHiringSignal(id) {
  window.FirstLookHiringSignals?.remove(id);
  renderHiringSignals();
  showToast('Hiring signal removed from this device.');
}

function kitFromSignal(id) {
  const store = applicationKitStore();
  const signal = window.FirstLookHiringSignals?.get(id);
  if (!store || !signal) return;
  const job = {
    id: signal.id,
    company: signal.company,
    title: signal.title || 'Role not specified in post',
    location: '',
    description: signal.note,
    applyUrl: signal.postUrl,
    officialApplyUrl: '',
    officialDetailUrl: signal.postUrl,
    officialVerified: false,
    verificationNote: 'Created from an unverified hiring signal; confirm the role on the employer site.',
    matchTier: 'possible',
    newestVerificationAt: signal.capturedAt,
    sources: [{
      type: 'other',
      name: 'Hiring signal (unverified)',
      listingUrl: signal.postUrl,
      detailUrl: signal.postUrl,
      applyUrl: signal.postUrl,
      official: false,
      verifiedAt: signal.capturedAt,
    }],
  };
  store.upsert(job, {
    contact: {
      name: signal.contactName || '',
      title: 'Post author',
      type: 'recruiter',
      linkedinUrl: '',
      email: signal.contactEmail || '',
      sourceUrl: signal.postUrl,
    },
    notes: `Created from a hiring signal (${signal.sourceType}). Verify this role on ${signal.company}'s careers page before any outreach. ${signal.note || ''}`.trim(),
  });
  selectedApplicationKitId = signal.id;
  renderApplicationWorkspace();
  navigate('applications');
  showToast('Kit created from the signal — it stays unverified until you confirm the role.');
}

function applicationKitPatchFromPanel() {
  const existing = selectedApplicationKitId ? (applicationKitStore()?.get(selectedApplicationKitId)?.contact || {}) : {};
  const contact = {
    name: document.querySelector('#application-contact-name')?.value || '',
    title: document.querySelector('#application-contact-title')?.value || '',
    type: document.querySelector('#application-contact-type')?.value || 'recruiter',
    linkedinUrl: document.querySelector('#application-contact-linkedin')?.value || '',
    email: document.querySelector('#application-contact-email')?.value || '',
    sourceUrl: document.querySelector('#application-contact-source')?.value || '',
    // Preserve server-side lookup evidence; it is never editable in the panel.
    emailSource: existing.emailSource || '',
    emailConfidence: existing.emailConfidence ?? null,
    emailVerified: Boolean(existing.emailVerified),
    lookupAt: existing.lookupAt || '',
    verifiedEmail: existing.verifiedEmail || '',
    verificationStatus: existing.verificationStatus || '',
    verificationLabel: existing.verificationLabel || '',
    verificationProvider: existing.verificationProvider || '',
    verificationCheckedAt: existing.verificationCheckedAt || '',
  };
  return {
    status: document.querySelector('#application-kit-status')?.value || 'shortlisted',
    answers: document.querySelector('#application-kit-answers')?.value || '',
    notes: document.querySelector('#application-kit-notes')?.value || '',
    outreachDraft: document.querySelector('#application-outreach-draft')?.value || '',
    contact,
  };
}

function saveApplicationKitFromPanel() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  store.upsert(job, applicationKitPatchFromPanel());
  renderApplicationWorkspace();
  showToast('Application kit saved on this device.');
}

function exportApplicationKit() {
  const store = applicationKitStore();
  const job = applicationJob(selectedApplicationKitId);
  if (!store || !job) return;
  const record = store.upsert(job, applicationKitPatchFromPanel());
  const engine = cvEngine();
  const profile = profileText();
  const coverLetter = coverLetterDrafts[record.id] || '';
  const coverReport = engine && coverLetter ? engine.verifyCoverLetter(coverLetter, profile) : null;
  const payload = store.exportPayload(record, {
    profile,
    contact: { ...profileContact(), ...record.contact },
    coverLetter: isDraftReviewed(record.id) && (!coverReport || coverReport.ok) ? coverLetter : '',
    evidenceReviewed: isCvEvidenceReviewed(record.id),
    coverLetterReviewed: isDraftReviewed(record.id),
  });
  if (!payload) return;
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'first-look-application-kit.json');
  renderApplicationWorkspace();
  showToast('Application kit exported for the First Look Copilot extension.');
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
let roleLinkDrafts = loadRoleLinkDrafts();

function loadReviewedDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(CV_REVIEW_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (_error) {
    return {};
  }
}

let reviewedDrafts = loadReviewedDrafts();

function loadCvEvidenceReviews() {
  try {
    const stored = JSON.parse(localStorage.getItem(CV_EVIDENCE_REVIEW_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (_error) {
    return {};
  }
}

let cvEvidenceReviews = loadCvEvidenceReviews();

function isCvEvidenceReviewed(jobId) {
  return Boolean(cvEvidenceReviews[jobId]);
}

function setCvEvidenceReviewed(jobId, reviewed) {
  if (reviewed) cvEvidenceReviews[jobId] = { at: new Date().toISOString() };
  else delete cvEvidenceReviews[jobId];
  try { localStorage.setItem(CV_EVIDENCE_REVIEW_STORAGE_KEY, JSON.stringify(cvEvidenceReviews)); } catch (_error) { /* private mode */ }
}

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

function loadRoleLinkDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(ROLE_LINK_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((item) => item && typeof item === 'object' && item.title && item.company);
  } catch (_error) {
    return [];
  }
}

function saveRoleLinkDrafts() {
  try { localStorage.setItem(ROLE_LINK_STORAGE_KEY, JSON.stringify(roleLinkDrafts)); } catch (_error) { showToast('This browser blocked local role-link storage.'); }
}

function roleLinkSourceLabel(source) {
  return ({ jsonld: 'Structured posting data', meta: 'Page metadata', title: 'Page title only' })[source] || 'Extracted from the page';
}

function roleLinkConfidenceTone(confidence) {
  return ({ high: 'ok', medium: 'warn', low: 'warn' })[confidence] || 'muted';
}

async function fetchRoleLink(url) {
  if (!API_BASE) { showToast('The monitor backend is not connected.'); return; }
  const preview = document.querySelector('#role-link-preview');
  if (!preview) return;
  const submitButton = document.querySelector('#role-link-form button[type="submit"]');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Fetching…'; }
  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/job-link?url=${encodeURIComponent(url)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Import failed (${response.status})`);
    renderRoleLinkPreview(payload);
    showToast('Role extracted. Review every field before adding it.');
  } catch (error) {
    preview.innerHTML = `<p class="role-link-error">${escapeHtml(error instanceof Error ? error.message : 'Could not fetch that role link.')}</p>`;
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Fetch role'; }
  }
}

let lastRoleLinkExtract = null;

function renderRoleLinkPreview(extract) {
  lastRoleLinkExtract = extract || null;
  const preview = document.querySelector('#role-link-preview');
  if (!preview) return;
  const sourceLabel = roleLinkSourceLabel(extract.source);
  const tone = roleLinkConfidenceTone(extract.confidence);
  preview.innerHTML = `
    <article class="role-link-card">
      <div class="role-link-card-head">
        <div><h4>Extracted role</h4><span class="section-meta">${escapeHtml(sourceLabel)} · <span class="badge verdict-${tone}">${escapeHtml(extract.confidence)} confidence</span></span></div>
        <a class="text-button" href="${escapeAttribute(extract.detailUrl)}" target="_blank" rel="noreferrer">Open original</a>
      </div>
      <p class="privacy-note">${escapeHtml(extract.note || '')} Not an official First Look verification — confirm the role on the employer site before applying.</p>
      <div class="role-link-fields">
        <label class="field-label">Title<input id="role-link-title" maxlength="200" value="${escapeAttribute(extract.title)}" /></label>
        <label class="field-label">Company<input id="role-link-company" maxlength="120" value="${escapeAttribute(extract.company)}" /></label>
        <label class="field-label">Location<input id="role-link-location" maxlength="160" value="${escapeAttribute(extract.location)}" placeholder="India" /></label>
        <label class="field-label" for="role-link-description">Requirements text <span class="field-help">Used locally to tailor your CV and decide whether a cover letter is expected.</span></label>
        <textarea id="role-link-description" class="application-kit-textarea" rows="10">${escapeHtml(extract.description || '')}</textarea>
      </div>
      <div class="cv-controls">
        <button class="button button-dark" type="button" id="role-link-confirm">Add role &amp; prepare kit</button>
        <button class="text-button" type="button" id="role-link-discard">Discard</button>
      </div>
    </article>`;
}

function confirmRoleLink() {
  const title = document.querySelector('#role-link-title')?.value.trim() || '';
  const company = document.querySelector('#role-link-company')?.value.trim() || '';
  if (!title || !company) { showToast('Add a title and company for the role.'); return; }
  const url = document.querySelector('#role-link-url')?.value.trim() || '';
  // Prefer the server's canonical (post-redirect) detail URL and extracted
  // apply path over the raw pasted input.
  const detailUrl = lastRoleLinkExtract?.detailUrl || url;
  const applyUrl = lastRoleLinkExtract?.applyUrl || '';
  const listing = {
    id: `link_${simpleHash(detailUrl || url || title)}`,
    company,
    title,
    location: document.querySelector('#role-link-location')?.value.trim() || 'India',
    description: document.querySelector('#role-link-description')?.value || '',
    applyUrl,
    officialApplyUrl: '',
    officialDetailUrl: detailUrl,
    officialVerified: false,
    verificationNote: 'Pasted role link; confirm the role and Apply path on the employer site.',
    matchTier: 'possible',
    firstSeenAt: new Date().toISOString(),
    newestVerificationAt: new Date().toISOString(),
    sourceHealthState: 'unknown',
    sources: [{ type: 'other', name: 'Pasted role link', listingUrl: detailUrl, detailUrl, applyUrl, official: false, verifiedAt: new Date().toISOString() }],
  };
  const byId = new Map(roleLinkDrafts.map((item) => [item.id, item]));
  byId.set(listing.id, listing);
  roleLinkDrafts = [...byId.values()];
  saveRoleLinkDrafts();
  document.querySelector('#role-link-preview')?.replaceChildren();
  document.querySelector('#role-link-form')?.reset();
  renderJobs([...currentJobs.filter((job) => !String(job.id || '').startsWith('link_')), ...roleLinkDrafts]);
  prepareApplicationKit(listing.id);
  showToast('Role added locally. The kit is ready — tailor your CV and cover letter from the CV match panel.');
}

function discardRoleLink() {
  lastRoleLinkExtract = null;
  const preview = document.querySelector('#role-link-preview');
  if (preview) preview.replaceChildren();
  document.querySelector('#role-link-form')?.reset();
}

function clearRoleLinkDrafts() {
  roleLinkDrafts = [];
  saveRoleLinkDrafts();
  renderJobs(currentJobs.filter((job) => !String(job.id || '').startsWith('link_')));
  showToast('Imported role links cleared from this device.');
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
  const pool = visibleFeedJobs();
  if (!pool.length) {
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
  const ranked = pool.map((job) => ({ job, result: engine.matchJob(job, profile) }))
    .sort((left, right) => (right.result.score ?? -1) - (left.result.score ?? -1))
    .slice(0, 10);
  cvResultsMeta.textContent = `Top ${ranked.length} of ${pool.length} roles${feedRecencyDays ? ` · last ${feedRecencyDays} days` : ''}`;
  cvResults.innerHTML = ranked.map(({ job, result }) => {
    const applyUrl = directApplyUrl(job);
    const roleUrl = roleReviewUrl(job);
    const jobId = jobIdentity(job);
    const canDraftCoverLetter = ['required', 'mentioned', 'optional'].includes(result.coverLetter.status);
    const draft = canDraftCoverLetter ? (coverLetterDrafts[jobId] || engine.buildCoverLetter(job, result, profile)) : '';
    const reviewed = isDraftReviewed(jobId);
    const evidenceReviewed = isCvEvidenceReviewed(jobId);
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
      <div class="cv-result-actions">${applyUrl ? `<a class="button button-accent" href="${applyUrl}" target="_blank" rel="noreferrer">${job.officialApplyUrl ? 'Apply direct' : 'Open role'}</a>` : ''}${roleUrl && roleUrl !== applyUrl ? `<a class="text-button" href="${roleUrl}" target="_blank" rel="noreferrer">Review role</a>` : ''}<button class="text-button application-kit-open" type="button" data-application-job-id="${escapeAttribute(jobId)}">Prepare application kit</button><button class="text-button cv-brief-toggle" type="button" data-cv-job-id="${escapeAttribute(jobId)}">Show evidence brief</button><label class="review-gate"><input class="cv-evidence-review" type="checkbox" data-cv-job-id="${escapeAttribute(jobId)}"${evidenceReviewed ? ' checked' : ''} /> I reviewed the evidence brief</label><button class="text-button cv-tailored-export" type="button" data-cv-job-id="${escapeAttribute(jobId)}"${evidenceReviewed ? '' : ' disabled'} title="${evidenceReviewed ? '' : 'Review the evidence brief first.'}">Export tailored CV</button>${coverButton}</div>
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

  const sourcesWithBacklog = sources.filter((source) => Number(source.candidateBacklog || 0) > 0).length;
  const companiesWithRoles = new Set(currentJobs.map((job) => companyKey(job.company))).size;
  coverageMeta.textContent = `${sources.length} verified sources · ${companiesWithRoles} companies publishing roles${sourcesWithBacklog ? ` · ${sourcesWithBacklog} with detail backlog` : ''}`;
  coverageList.innerHTML = sources.map((source) => {
    const status = source.latestStatus || 'unknown';
    const progress = source.reconcile || source.watch;
    const backlog = Number(source.candidateBacklog || 0);
    const statusText = status === 'complete'
      ? (backlog > 0 ? 'Current inventory · detail checks still queued' : 'Current inventory')
      : status === 'partial' || status === 'anomalous'
        ? 'Full scan incomplete - keeping prior listings'
        : status === 'failed'
          ? 'Source unavailable - keeping prior listings'
          : 'Not checked';
    const counts = progress && Number.isFinite(progress.listingsDiscovered)
      ? `${progress.listingsDiscovered}${Number.isFinite(progress.reportedTotal) ? ` of ${progress.reportedTotal}` : ''} summaries`
      : 'Count unavailable';
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
  const registryMeta = window.RCV_REGISTRY_META || {};
  const planningLabel = registryMeta.planningTargetLabel || 'RCV planned targets';
  const normalizedLabel = registryMeta.normalizedEmployerLabel || `${catalog.length} normalized employers`;
  companiesMeta.textContent = `${prefix} employers - ${planningLabel} - ${normalizedLabel} - ${liveRoleCount} with matching roles in the current snapshot`;
  companyDirectory.innerHTML = Object.entries(groups).map(([segment, companies]) => `
    <section class="company-group">
      <div class="company-group-heading"><h3>${escapeHtml(segment)}</h3><span>${companies.length}</span></div>
      <div class="company-directory-grid">
        ${companies.map((company) => {
          const url = safeUrl(company.url);
          const source = latestCoverage.find((candidate) => sameCompany(candidate.company, company.name));
          const roles = currentJobs.filter((job) => sameCompany(job.company, company.name)).length;
          const sourceStatus = source?.latestStatus || '';
          const sourceBacklog = Number(source?.candidateBacklog || 0);
          const sourceLabel = sourceStatus === 'complete'
            ? sourceBacklog > 0 ? `Verified source · ${sourceBacklog} detail checks queued` : 'Verified source'
            : sourceStatus === 'failed'
              ? 'Source unavailable'
              : sourceStatus === 'partial' || sourceStatus === 'anomalous'
                ? `Source ${sourceStatus} · roles withheld until reconciled`
                : source
                  ? 'Source not checked'
                  : 'No verified connector yet';
          const roleLabel = roles > 0
            ? `${roles} matching role${roles === 1 ? '' : 's'}`
            : sourceStatus === 'complete'
              ? 'No strict 0–2 finance role in snapshot'
              : 'No published role in snapshot';
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
      renderJobs([...fixture.jobs, ...portalListings, ...roleLinkDrafts]);
      renderCandidates([]);
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
    const [jobsResult, coverageResult, candidatesResult] = await Promise.allSettled([
      fetch(`${base}/jobs${cacheBust}`).then(requireJson),
      fetch(`${base}/coverage${cacheBust}`).then(requireJson),
      fetch(`${base}/candidates${cacheBust}`).then(requireJson),
    ]);
    if (jobsResult.status === 'fulfilled') {
      latestSnapshotAt = jobsResult.value?.snapshotAt || null;
      renderJobs([...(Array.isArray(jobsResult.value.jobs) ? jobsResult.value.jobs : []), ...portalListings, ...roleLinkDrafts]);
      autoCheckTopRoles();
    } else showFeedState('Job feed unavailable', 'The monitor could not be reached. Try again shortly.', 'Connection error');
    if (coverageResult.status === 'fulfilled') renderCoverage(coverageResult.value);
    else showCoverageError();
    if (candidatesResult.status === 'fulfilled') renderCandidates(candidatesResult.value?.candidates);
    else renderCandidates([]);
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

  const feedRecency = event.target.closest('.feed-recency');
  if (feedRecency) {
    feedRecencyDays = Number(feedRecency.dataset.days || 0);
    renderJobs(currentJobs);
    return;
  }

  const applicationKitOpen = event.target.closest('.application-kit-open, .application-kit-select');
  if (applicationKitOpen) {
    prepareApplicationKit(applicationKitOpen.dataset.applicationJobId || '');
    return;
  }

  if (event.target.closest('#application-kit-save')) {
    saveApplicationKitFromPanel();
    return;
  }

  if (event.target.closest('#application-kit-export')) {
    exportApplicationKit();
    return;
  }

  if (event.target.closest('#application-contact-lookup')) {
    findRecruiterEmail();
    return;
  }

  if (event.target.closest('#application-contact-clear-lookup')) {
    clearLookupEvidence();
    return;
  }

  if (event.target.closest('#application-contact-verify')) {
    verifyContactEmail();
    return;
  }

  if (event.target.closest('#application-contact-suggest')) {
    suggestContactEmail();
    return;
  }

  const outreachResultButton = event.target.closest('.outreach-result');
  if (outreachResultButton) {
    recordOutreachResult(outreachResultButton.dataset.result || '');
    return;
  }

  if (event.target.closest('#application-outreach-build')) {
    buildOutreachDraft();
    return;
  }

  if (event.target.closest('#application-outreach-copy')) {
    copyOutreachDraft();
    return;
  }

  if (event.target.closest('#application-outreach-mailto')) {
    openOutreachMailto();
    return;
  }

  if (event.target.closest('#application-outreach-sent')) {
    markOutreachSent();
    return;
  }

  if (event.target.closest('#application-followup-add')) {
    addFollowUp();
    return;
  }

  if (event.target.closest('#application-followup-draft')) {
    insertFollowUpDraft();
    return;
  }

  const followUpSent = event.target.closest('.follow-up-sent');
  if (followUpSent) {
    toggleFollowUpSent(Number(followUpSent.dataset.followupIndex), followUpSent.checked);
    return;
  }

  const followUpRemove = event.target.closest('.follow-up-remove');
  if (followUpRemove) {
    removeFollowUp(Number(followUpRemove.dataset.followupIndex));
    return;
  }

  const outreachReview = event.target.closest('.outreach-review');
  if (outreachReview) {
    setOutreachReviewed(outreachReview.checked);
    return;
  }

  if (event.target.closest('#auth-show-form')) {
    renderAuthForm();
    return;
  }

  if (event.target.closest('#auth-cancel')) {
    pendingAuthEmail = '';
    renderAuthBar();
    return;
  }

  if (event.target.closest('#auth-sign-out')) {
    signOutFlow();
    return;
  }

  const signalRemove = event.target.closest('.hiring-signal-remove');
  if (signalRemove) {
    removeHiringSignal(signalRemove.dataset.signalId || '');
    return;
  }

  const signalKit = event.target.closest('.hiring-signal-kit');
  if (signalKit) {
    kitFromSignal(signalKit.dataset.signalId || '');
    return;
  }

  const briefToggle = event.target.closest('.cv-brief-toggle');
  if (briefToggle) {
    const brief = document.querySelector(`#cv-brief-${CSS.escape(briefToggle.dataset.cvJobId || '')}`);
    if (brief) {
      brief.hidden = !brief.hidden;
      briefToggle.textContent = brief.hidden ? 'Show tailoring brief' : 'Hide tailoring brief';
    }
    return;
  }

  const evidenceReview = event.target.closest('.cv-evidence-review');
  if (evidenceReview) {
    const jobId = evidenceReview.dataset.cvJobId || '';
    setCvEvidenceReviewed(jobId, evidenceReview.checked);
    renderApplicationWorkspace();
    const exportButton = evidenceReview.closest('.cv-result-actions')?.querySelector('.cv-tailored-export');
    if (exportButton) {
      exportButton.disabled = !evidenceReview.checked;
      exportButton.title = evidenceReview.checked ? '' : 'Review the evidence brief first.';
    }
    showToast(evidenceReview.checked ? 'Evidence review recorded on this device.' : 'Evidence review gate cleared.');
    return;
  }

  const tailoredExport = event.target.closest('.cv-tailored-export');
  if (tailoredExport) {
    if (tailoredExport.disabled) return;
    const engine = cvEngine();
    const profile = profileText();
    const jobId = tailoredExport.dataset.cvJobId || '';
    const job = currentJobs.find((candidate) => jobIdentity(candidate) === jobId);
    if (!engine || !profile || !job) return;
    try {
      const analysis = engine.matchJob(job, profile);
      const tailored = engine.buildTailoredProfile(job, analysis, profile);
      const doc = engine.buildDocx({ profile: tailored.text, job, filename: 'first-look-tailored-cv' });
      downloadBlob(doc.blob, doc.filename);
      showToast('Exported a tailored ATS-readable CV using original profile lines only.');
    } catch (_error) {
      showToast('The tailored CV export failed on this browser.');
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
    renderApplicationWorkspace();
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
document.querySelector('#role-link-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = document.querySelector('#role-link-url')?.value.trim() || '';
  if (!url) { showToast('Paste a role posting URL first.'); return; }
  fetchRoleLink(url);
});
document.querySelector('#clear-role-links')?.addEventListener('click', clearRoleLinkDrafts);
document.addEventListener('click', (event) => {
  if (event.target.closest('#role-link-confirm')) {
    confirmRoleLink();
    return;
  }
  if (event.target.closest('#role-link-discard')) {
    discardRoleLink();
  }
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

document.addEventListener('submit', async (event) => {
  const authForm = event.target.closest('#auth-form');
  if (authForm) {
    event.preventDefault();
    await sendAuthLink();
    return;
  }
  const authCodeForm = event.target.closest('#auth-code-form');
  if (authCodeForm) {
    event.preventDefault();
    await verifyAuthCode();
    return;
  }
  const signalForm = event.target.closest('#hiring-signal-form');
  if (signalForm) {
    event.preventDefault();
    addHiringSignal();
  }
});

window.FirstLookUI = { renderJobs, renderCoverage, safeUrl };
renderAuthBar();
renderHiringSignals();
window.FirstLookAuth?.onAuthChange(() => {
  renderAuthBar();
  renderApplicationWorkspace();
});
renderCompanyDirectory();
renderProfileVersions();
loadStoredProfile();
loadData();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
