# RCV company and application-kit audit

Date: 2026-08-05

This audit compares `C:\Users\swaro\Downloads\rcv.pdf` with the current First Look registry. The PDF is a planning input, not evidence that every listed employer has a stable, India-specific public job feed.

All 60 employers in the PDF registry are now present in the website's Company directory with segment labels and official career-page links. That directory inclusion is intentionally separate from live connector coverage.

## Company coverage

The PDF names roughly 70 employers. All 60 employers in the website directory now have a source candidate. The registry currently has 72 connector identities: the original verified/source-specific set, Groww and PhonePe through Greenhouse, seven RCV employers through structured Workday/Lever feeds, and a bounded Firecrawl fallback queue for the remaining custom portals. Source health still depends on successful inventory/detail reconciliation.

The PDF companies already represented include Moody's, Citi, Goldman Sachs, Barclays, S&P Global, Morningstar, ICRA, Deloitte, KPMG India, PwC, American Express, Wells Fargo, Deutsche Bank, Bank of America, NatWest, JPMorgan, Morgan Stanley, Razorpay, Pine Labs, HSBC and Microsoft, plus several companies covered by source-specific connectors outside the PDF list.

The main PDF names still requiring Firecrawl fallback or further ATS discovery are:

- Consulting: BCG, BCG Expand, McKinsey, Bain / Capability Network, Kearney, Alvarez & Marsal, ZS.
- Banks and card networks: BNY. State Street, Northern Trust, Mastercard and Visa now use verified Workday feed candidates.
- Data, ratings and indices: MSCI, CRISIL and CARE Ratings. FactSet and Bloomberg now use verified Workday feed candidates.
- Research KPOs: TresVista, The Smart Cube, Evalueserve, Acuity Knowledge Partners, SG Analytics.
- Advisory and Indian finance: EY GDS, GT Bharat, HDFC Bank, ICICI Bank, Axis Bank, Kotak, IDFC First, Bajaj Finserv, Tata Capital.
- Fintech, AMC and broking: CRED, Groww, PhonePe, HDFC AMC, ICICI Pru AMC, Motilal Oswal, Edelweiss and Zerodha. Paytm now uses a public Lever postings feed.

These remain a validation queue, not healthy coverage claims. The next safest wave is official ATS discovery for the custom portals (BCG, McKinsey, Bain/BCN, EY GDS, the KPOs and Indian banks) followed by fixture/count/detail/apply verification. Firecrawl is deliberately limited to this fallback queue, is not used for employers with a stable structured feed, and is disabled for unattended cron polling by default. Do not turn a career-page link or a PDF URL pattern into a connector until the source contract passes.

## Evidence-first CV and cover-letter approach

The current website now follows the PDF's strongest boundary:

- One local master profile is the source of truth.
- Matching points to exact non-empty profile lines; unmatched job terms are review points.
- Cover letters are deterministic local drafts built only from the role title, company name and matched profile-line evidence.
- Drafts can be edited, saved locally per role and copied for review. Nothing is uploaded, auto-submitted or silently fabricated.
- The monitor does not claim to render an ATS-safe PDF or DOCX yet. That should be a separate, tested document-generation slice with parse and visual gates.

The next application-kit slices should be structured bullet IDs, role-family templates, versioned CV outputs, a separate verifier, and a human review gate. The profile model should be upgraded before introducing any model-assisted rewriting.

## Reference-repository decisions

- [career-ops](https://github.com/santifer/career-ops): adopt the separation of job evaluation, legitimacy checks, tailored documents, tracker state and human approval; do not add auto-submit.
- [AIHawk](https://github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk): its code may be reused for this private single-user build as requested, while retaining the AGPL-3.0 notices and source-sharing obligations if distributed. Its browser automation is still not the default monitor path.
- [ai-job-search](https://github.com/MadsLorentzen/ai-job-search): adopt the master-profile, draft/review, verified-claims and document-quality-gate ideas; adapt the workflow to First Look's India-first, official-source model.
