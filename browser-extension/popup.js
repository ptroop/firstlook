const STORAGE_KEY = 'first-look-apply-profile-v1';
const KIT_STORAGE_KEY = 'first-look-application-kit-v1';
const FIELD_NAMES = ['fullName', 'email', 'phone', 'location', 'linkedin', 'degree', 'institution', 'graduationYear'];
const form = document.querySelector('#profile-form');
const status = document.querySelector('#status');
const kitSummary = document.querySelector('#kit-summary');

function cleanProfile(value) {
  return Object.fromEntries(FIELD_NAMES.map((name) => [name, String(value?.[name] || '').trim().slice(0, name === 'linkedin' ? 300 : 200)]));
}

function profileFromKit(value) {
  return cleanProfile(value?.contact || value?.profile || value);
}

function readStoredKit() {
  try { return JSON.parse(localStorage.getItem(KIT_STORAGE_KEY) || 'null'); } catch (_error) { return null; }
}

function renderKit(kit) {
  if (!kitSummary) return;
  if (!kit?.job?.title) {
    kitSummary.hidden = true;
    kitSummary.innerHTML = '';
    return;
  }
  const answers = String(kit.answers || '').trim();
  kitSummary.hidden = false;
  kitSummary.innerHTML = `<span class="kit-meta">Imported application kit</span><h2>${escapeHtml(kit.job.title)}</h2><p>${escapeHtml(kit.job.company || '')} Â· ${escapeHtml(kit.status || 'shortlisted')}</p><div class="kit-actions"><button id="copy-cover-letter" type="button" class="link-button"${kit.coverLetter ? '' : ' disabled'}>Copy reviewed cover letter</button>${answers ? '<button id="copy-answers" type="button" class="link-button">Copy saved answers</button>' : ''}</div>`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function readForm() {
  return cleanProfile(Object.fromEntries(new FormData(form).entries()));
}

function writeForm(profile) {
  const clean = cleanProfile(profile);
  FIELD_NAMES.forEach((name) => { form.elements[name].value = clean[name]; });
}

function setStatus(message) {
  status.textContent = message;
}

async function loadProfile() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  writeForm(stored[STORAGE_KEY] || {});
  renderKit(readStoredKit());
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = readForm();
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
  setStatus('Saved locally. Use Fill current page after reviewing the open role.');
});

document.querySelector('#fill-button').addEventListener('click', async () => {
  const profile = readForm();
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setStatus('No active page found.'); return; }
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillSupportedFields, args: [profile] });
    const filled = result?.[0]?.result?.filled || [];
    setStatus(filled.length ? `Filled ${filled.length} field${filled.length === 1 ? '' : 's'}. Review the page; nothing was submitted.` : 'No supported fields found. Review the page manually.');
  } catch (_error) {
    setStatus('This page does not allow the helper. Open the role form in a normal tab and try again.');
  }
});

document.querySelector('#capture-button').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setStatus('No active page found.'); return; }
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureVisibleListing });
    const listing = result?.[0]?.result;
    if (!listing?.title || !listing?.listingUrl) {
      setStatus('No visible role listing found. Open one role page and try again.');
      return;
    }
    const blob = new Blob([JSON.stringify(listing, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'first-look-portal-listing.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Captured visible listing and downloaded JSON. Import it into First Look for local review.');
  } catch (_error) {
    setStatus('This page does not allow capture. Open a public role page in a normal tab and try again.');
  }
});

document.querySelector('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const profile = profileFromKit(parsed);
    writeForm(profile);
    await chrome.storage.local.set({ [STORAGE_KEY]: profile });
    if (parsed?.type === 'first-look-application-kit') {
      localStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(parsed));
      renderKit(parsed);
      setStatus('Application kit imported and saved locally.');
    } else setStatus('Profile imported and saved locally.');
  } catch (_error) {
    setStatus('That JSON profile could not be read.');
  }
});

kitSummary?.addEventListener('click', async (event) => {
  const kit = readStoredKit();
  const target = event.target.closest('#copy-cover-letter, #copy-answers');
  if (!kit || !target) return;
  const value = target.id === 'copy-cover-letter' ? String(kit.coverLetter || '') : String(kit.answers || '');
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setStatus(target.id === 'copy-cover-letter' ? 'Reviewed cover letter copied.' : 'Saved answers copied.');
  } catch (_error) {
    setStatus('Copy was blocked by the browser.');
  }
});

