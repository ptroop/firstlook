const companies = [
  { name: 'JPMorgan Chase', url: 'https://careers.jpmorgan.com/global/en/home' },
  { name: 'Deloitte', url: 'https://jobs2.deloitte.com/global/en' },
  { name: 'HSBC', url: 'https://mycareer.hsbc.com/' },
  { name: 'Accenture', url: 'https://www.accenture.com/in-en/careers' },
  { name: 'PwC', url: 'https://jobs.pwc.com/' },
  { name: 'Wells Fargo', url: 'https://www.wellsfargojobs.com/' },
  { name: 'Deutsche Bank', url: 'https://careers.db.com/' },
  { name: 'Morgan Stanley', url: 'https://ms.taleo.net/' },
  { name: 'Bank of America', url: 'https://careers.bankofamerica.com/' },
  { name: 'PayPal', url: 'https://careers.paypal.com/' },
  { name: 'NatWest', url: 'https://jobs.natwestgroup.com/' },
  { name: 'Piramal Finance', url: 'https://www.piramalfinance.com/careers' },
  { name: 'Fidelity', url: 'https://jobs.fidelity.com/' },
  { name: 'Amazon', url: 'https://www.amazon.jobs/' },
  { name: 'Microsoft', url: 'https://jobs.careers.microsoft.com/global/en' },
  { name: 'Shell', url: 'https://jobs.shell.com/' },
  { name: 'Siemens', url: 'https://jobs.siemens.com/jobs' },
  { name: 'GE HealthCare', url: 'https://careers.gehealthcare.com/' },
  { name: 'Diageo', url: 'https://diageo.wd3.myworkdayjobs.com/Diageo_Careers' },
  { name: 'Pine Labs', url: 'https://www.pinelabs.com/careers' },
  { name: 'S&P Global', url: 'https://careers.spglobal.com/jobs' },
  { name: 'Morningstar', url: 'https://morningstar.wd5.myworkdayjobs.com/Morningstar_Careers' },
  { name: 'ICRA', url: 'https://www.icra.in/Careers' },
];

async function checkATS() {
  for (const c of companies) {
    try {
      const response = await fetch(c.url, { redirect: 'follow', method: 'GET', signal: AbortSignal.timeout(5000) });
      const text = await response.text();
      const textLower = text.toLowerCase();
      let ats = 'Unknown';
      if (textLower.includes('workday') || response.url.includes('workday')) ats = 'Workday';
      else if (textLower.includes('taleo') || response.url.includes('taleo')) ats = 'Taleo';
      else if (textLower.includes('successfactors') || response.url.includes('successfactors')) ats = 'SuccessFactors';
      else if (textLower.includes('eightfold') || response.url.includes('eightfold')) ats = 'Eightfold';
      else if (textLower.includes('avature') || response.url.includes('avature')) ats = 'Avature';
      else if (textLower.includes('icims') || response.url.includes('icims')) ats = 'iCIMS';
      else if (textLower.includes('greenhouse') || response.url.includes('greenhouse')) ats = 'Greenhouse';
      else if (textLower.includes('phenom') || response.url.includes('phenom')) ats = 'Phenom';
      else if (textLower.includes('smartrecruiters') || response.url.includes('smartrecruiters')) ats = 'SmartRecruiters';
      else if (textLower.includes('lever') || response.url.includes('lever')) ats = 'Lever';
      else if (textLower.includes('beamery') || response.url.includes('beamery')) ats = 'Beamery';

      console.log(`${c.name}: ${ats} (${response.url})`);
    } catch (e) {
      console.log(`${c.name}: Error fetching - ${e.message}`);
    }
  }
}

checkATS();
