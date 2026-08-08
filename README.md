# first look. — finance job monitor

A no-dependency static PWA prototype for a personal India finance-jobs command center.

## CV match workspace

The GitHub Pages frontend includes a local-first CV workspace. Upload a PDF resume — parsed locally with a vendored copy of Mozilla pdf.js, no network call — or paste/import a plain-text, Markdown or HTML profile, save it in the browser, and compare it with current roles. `Save copy` is an explicit optional upload through the authenticated Edge Function to a private Supabase bucket; the browser never receives a public file URL. It keeps resume text-readiness, evidence match, hard gaps and cover-letter requirement detection as separate signals. The match is an auditable evidence signal, not an AI hiring decision; the resume score is a heuristic, not an employer ATS score. Cover-letter drafts are gated by the posting text and exact profile evidence, and never fabricate experience, metrics or skills. See [`docs/cv-evidence-and-ats-workflow.md`](docs/cv-evidence-and-ats-workflow.md).

Role cards use the verified role-level Apply URL when one exists; a missing direct Apply URL is shown as pending rather than disguised as a generic career-page link. The optional [review-first form-fill helper](<./browser-extension/README.md>) saves contact fields locally and fills supported public fields only after an explicit user click. It never submits, uploads a CV, or handles passwords.

## Included in this prototype

- All 60 companies from the RCV registry, shown in the Company directory; 110 source connector identities are currently registered in the backend, with structured ATS feeds preferred over Firecrawl fallback
- India / finance / 0–2 years positioning
- Direct links to official employer career pages
- Installable PWA manifest and service worker
- Browser notification permission flow
- Empty-state job feed that does not invent live vacancies
- CV review preview and local cover-letter drafts with profile-line evidence and unsupported-claim guardrails
- Deterministic finance-resume benchmark coverage and a manual refresh of the latest published snapshot without exposing the protected scan route
- Optional API hook for live jobs from the backend
- Explicit one-listing portal capture/import for unsupported employers; portal-only cards stay local and unverified

## Run locally

From this folder, start any static HTTP server:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

The service worker and notification APIs require HTTP(S); opening `index.html` directly will not exercise the PWA behavior.

## GitHub Pages

Upload the contents of this folder to a repository and enable GitHub Pages from the branch/folder containing `index.html`. Set `window.JOB_MONITOR_API` in `index.html` to the deployed Supabase Edge Function URL when the backend is ready.

## Backend

The `backend/` folder contains the Supabase Edge Function, migrations, connector tests, and scanner. The original live verified set covers Moody's, D. E. Shaw, Citi, Goldman Sachs, BlackRock, Barclays, and Razorpay. Groww and PhonePe use Greenhouse, Paytm and CRED use public Lever postings feeds, EY GDS uses an India-filtered Yello job board, and State Street, Northern Trust, Mastercard, Visa, FactSet and Bloomberg use Workday CXS candidates. All source candidates remain subject to complete inventory/detail reconciliation and direct-Apply checks. Firecrawl is reserved for employers without a verified structured feed.

The frontend must not contain the Gemini key, VAPID private key, or any other secret. Those belong in Supabase Edge Function secrets.

Portal discovery is intentionally a separate local-browser path. The extension can capture one visible public listing after an explicit click and the PWA can import it locally. This does not add portal rows to backend coverage, crawl authenticated LinkedIn/Naukri/IIMJobs sessions, or promote a portal URL to an official Apply URL. See [`docs/portal-discovery-strategy.md`](docs/portal-discovery-strategy.md).