document.querySelector('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'first-look-apply-profile.json';
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus('Exported a local profile JSON file.');
});

function fillSupportedFields(profile) {
  const forbidden = /password|passcode|otp|one[- ]?time|captcha|security|token|secret|cvv|credit.?card|account number|resume|curriculum|cover.?letter|message|submit/i;
  const patterns = {
    email: /e[- ]?mail|emailaddress/i,
    phone: /phone|mobile|telephone|contact.?number/i,
    linkedin: /linkedin/i,
    degree: /degree|education level|qualification/i,
    institution: /school|college|university|institution/i,
    graduationYear: /graduation|grad(?:uation)? year|year of completion/i,
    location: /city|location|current.?city|address.?city|town/i,
    fullName: /full.?name|candidate.?name|your.?name|name/i,
  };
  const controls = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="password"]), textarea, select')];
  const filled = [];
  const used = new Set();
  const labelFor = (control) => {
    const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
    return [label?.textContent, control.getAttribute('aria-label'), control.getAttribute('placeholder'), control.getAttribute('autocomplete'), control.name, control.id].filter(Boolean).join(' ');
  };
  const setValue = (control, value) => {
    if (!value || forbidden.test(labelFor(control))) return false;
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(control, value); else control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  for (const control of controls) {
    const text = labelFor(control);
    if (forbidden.test(text)) continue;
    const type = Object.entries(patterns).find(([, pattern]) => pattern.test(text))?.[0];
    if (!type || !profile[type] || used.has(type)) continue;
    if (setValue(control, profile[type])) { used.add(type); filled.push(type); }
  }
  return { filled };
}

function captureVisibleListing() {
  const hostname = window.location.hostname.toLowerCase();
  const sourceType = hostname.includes('linkedin') ? 'linkedin'
    : hostname.includes('naukri') ? 'naukri'
      : hostname.includes('iimjobs') ? 'iimjobs'
        : hostname.includes('indeed') ? 'indeed' : 'other';
  const sourceName = ({ linkedin: 'LinkedIn', naukri: 'Naukri', iimjobs: 'IIMJobs', indeed: 'Indeed' })[sourceType] || hostname;
  const textOf = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
  const title = textOf('h1') || document.querySelector('meta[property="og:title"]')?.content?.split(/\s+[|—-]\s+/)[0]?.trim() || document.title.split(/\s+[|—-]\s+/)[0]?.trim() || '';
  const rawTitle = title.replace(/\s+/g, ' ').slice(0, 180);
  const titleParts = rawTitle.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  const cleanTitle = (titleParts ? titleParts[1] : rawTitle).trim();
  const company = (titleParts ? titleParts[2] : '')
    || textOf('[class*="company"], [class*="employer"], [data-testid*="company"]')
    || '';
  const pageText = document.body?.innerText || '';
  const location = pageText.match(/\b(?:Bengaluru|Bangalore|Mumbai|Pune|Hyderabad|Gurugram|Gurgaon|New Delhi|Delhi|Noida|Chennai|Kolkata|Ahmedabad|Jaipur|India)\b[^\n]{0,60}/i)?.[0]?.trim() || '';
  const applyLink = [...document.querySelectorAll('a[href], button')]
    .map((element) => ({ label: (element.textContent || element.getAttribute('aria-label') || '').trim(), href: element.href || '' }))
    .find(({ label, href }) => /\b(?:apply|easy apply|apply now)\b/i.test(label) && /^https:\/\//i.test(href));
  return {
    version: 1,
    sourceType,
    sourceName,
    title: cleanTitle.slice(0, 180),
    company: company.replace(/\s+/g, ' ').slice(0, 120),
    location: location.slice(0, 120),
    listingUrl: window.location.href,
    applyUrl: applyLink?.href || '',
    capturedAt: new Date().toISOString(),
  };
}

loadProfile().catch(() => setStatus('Local profile storage is unavailable.'));
