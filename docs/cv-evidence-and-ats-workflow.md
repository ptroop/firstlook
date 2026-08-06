# Evidence-first CV and application-kit workflow

## Purpose

The CV workspace is a local review tool for India finance-role discovery. It is not an automatic applicant, a hiring predictor, or a claim generator. The saved profile is the only source of candidate evidence; role text is treated as untrusted source material and is never allowed to create a new skill, employer, metric, credential or experience claim.

## Four separate signals

1. **Resume readiness** is a deterministic text check for selectable contact details, standard sections, action/evidence lines, quantified evidence and basic ATS-readable structure. Its score is labelled as a heuristic. It is not a universal ATS score, an India-specific employer score, or a probability of interview.
2. **Evidence match** maps extracted posting requirements to exact terms and profile lines. Finance-domain evidence is separate from general tools such as Python or C++, so technical overlap cannot inflate a finance fit by itself.
3. **Hard gaps** are shown explicitly. Location is context, not a missing CV requirement. Missing finance, education, experience or required skill evidence remains a review gap; the app does not silently fill it.
4. **Cover-letter handling** first inspects the posting. A draft is offered only when a cover letter is required, requested, mentioned or explicitly optional, and at least two profile evidence lines support the role. If the posting does not mention one, no generic letter is generated. If the posting text is unavailable, the requirement is unknown.

## Tailoring rules

- The draft uses exact profile excerpts and a conservative structure; it does not invent metrics, duties, achievements or employer knowledge.
- The evidence brief is shown before the draft so the user can reject a weak match rather than polishing it into a misleading application.
- A saved draft remains local to the browser and is editable. The site does not upload the profile, submit an application, upload a CV, or handle credentials.
- Direct Apply links remain governed by the role-source verification rules. A CV score never upgrades an unverified portal listing into an official employer role.

## Reused strategy boundaries

The workflow borrows the useful concepts found in Career-Ops and ai-job-search: deterministic CV quality checks, structured application-field extraction, fit-first triage, requirement-to-evidence mapping, explicit gaps, ATS-safe source material and a verification step before producing application text. AIHawk was reviewed as a strategy reference only; its automated application agent is not embedded because this product is deliberately review-first and must not submit applications on the user's behalf. Any future code reuse from external repositories must retain the applicable license notices.

## What this does not claim

No score here is an employer's ATS score. ATS implementations differ, many India employers do not publish scoring rules, and a text heuristic cannot know how a recruiter will weigh a candidate. The correct interpretation is: “which requirements are evidenced in this saved profile, and what should I verify before tailoring?”

## Benchmark used for regression testing

`fixtures/india-finance-entry-level-resume.txt` is a synthetic, anonymized India finance entry-level profile. It is based on the structure and role evidence in Indeed India's public entry-level Financial Analyst example, with all names, employers and contact details replaced. Reddit was used for market context, but the relevant public posts did not contain a complete resume, so no Reddit user's personal resume was copied. The fixture is used only to test parsing, finance-role evidence, cover-letter gating and hard-gap behavior.

## Refresh behavior

“Refresh now” re-fetches the latest published jobs and coverage snapshot with a cache-busting request. It does not expose the protected scan token or trigger an unauthenticated connector crawl. Scheduled/manual backend scans remain the ingestion mechanism; the button lets a user see newly published results immediately after a scan has completed.
