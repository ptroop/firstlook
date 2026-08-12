# Owner resume inbox design

## Goal

Allow candidates to upload a resume without creating an account or entering a token, while allowing the single site owner to view the original uploaded files in a private inbox.

## Approved behavior

### Candidate flow

1. The candidate selects or drops a PDF, DOCX, TXT, Markdown, or HTML resume.
2. First Look parses supported text locally for readiness scoring and role matching.
3. The candidate sees the parsed resume and local score as today.
4. An explicit `Upload copy` action sends the original file to the backend without requiring candidate authentication.
5. The candidate receives a clear success or failure state. No inbox, file list, owner email, or private download URL is shown.

The local profile remains the source for scoring. Uploading the original copy is a separate explicit action and does not change the evidence-first matching rules.

### Owner flow

1. The owner opens the owner inbox from the Resume check area.
2. The owner signs in with the existing Supabase magic-link flow.
3. The backend authorizes the inbox only when the authenticated email matches the configured owner email.
4. The owner sees the newest uploads first with filename, upload time, content type, and size when available.
5. `View` opens the original file through an authenticated response; `Download` saves it locally; `Delete` removes it from private storage after confirmation.
6. The owner can sign out. The candidate upload surface remains usable while signed out.

## Security and privacy

- The Supabase Storage bucket remains private. No public or long-lived file URLs are emitted.
- Anonymous upload accepts only the allowlisted file types and a maximum of 10 MB, matching the existing backend limit.
- Upload creates a random storage path and never uses an email address or other candidate-provided identity in the path.
- List, view, download, and delete require a valid Supabase session and an exact owner-email allowlist check in the Edge Function.
- The owner email is a backend secret/configuration value, not a frontend constant.
- Candidate-facing responses contain only upload status and a safe display filename; they do not expose storage paths.
- Existing authenticated resume-copy behavior may remain compatible, but candidate upload must no longer call `requireResumeAuth()`.

## UI structure

- Keep the parsed resume visible in the existing Resume check editor after import.
- Rename the candidate action to `Upload copy` so it is clear that this is the original-file handoff, not the local parsing step.
- Add a compact `Owner inbox` panel below the local resume controls.
- Signed-out owner state: explain that the inbox is private and provide `Owner sign in`.
- Signed-in non-owner state: show an access-denied message and no file rows.
- Signed-in owner state: show file rows and authenticated view/download/delete actions.
- Use a blob-backed viewer for PDF and text-like files. For DOCX, provide authenticated download and a clear `Open after download` fallback rather than pretending browser preview is guaranteed.

## Backend contract

- `POST /resume`: anonymous multipart upload; validate file type/size, store in the private `resume-intake` bucket, and return `{ saved: true, name }`.
- `GET /resume/list`: owner-authenticated list of stored copies with safe metadata.
- `GET /resume/download?path=...`: owner-authenticated file response with `Content-Disposition`.
- `DELETE /resume?path=...`: owner-authenticated deletion after path validation.
- Reuse the existing CORS and Supabase service-key storage helpers. Add a small shared owner-authentication helper so list/download/delete cannot drift.

## Failure states

- No backend: local parsing and scoring continue; upload reports that the owner copy service is unavailable.
- Candidate upload rejected: show the server validation message without losing the parsed local profile.
- Owner not configured: owner inbox reports unavailable; candidate upload remains independent.
- Owner session expired: clear the local auth session view and ask the owner to sign in again.
- File missing or deleted: show a recoverable row-level error and refresh the list.

## Verification

- Backend tests cover anonymous upload validation, owner allowlist rejection, owner list/download/delete authorization, and path traversal rejection.
- Frontend checks confirm candidates can upload while signed out, the owner inbox is hidden from candidate state, and owner view/download/delete actions send the correct authenticated requests.
- Browser QA confirms the original PDF is rendered or opened from an authenticated blob response, the local score still appears, and no storage URL is exposed in the DOM.

## Out of scope

- Candidate accounts, candidate tokens, public resume pages, automatic application submission, OCR for image-only resumes, and resume content editing by the owner.
