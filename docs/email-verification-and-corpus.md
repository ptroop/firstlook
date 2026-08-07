# Homegrown email verification and outreach corpus

First Look replaces the paid Hunter verifier with a free, in-house stack and grows its own email-pattern corpus from the user's confirmed sends. Hunter becomes an optional finder, not the default.

## 1. In-house verification (`email-verify` Edge Function)

Public, keyless, rate-limited route: `GET {API}/email/verify?email=...`

Checks, in order:

1. **Format** — local part character set and length, domain shape.
2. **Role account** — flags `info@`, `hr@`, `careers@` and similar shared inboxes that reply poorly to outreach.
3. **Disposable domain** — a curated throwaway-provider blocklist.
4. **MX records via DNS-over-HTTPS** — keyless JSON lookup (Google DNS primary, Cloudflare fallback). Confirms the domain accepts mail at all and catches domain typos. MX hosts also drive provider detection (Google Workspace, Microsoft 365, Zoho, ...).

Verdicts stay honest: `invalid_format`, `role_account`, `disposable`, `domain_no_mx`, `accepts_mail`, `unknown`.

**Deliberate boundary:** no SMTP mailbox probing. Edge Functions cannot open raw TCP connections, and enterprise/bank mail servers return catch-all or fake accept responses to SMTP enumeration anyway — a false "verified" there would be worse than an honest "domain accepts mail". The route has a per-email cooldown and a global per-minute cap; `verify_jwt = false` (it uses no secrets), registered in `supabase/config.toml`.

## 2. Evidence-first contact flow (the finder replacement)

The kit's contact block supports two provenances, shown as badges:

- **User-sourced · evidence attached** — the user pastes the email and the URL where they saw it (profile website link, alumni page, press release). The evidence URL is stored and exported with the kit.
- **Hunter lookup (optional)** — only if `HUNTER_API_KEY` is configured and the user signs in.

The in-house verifier runs on either path and stores `verifiedEmail`, `verificationStatus`, `verificationLabel`, `verificationProvider` and `verificationCheckedAt` in the kit. If the email changes after verification, the badge is suppressed until the user re-verifies.

## 3. Closed-loop corpus (`outreach-corpus.js`, local)

After a kit is marked sent, the user records the outcome: **Delivered / Bounced / Replied**.

- `delivered` and `replied` are **confirmed sends** — the only results that teach patterns.
- `bounced` is recorded in history but never learned from.
- The module aligns the contact name with the email local part (e.g. "Jane Doe" + `jane.doe@bank.com` → `{first}.{last}`; `jdoe@` → `{f}{last}`; `jane_doe@` → `{first}_{last}`) and counts per-domain pattern frequency.
- **"Suggest from your sends"** then proposes an address for a new person at the same domain, labeled unconfirmed, with the pattern, sample count and confidence.

**Non-negotiable guardrails:**

- **Zero-sample ban** — no confirmed send on a domain means no suggestion, ever. No name-pattern guessing without evidence.
- Addresses that don't align with the contact name are never learned from.
- The corpus lives in `localStorage` on the user's device — it is the user's own data, not a product database.
- Every suggestion is unconfirmed and should be run through the verifier before sending.

## Where Hunter still fits

`contact-lookup` remains available for a signed-in user who wants an email from Hunter's observed corpus, with confidence/verification/evidence stored per the boundaries in [`hunter-contact-lookup.md`](hunter-contact-lookup.md). It is no longer the default path — the free verifier + evidence flow + corpus is.

## Deploy notes

- `supabase functions deploy email-verify` (no secrets needed).
- `supabase functions deploy contact-lookup` + `supabase secrets set HUNTER_API_KEY=...` only if the optional Hunter finder is wanted.
- Frontend needs no new config: `outreach-corpus.js` is a plain script tag.
