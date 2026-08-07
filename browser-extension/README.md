# First Look Copilot

This optional Chrome/Edge Manifest V3 extension is the execution layer for the First Look application kit. It reduces repeated typing on public job application forms without becoming an auto-apply bot.

It is deliberately review-first:

- You click `Fill current page` yourself.
- It uses only the local profile fields saved in the extension.
- It imports a reviewed First Look application kit and fills supported name, email, phone, city, LinkedIn, degree, institution and graduation-year fields.
- It can copy a reviewed cover letter or saved answers from an imported application kit.
- It can capture the title, company, location and visible Apply link from one listing page after you click `Capture visible listing`; it downloads a small JSON file for local import into First Look.
- It skips passwords, OTPs, security answers, file uploads, CV/cover-letter fields, payment fields and submit controls.
- It never submits a form, clicks an Apply/Next/Submit button, captures cookies, or stores credentials.
- `activeTab` limits access to the page you explicitly choose when clicking the button.

## Install locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this `browser-extension` folder.
5. Open a direct role application page from First Look.
6. Export an application kit from First Look, import it here, then click **Fill current page**.
7. Review every populated field and complete any employer-specific questions manually.

To use portal discovery, open one public listing, click `Capture visible listing`, then import the downloaded JSON from the Open roles section in First Look. This is an explicit, one-listing capture; it does not crawl a portal, read private account data, or treat the portal link as an official employer Apply URL.

The extension is intentionally separate from the website's CV text. Do not put passwords, government IDs, sensitive demographic information or Hunter API keys into this profile. Hunter contact lookup belongs behind an authenticated server-side integration; the extension never calls Hunter directly.
