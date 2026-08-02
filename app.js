const companies = [
  ['Goldman Sachs', 'https://www.goldmansachs.com/careers'],
  ['JPMorgan Chase', 'https://careers.jpmorgan.com/global/en/home'],
  ["Moody's", 'https://careers.moodys.com/en/search_jobs'],
  ['KPMG', 'https://kpmg.com/in/en/careers.html'],
  ['Deloitte', 'https://southasiacareers.deloitte.com/'],
  ['BlackRock', 'https://careers.blackrock.com/job/'],
  ['HSBC', 'https://www.hsbc.com/careers/find-a-job'],
  ['D. E. Shaw', 'https://www.deshawindia.com/careers'],
  ['Accenture', 'https://www.accenture.com/in-en/careers/jobsearch'],
  ['PwC', 'https://www.pwc.in/careers/job-search.html'],
  ['Wells Fargo', 'https://www.wellsfargojobs.com/'],
  ['Citi', 'https://jobs.citi.com/search-jobs'],
  ['Barclays', 'https://search.jobs.barclays/'],
  ['Deutsche Bank', 'https://careers.db.com/professionals/search-roles/index?language_id=1'],
  ['Morgan Stanley', 'https://www.morganstanley.com/careers/career-opportunities-search/'],
  ['Bank of America', 'https://careers.bankofamerica.com/en-us/job-search'],
  ['American Express', 'https://www.americanexpress.com/en-us/careers/'],
  ['PayPal', 'https://careers.pypl.com/'],
  ['NatWest', 'https://jobs.natwestgroup.com/'],
  ['Piramal Finance', 'https://www.piramalfinance.com/careers'],
  ['Fidelity', 'https://jobs.fidelity.com/in/']
];

const companyGrid = document.querySelector('#company-grid');
const jobList = document.querySelector('#job-list');
const matchesEmpty = document.querySelector('#matches-empty');
const matchesEmptyTitle = matchesEmpty.querySelector('h3');
const matchesEmptyMessage = matchesEmpty.querySelector('p');
const matchesMeta = document.querySelector('#matches .section-meta');
const toast = document.querySelector('#toast');
const API_BASE = window.JOB_MONITOR_API || '';
const VAPID_PUBLIC_KEY = window.JOB_MONITOR_VAPID_PUBLIC_KEY || '';
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3400);
}

function renderCompanies() {
  companyGrid.innerHTML = companies.map(([name, url]) => `
    <article class="company-item">
      <div><h3>${name}</h3><p>Official careers</p></div>
      <div class="company-foot"><a class="source-link" href="${url}" target="_blank" rel="noreferrer">View careers</a></div>
    </article>
  `).join('');
}

function navigate(view) {
  const target = document.querySelector(`[data-section="${view}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.view === view));
}

function renderJobs(jobs) {
  if (!jobs.length) {
    showFeedState('No roles here yet.', "When a matching role is found, it will appear here with the employer's original application link.", 'No matching roles');
    return;
  }
  matchesEmpty.hidden = true;
  jobList.hidden = false;
  matchesMeta.textContent = `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'}`;
  jobList.innerHTML = jobs.map((job) => `
    <article class="job-card">
      <div><h3>${escapeHtml(job.title)}</h3><p class="job-company">${escapeHtml(job.company)}</p></div>
      <div class="job-detail"><strong>${escapeHtml(job.location || 'Location not listed')}</strong><span>Found through the employer source</span></div>
      <a class="button button-outline" href="${escapeAttribute(job.applyUrl)}" target="_blank" rel="noreferrer">Apply</a>
    </article>
  `).join('');
}

function showFeedState(title, message, meta) {
  matchesEmptyTitle.textContent = title;
  matchesEmptyMessage.textContent = message;
  matchesMeta.textContent = meta;
  matchesEmpty.hidden = false;
  jobList.hidden = true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

async function loadJobs() {
  if (!API_BASE) return;
  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/jobs`);
    if (!response.ok) throw new Error(`Jobs API returned ${response.status}`);
    const payload = await response.json();
    renderJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
  } catch (_error) {
    showFeedState('Job feed unavailable.', 'The employer monitor could not be reached. Try again shortly.', 'Connection error');
  }
}

document.addEventListener('click', async (event) => {
  const viewTrigger = event.target.closest('[data-view]');
  if (viewTrigger) navigate(viewTrigger.dataset.view);

  if (event.target.closest('#alerts-button')) {
    if (!('Notification' in window)) {
      showToast('Alerts are not available in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      event.target.closest('#alerts-button').textContent = 'Alerts on';
      if (API_BASE && VAPID_PUBLIC_KEY && 'serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
          await fetch(`${API_BASE.replace(/\/$/, '')}/api/push/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) });
          showToast('Alerts are on for new matching roles.');
        } catch (_error) {
          showToast('Browser alerts are on, but the subscription was not saved.');
        }
      } else {
        showToast('Browser permission is on. Server alerts are not connected yet.');
      }
    } else {
      showToast('Alerts are off. You can change this in browser settings.');
    }
  }

  if (event.target.closest('#cv-demo-button')) document.querySelector('#cv-report').hidden = false;
  if (event.target.closest('#close-report')) document.querySelector('#cv-report').hidden = true;
});

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

renderCompanies();
loadJobs();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
