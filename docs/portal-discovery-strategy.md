# Unsupported employers and secondary portal strategy

Updated 2026-08-06.

The RCV catalogue remains exhaustive: all 60 employers are registered as source
candidates. “Registered” means the employer is tracked in the directory and in
the coverage queue; it does not mean that a live role feed has passed
reconciliation. The monitor must never fill a gap with a generic careers link
and call it a direct application.

## Source precedence

Use the strongest source that can prove a stable role identity and a role-level
Apply destination:

1. Employer-owned ATS/API: Workday CXS, Greenhouse, Lever, Oracle Recruiting,
   Jibe, SuccessFactors, Avature, or another public structured feed.
2. Employer-owned custom search: only after inventory count, stable role ID,
   India location, detail hydration, and direct Apply URL are verified in
   fixtures and a live smoke scan.
3. Explicit portal discovery: a public listing captured by the user or a
   permitted public feed. This is a sentinel, not official coverage.
4. Firecrawl fallback: a deliberately invoked, quota-checked scan for a source
   without a verified structured or custom connector. It is not scheduled by
   default.

When an official observation and a portal observation refer to the same role,
the canonical job keeps the official title, description, location, timestamps,
detail URL, and Apply URL. A portal-only observation remains visible as
`Official listing not yet verified` until that reconciliation succeeds.

## Official discovery queue

These are the remaining RCV candidates currently in the quota-gated fallback
waves. The URLs below are discovery pages, not direct role links.

