import assert from 'node:assert/strict';
import test from 'node:test';
import { BARCLAYS_CONFIG, BLACKROCK_CONFIG, parseTalentBrewDetail, parseTalentBrewResults } from './talentbrew.ts';

const resultsPage = (config: typeof BLACKROCK_CONFIG) => `
<section data-total-job-results="2" data-total-pages="1">
  <ul class="section3__search-results-ul">
    <li class="section3__search-results-li">
      <a data-job-id="1001" class="section3__search-results-a" href="/job/mumbai/financial-analyst/${config.organizationId}/1001"><h2 class="section3__job-title">Financial Analyst</h2></a>
      <p class="job-location">Mumbai (India)</p>
    </li>
    <li><a href="/job/london/software-engineer/${config.organizationId}/1002" data-job-id="1002"><h2>Software Engineer</h2></a><p class="job-location">London (United Kingdom)</p></li>
  </ul>
</section>`;

test('parses only India result cards with stable IDs', () => {
  const listings = parseTalentBrewResults(resultsPage(BLACKROCK_CONFIG), BLACKROCK_CONFIG);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].sourceExternalId, '1001');
  assert.equal(listings[0].detailUrl, 'https://careers.blackrock.com/job/mumbai/financial-analyst/45831/1001');
});

test('hydrates a Barclays detail and preserves its direct Workday apply URL', () => {
  const html = `
    <div data-job-id="1001">
      <h1 class="job-details--title">MI Analyst</h1>
      <p class="job-details--location">Gurugram, India</p>
      <span class="job-details--category">Finance</span>
      <a data-apply-url="https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays/job/Gurugram/MI-Analyst_JR-1/apply" href="https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays/job/Gurugram/MI-Analyst_JR-1/apply">Apply</a>
      <div class="ats-description"><p>0 to 2 years of experience in financial analysis.</p></div>
    </div>`;
  const parsed = parseTalentBrewDetail(html, 'https://search.jobs.barclays/job/gurugram/mi-analyst/13015/1001', BARCLAYS_CONFIG);
  assert.equal(parsed.title, 'MI Analyst');
  assert.equal(parsed.applyUrl, 'https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays/job/Gurugram/MI-Analyst_JR-1/apply');
  assert.match(parsed.experienceText, /0 to 2 years/i);
});
