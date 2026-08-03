const companies = [
  ['Goldman Sachs', 'https://www.goldmansachs.com/careers'],
  ['JPMorgan Chase', 'https://careers.jpmorgan.com/global/en/home'],
  ["Moody's", 'https://careers.moodys.com/en/location/india-jobs/49841/1269750/2/1'],
  ['KPMG', 'https://kpmg.com/in/en/careers.html'],
  ['Deloitte', 'https://southasiacareers.deloitte.com/'],
  ['BlackRock', 'https://careers.blackrock.com/job/'],
  ['HSBC', 'https://www.hsbc.com/careers/find-a-job'],
  ['D. E. Shaw', 'https://www.deshawindia.com/careers/work-with-us'],
  ['Accenture', 'https://www.accenture.com/in-en/careers/jobsearch'],
  ['PwC', 'https://www.pwc.in/careers/job-search.html'],
  ['Wells Fargo', 'https://www.wellsfargojobs.com/'],
  ['Citi', 'https://jobs.citi.com/location/india-jobs/287/1269750/2/1'],
  ['Barclays', 'https://search.jobs.barclays/'],
  ['Deutsche Bank', 'https://careers.db.com/professionals/search-roles/index?language_id=1'],
  ['Morgan Stanley', 'https://www.morganstanley.com/careers/career-opportunities-search/'],
  ['Bank of America', 'https://careers.bankofamerica.com/en-us/job-search'],
  ['American Express', 'https://www.americanexpress.com/en-us/careers/'],
  ['PayPal', 'https://careers.pypl.com/'],
  ['NatWest', 'https://jobs.natwestgroup.com/'],
  ['Piramal Finance', 'https://www.piramalfinance.com/careers'],
  ['Fidelity', 'https://jobs.fidelity.com/in/'],
  ['Amazon', 'https://www.amazon.jobs/en/search?country=IND&loc_query=India'],
  ['Microsoft', 'https://jobs.careers.microsoft.com/global/en/search?q=&lc=India'],
  ['Shell', 'https://www.shell.com/careers/search-and-apply.html'],
  ['Siemens', 'https://jobs.siemens.com/careers'],
  ['GE HealthCare', 'https://jobs.gehealthcare.com/global/en'],
  ['Diageo', 'https://www.diageo.com/en/careers'],
  ['Razorpay', 'https://razorpay.com/careers/'],
  ['Pine Labs', 'https://www.pinelabs.com/careers'],
  ['S&P Global', 'https://careers.spglobal.com/jobs'],
  ['Morningstar', 'https://www.morningstar.com/company/careers'],
  ['ICRA', 'https://www.icra.in/careers'],
];

