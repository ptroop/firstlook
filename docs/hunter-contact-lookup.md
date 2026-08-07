# Hunter contact lookup boundary

First Look may use Hunter as an optional, user-triggered contact finder. It is not the default path: the in-house free verifier, evidence-first contact flow and the user's own closed-loop corpus (see [`email-verification-and-corpus.md`](email-verification-and-corpus.md)) replace it for most use. This doc keeps the boundaries for the optional Hunter route.

It is not a bulk recruiter directory and it is not an outreach sender.

## Live workflow (implemented)

1. The user saves a role to an application kit and enters (or imports) a named recruiter, referral contact or alumnus.
2. The user signs in with email (Supabase Auth, PKCE magic link or one-time code). Without a signed-in user the `contact-lookup` Edge Function returns 401.
3. The frontend resolves the employer domain from the official company record (company catalog first, then the role URL, excluding portal hostnames).
4. `POST {API}/contact/lookup` runs Hunter Email Finder for that one person + domain, then returns Hunter's confidence score, verification status and the first evidence source.
5. First Look stores the returned confidence, verification status, source URL and observed date with the local application kit. The kit shows a confidence badge and an evidence-source link, and offers a "Clear evidence" action.
6. The user can build a cold-email draft from the role + their matched CV evidence, tick a review gate, copy it, or open it in their own email client via `mailto:`. First Look never sends email.
7. A follow-up tracker stores 1-2 dated follow-ups per contact (the research-backed ceiling) with sent flags and due-date badges.

## Deployment requirements

- The `contact-lookup` Edge Function is registered with `verify_jwt = true` in `supabase/config.toml`, so the platform rejects missing or invalid user JWTs before the function runs. The function additionally decodes the `sub` claim for per-user rate limiting.
- `HUNTER_API_KEY` lives in Supabase Edge Function secrets only. It never ships in `index.html`, `app.js`, the extension, or localStorage.
- The frontend needs the public `SUPABASE_URL` and `SUPABASE_ANON_KEY` (both are public; set in `index.html`). Add your frontend origin (e.g. the GitHub Pages URL, or `http://127.0.0.1:4173` locally) to Supabase Auth → URL Configuration → Redirect URLs.
- `ALLOWED_ORIGIN` may be set to an additional CORS origin if the frontend is served elsewhere.

## Required boundaries (kept in the implementation)

- Do not run Domain Search automatically for every employer and do not display a bulk employee list.
- Do not infer an email address from a naming pattern when Hunter has no result; the route returns a `no_result` note instead.
- Do not use a LinkedIn profile crawler or use the extension to extract LinkedIn contacts.
- Per-user guards: a 60-second cooldown per person+domain and a 10-lookups-per-hour cap return 429 before hitting Hunter.
- Respect Hunter removal/claimed-email responses and provide a delete action for stored contact evidence (the kit's "Clear evidence" button).
- Only signed-in users can reach the live route.

## Relationship to the homegrown stack

- Verification is now free and in-house (`email-verify`), so the expensive Hunter verifier call is not needed.
- The finder is optional: users can instead paste an email they found with its evidence URL (stored as user-sourced evidence), or use a pattern suggestion from their own confirmed sends (zero-sample ban applies).
- Hunter's remaining role is a last-resort lookup against its observed corpus, for signed-in users who explicitly want it.

## Hiring signals from posts (separate, unverified)

"we are hiring" posts captured manually from LinkedIn/X/etc. are stored locally as unverified signals (see `hiring-signal.js`). They are never merged into the verified job feed, never count as coverage, and never become an Apply URL. A user may explicitly create an application kit from a signal, and that kit stays marked unverified until the role is confirmed on the employer's own site.

The current application kit therefore stores a contact name, role, LinkedIn URL, email, confidence, verification status, evidence/source URL and lookup date locally. The extension can import and copy reviewed data but does not perform contact discovery.