| Employer | Current source | Next connector investigation |
| --- | --- | --- |
| BCG | [India careers](https://careers.bcg.com/global/en/locations/india/000000000000000) | Custom/dynamic search; keep Consulting and Business Services separate |
| BCG Expand | [Expand team](https://careers.bcg.com/global/en/teams/expand) | Confirm whether roles share the BCG search index |
| McKinsey | [India careers](https://www.mckinsey.com/in/careers-in-india) | Custom/dynamic search; separate consulting, internal, and student paths |
| Bain / Capability Network | [Bain careers](https://www.bain.com/careers/) | Custom/dynamic search; confirm Capability Network India identity |
| Kearney | [India roles](https://www.kearney.com/about/locations/india/careers/india-people-careers) | Custom search; internal finance roles are distinct from consulting roles |
| Alvarez & Marsal | [Careers](https://www.alvarezandmarsal.com/careers) | Discover public role endpoint |
| ZS | [Careers](https://www.zs.com/careers) | Discover public role endpoint and exclude technology noise |
| BNY | [Work with us](https://www.bny.com/corporate/global/en/about-us/careers/work-with-us.html) | Discover the linked search/ATS endpoint |
| MSCI | [Careers](https://careers.msci.com/) | Custom search; finance, research, and data/operations need separate filtering |
| CRISIL | [CRISIL Careers](https://career.crisil.com/crisil/) | Zwayam public search; verify role IDs and direct apply pages |
| CARE Ratings | [CareEdge careers](https://www.careratings.com/careers) | Inspect public search surface; do not infer from unrelated client postings |
| TresVista | [Careers](https://www.tresvista.com/careers/) | Discover public role endpoint |
| The Smart Cube | [Careers](https://www.thesmartcube.com/careers) | Discover public role endpoint |
| Evalueserve | [Careers](https://www.evalueserve.com/careers/) | Discover public role endpoint |
| Acuity Knowledge Partners | [Careers](https://www.acuitykp.com/careers/) | Discover public role endpoint |
| SG Analytics | [Careers](https://www.sganalytics.com/careers/) | Discover public role endpoint |
| EY GDS | [India careers](https://www.ey.com/en_in/careers) | Identify the current country search/API and distinguish GDS finance roles |
| GT Bharat | [Careers](https://www.grantthornton.in/careers/) | Identify India search/API and filter advisory finance roles |
| HDFC Bank | [Careers](https://www.hdfcbank.com/personal/about-us/careers) | Confirm employer-owned applicant system; do not use third-party HDFC client pages |
| ICICI Bank | [ICICI Careers](https://www.icicicareers.com/) | Verify public role search and direct application route |
| Axis Bank | [Careers](https://www.axisbank.com/careers) | Verify public role search and direct application route |
| Kotak | [Careers](https://www.kotak.com/en/about-us/careers.html) | Verify entity-specific role search |
| IDFC First | [Careers](https://www.idfcfirstbank.com/about-us/careers) | Verify public role search and direct application route |
| Bajaj Finserv | [Careers](https://www.bajajfinserv.in/careers) | Verify public role search and direct application route |
| Tata Capital | [Careers](https://www.tatacapital.com/careers.html) | Verify public role search and direct application route |
| CRED | [Openings](https://careers.cred.club/openings) | Inspect public page data; do not assume the shell is a feed until role IDs are extracted |
| HDFC AMC | [Careers](https://www.hdfcfund.com/about-us/careers) | Verify the AMC entity and public role search |
| ICICI Pru AMC | [Careers](https://www.icicipruamc.com/careers) | Verify the AMC entity and public role search |
| Motilal Oswal | [Careers](https://www.motilaloswalgroup.com/careers) | Verify group/entity and public role search |
| Edelweiss | [Careers](https://www.edelweissfin.com/careers) | Verify the correct Edelweiss entity and public role search |
| Zerodha | [Careers](https://zerodha.com/careers/) | Keep Zerodha separate from Zerodha Fund House; never merge their roles |

The first seven rows are the best custom-search candidates because the official
sites expose distinct India careers paths. CRISIL is the strongest immediate
ATS investigation because its careers surface is a public Zwayam portal. None
of these rows is promoted to “supported” until the connector contract passes.

## Portal policy

| Source | Use in First Look | Direct scraping decision |
| --- | --- | --- |
| LinkedIn | Discovery sentinel or an explicitly shared listing URL | No unauthorised crawler. Use an approved API, user-owned alert/email, or explicit one-listing capture. |
| Naukri | Discovery sentinel or an explicitly shared listing URL | No logged-in scraping or private endpoint use. Use user-owned alerts/email or explicit capture. |
| IIMJobs | Discovery sentinel or an explicitly shared listing URL | The public site is a JavaScript application; no stable candidate feed was verified. Use alert/email or explicit capture. |
| Indeed | Discovery sentinel where a permitted public feed exists | Preserve source provenance and never treat a portal result as official. |
| Jobs24x | Optional tech-oriented discovery only | Its public site describes direct links sourced from company career pages, but it is not an RCV finance coverage source until a public listing endpoint is verified. |
| Jobs24x7 | Do not use as a feed yet | The public page inspected is a landing/contact surface without a verified listing feed. |

LinkedIn’s current API terms prohibit obtaining LinkedIn content by scraping,
crawling, or spidering outside permitted APIs, and its Job Posting API is a
vetted/approved product. That is why the product does not silently add a
LinkedIn crawler. The same boundary applies to Naukri and IIMJobs: an
authenticated browser session is not a public feed.

## Implemented single-user intake

The local browser extension now has `Capture visible listing`. After the user
opens one public role page and clicks that button, it downloads only:

- source type and source name;
- visible title, company, and location;
- current listing URL;
- a visible Apply URL when one is present; and
- capture time.

The First Look Open roles section imports that JSON into local browser storage.
Only India locations and finance-relevant, non-obviously-technical titles are
accepted. Imported cards are portal-only, remain out of official coverage
counts, and do not receive an `Apply direct` button. They can still be used by
the local CV match and evidence-only cover-letter workflow. Clear imported
listings removes them from that browser only.

This gives the single-user workflow a low-friction escape hatch for unsupported
companies without spending Firecrawl quota or handling portal credentials. A
future server-side portal adapter should accept only an approved public feed or
user-owned alert input and must reuse the same source precedence rules.

## Noise and application-link rules

- India is required for imported portal records; missing location is rejected.
- Obvious engineering, software, product, sales, recruiting, support, marketing,
  and non-finance operations titles are rejected before display.
- `Analyst`, `Associate`, `Graduate`, and similar generic titles should remain
  reviewable only when the detail or source metadata supplies finance evidence.
- A portal Apply URL is a source link, not an official verification signal.
- `Apply direct` is reserved for a verified employer/ATS role-level URL.
- The helper may fill reviewed public contact fields, but never uploads, submits,
  solves CAPTCHA/OTP, or handles credentials.
