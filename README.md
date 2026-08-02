# first look. — finance job monitor

A no-dependency static PWA prototype for a personal India finance-jobs command center.

## Included in this prototype

- The 21-company target list supplied for the project
- India / finance / 0–2 years positioning
- Direct links to official employer career pages
- Installable PWA manifest and service worker
- Browser notification permission flow
- Empty-state job feed that does not invent live vacancies
- CV review preview with evidence-first copy
- Optional API hook for live jobs from the backend

## Run locally

From this folder, start any static HTTP server:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

The service worker and notification APIs require HTTP(S); opening `index.html` directly will not exercise the PWA behavior.

## GitHub Pages

Upload the contents of this folder to a repository and enable GitHub Pages from the branch/folder containing `index.html`. Set `window.JOB_MONITOR_API` in `index.html` to the deployed Supabase Edge Function URL when the backend is ready.

## Backend scaffold

The `backend/` folder contains the separate Supabase Edge Function and Postgres migration. It is not deployed yet. Follow `backend/README.md` to create the database, set the GitHub Pages origin, and deploy the 30-minute scanner.

The frontend must not contain the Gemini key, VAPID private key, or any other secret. Those belong in Supabase Edge Function secrets.