const fixture = {
  jobs: [
    {
      id: 'citi_123', company: 'Citi', title: 'Model Validation Analyst', location: 'Mumbai, India',
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
      applyUrl: 'https://www.linkedin.com/jobs/view/456', applySourceType: 'linkedin', officialVerified: false,
      verificationNote: 'Official listing not yet verified', matchTier: 'exact', eligibilityNote: null,
      newestVerificationAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(), sourceHealthState: 'unknown',
      sources: [{ type: 'linkedin', name: 'LinkedIn', listingUrl: 'https://www.linkedin.com/jobs/view/456', official: false, verifiedAt: new Date().toISOString() }],
    },
    {
      id: 'moodys_789', company: "Moody's", title: 'Senior Financial Data Analyst', location: 'Bengaluru, India',
      applyUrl: 'https://careers.moodys.com/en/job/789', applySourceType: 'official_career', officialVerified: true,
      matchTier: 'possible', eligibilityNote: 'Experience or relevance unconfirmed',
      newestVerificationAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(), sourceHealthState: 'complete',
      sources: [{ type: 'official_career', name: "Moody's Careers", listingUrl: 'https://careers.moodys.com/en/job/789', official: true, verifiedAt: new Date().toISOString() }],
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

const companyGrid = document.querySelector('#company-grid');
const jobList = document.querySelector('#job-list');
const matchesEmpty = document.querySelector('#matches-empty');
const matchesMeta = document.querySelector('#matches-meta');
const coverageList = document.querySelector('#coverage-list');
const coverageMeta = document.querySelector('#coverage-meta');
const toast = document.querySelector('#toast');
const API_BASE = window.JOB_MONITOR_API || '';
const VAPID_PUBLIC_KEY = window.JOB_MONITOR_VAPID_PUBLIC_KEY || '';
const FIXTURE_MODE = new URLSearchParams(window.location.search).get('fixture') === '1';
let toastTimer;

function renderCompanies() {
  companyGrid.innerHTML = companies.map(([name, url]) => `
    <article class="company-item">
      <h3>${escapeHtml(name)}</h3>
      <a class="source-link" href="${safeUrl(url)}" target="_blank" rel="noreferrer">Career page</a>
    </article>
  `).join('');
}

function renderJobs(jobs) {
  if (!jobs.length) {
    showFeedState('No matching roles yet', 'Prior listings are kept when a career-page scan is incomplete.', '0 current matches');
    return;
  }

  matchesEmpty.hidden = true;
  jobList.hidden = false;
  matchesMeta.textContent = `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'}`;
  jobList.innerHTML = jobs.map((job) => {
    const sources = Array.isArray(job.sources) ? job.sources : [];
    const applyUrl = safeUrl(job.applyUrl);
    const statusBadges = [
      `<span class="badge badge-match">${job.matchTier === 'exact' ? 'Strong match' : 'Check match'}</span>`,
      job.officialVerified
        ? '<span class="badge">Official source</span>'
        : '<span class="badge badge-warning">Official not verified</span>',
      ...unique(sources.filter((source) => !source.official).map((source) => `<span class="badge">${escapeHtml(sourceLabel(source.type))}</span>`)),
    ].join('');
    const sourceLinks = sources.map((source) => {
      const url = safeUrl(source.detailUrl || source.listingUrl || source.applyUrl);
      if (!url) return '';
      return `<a href="${url}" target="_blank" rel="noreferrer"><span>${escapeHtml(source.name || sourceLabel(source.type))}</span><small>${source.official ? 'Official' : 'Portal'} / ${escapeHtml(formatAge(source.verifiedAt))}</small></a>`;
    }).join('');
    const note = job.eligibilityNote || job.verificationNote;

    return `
      <article class="job-card">
        <div class="job-main">
          <p class="job-company">${escapeHtml(job.company)}</p>
          <h3>${escapeHtml(job.title)}</h3>
          <p class="job-location">${escapeHtml(job.location || 'Location not listed')}</p>
          <div class="badge-row">${statusBadges}</div>
          ${note ? `<p class="job-note">${escapeHtml(note)}</p>` : ''}
        </div>
        <div class="job-actions">
          <span class="verified-time">Checked ${escapeHtml(formatAge(job.newestVerificationAt))}</span>
          ${applyUrl ? `<a class="button button-dark" href="${applyUrl}" target="_blank" rel="noreferrer">Apply</a>` : '<span class="apply-unavailable">Apply link pending</span>'}
        </div>
        <details class="source-details">
          <summary>Sources (${sources.length})</summary>
          <div class="source-list">${sourceLinks || '<span>No active source link</span>'}</div>
        </details>
      </article>
    `;
  }).join('');
}

function renderCoverage(payload) {
  const sources = Array.isArray(payload?.sources)
    ? payload.sources.filter((source) => source?.latestStatus !== 'unsupported')
    : [];
  if (!sources.length) {
    coverageMeta.textContent = 'No scan history';
    coverageList.innerHTML = '<p class="coverage-empty">Coverage will appear after the first source scan.</p>';
    return;
  }

  coverageMeta.textContent = `${sources.length} verified ${sources.length === 1 ? 'connector' : 'connectors'}`;
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

function showFeedState(title, message, meta) {
  matchesEmpty.querySelector('h3').textContent = title;
  matchesEmpty.querySelector('p').textContent = message;
  matchesMeta.textContent = meta;
  matchesEmpty.hidden = false;
  jobList.hidden = true;
}

function showCoverageError() {
  coverageMeta.textContent = 'Connection error';
  coverageList.innerHTML = '<p class="coverage-empty">Source health is temporarily unavailable. Existing job cards are unchanged.</p>';
}

function navigate(view) {
  const target = document.querySelector(`[data-section="${CSS.escape(view)}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.view === view));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3400);
}

async function loadData() {
  if (FIXTURE_MODE) {
    renderJobs(fixture.jobs);
    renderCoverage(fixture.coverage);
    return;
  }
  if (!API_BASE) {
    showFeedState('Job feed not connected', 'Add the Supabase Edge Function URL to load current roles.', 'Not connected');
    showCoverageError();
    return;
  }

  const base = API_BASE.replace(/\/$/, '');
  const [jobsResult, coverageResult] = await Promise.allSettled([
    fetch(`${base}/jobs`).then(requireJson),
    fetch(`${base}/coverage`).then(requireJson),
  ]);
  if (jobsResult.status === 'fulfilled') renderJobs(Array.isArray(jobsResult.value.jobs) ? jobsResult.value.jobs : []);
  else showFeedState('Job feed unavailable', 'The monitor could not be reached. Try again shortly.', 'Connection error');
  if (coverageResult.status === 'fulfilled') renderCoverage(coverageResult.value);
  else showCoverageError();
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
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? escapeAttribute(url.href) : '';
  } catch (_error) {
    return '';
  }
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
  const viewTrigger = event.target.closest('[data-view]');
  if (viewTrigger) navigate(viewTrigger.dataset.view);

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

window.FirstLookUI = { renderJobs, renderCoverage, safeUrl };
renderCompanies();
loadData();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
