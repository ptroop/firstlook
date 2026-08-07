import assert from 'node:assert/strict';
import test from 'node:test';

import { extractJobLink, validateJobUrl } from './job-link.ts';

function jsonLdPage(title: string, company: string, location: string, description: string, applyUrl?: string, postedAt?: string): string {
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title,
    hiringOrganization: { name: company },
    jobLocation: { address: { addressLocality: 'Mumbai', addressRegion: 'MH', addressCountry: 'IN' } },
    description,
    url: 'https://jobs.example.com/job/42',
    ...(applyUrl ? { directApply: applyUrl } : {}),
    ...(postedAt ? { datePosted: postedAt } : {}),
  };
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body></body></html>`;
}

test('validateJobUrl rejects localhost', () => {
  const result = validateJobUrl('https://localhost/job/1');
  assert.equal(result.ok, false);
});

test('validateJobUrl rejects private IP ranges', () => {
  for (const url of [
    'https://10.0.0.1/job',
    'https://192.168.1.1/job',
    'https://172.16.0.1/job',
    'https://169.254.169.254/latest/meta-data',
    'https://127.0.0.1/job',
  ]) {
    assert.equal(validateJobUrl(url).ok, false, url);
  }
});

test('validateJobUrl rejects non-http protocols and garbage', () => {
  assert.equal(validateJobUrl('file:///etc/passwd').ok, false);
  assert.equal(validateJobUrl('ftp://example.com').ok, false);
  assert.equal(validateJobUrl('not a url').ok, false);
  assert.equal(validateJobUrl('').ok, false);
});

test('validateJobUrl accepts public https links', () => {
  const result = validateJobUrl('https://jobs.citi.com/job/123?lang=en');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.url.hostname, 'jobs.citi.com');
});

test('extractJobLink parses a JSON-LD JobPosting', async () => {
  const html = jsonLdPage(
    'Model Validation Analyst',
    'Citi',
    'Mumbai, India',
    '<p>Requires <strong>Python</strong> and SQL for financial modeling.</p>',
    'https://jobs.citi.com/apply/123',
    '2026-08-01T00:00:00Z',
  );
  const fetcher = async (url: string, init?: RequestInit) => {
    assert.equal(init?.redirect, 'manual');
    return new Response(html, { status: 200 });
  };
  const result = await extractJobLink('https://jobs.citi.com/job/123', { fetcher });
  assert.equal(result.title, 'Model Validation Analyst');
  assert.equal(result.company, 'Citi');
  assert.equal(result.location, 'Mumbai, India');
  assert.ok(result.description.includes('Python'));
  assert.equal(result.applyUrl, 'https://jobs.citi.com/apply/123');
  assert.equal(result.source, 'jsonld');
  assert.equal(result.confidence, 'high');
  assert.equal(result.postedAt, '2026-08-01T00:00:00.000Z');
});

test('extractJobLink strips legal-entity noise from the company and cleans Workday locations', async () => {
  const html = jsonLdPage(
    'AML, Associate, ISG Operations',
    '131 Morgan Stanley Advantage Svcs',
    'COMMERZ III, OBEROI GARDEN CITY, India',
    '<p>AML operations experience.</p>',
  );
  const fetcher = async () => new Response(html, { status: 200 });
  const result = await extractJobLink('https://ms.wd5.myworkdayjobs.com/External/job/Mumbai-India/AML--Associate---ISG-Operations_JR041885', { fetcher });
  assert.equal(result.company, 'Morgan Stanley');
  assert.equal(result.location, 'Mumbai, India');
});

test('extractJobLink cleans a Workday path brand from the ATS hostname', async () => {
  const html = jsonLdPage('Associate Operations Processor', 'I16 Wells Fargo International Solutions Private LTD', 'Bengaluru-India', '<p>Operations.</p>');
  const fetcher = async () => new Response(html, { status: 200 });
  const result = await extractJobLink('https://wf.wd1.myworkdayjobs.com/WellsFargoJobs/job/Bengaluru-India/Associate-Operations-Processor_R', { fetcher });
  assert.equal(result.company, 'Wells Fargo');
  assert.equal(result.location, 'Bengaluru, India');
});

test('extractJobLink falls back to the detail URL as the apply path', async () => {
  const html = jsonLdPage('Analyst', 'Acme', 'Pune, India', '<p>SQL.</p>');
  const fetcher = async () => new Response(html, { status: 200 });
  const result = await extractJobLink('https://jobs.example.com/job/42', { fetcher });
  assert.equal(result.applyUrl, 'https://jobs.example.com/job/42');
});

test('extractJobLink falls back to meta tags when no JSON-LD exists', async () => {
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="Financial Analyst - Gurugram" />
    <meta property="og:description" content="Excel and Tableau for portfolio reporting." />
    <meta property="og:site_name" content="BlackRock" />
  </head><body><p>Ignored body text.</p></body></html>`;
  const fetcher = async () => new Response(html, { status: 200 });
  const result = await extractJobLink('https://careers.blackrock.com/job/77', { fetcher });
  assert.equal(result.title, 'Financial Analyst - Gurugram');
  assert.equal(result.company, 'BlackRock');
  assert.equal(result.description, 'Excel and Tableau for portfolio reporting.');
  assert.equal(result.source, 'meta');
  assert.equal(result.confidence, 'medium');
});

test('extractJobLink degrades to title-only with low confidence', async () => {
  const html = '<!doctype html><html><head><title>Associate - Moody\'s Careers</title></head><body>opaque</body></html>';
  const fetcher = async () => new Response(html, { status: 200 });
  const result = await extractJobLink('https://careers.moodys.com/en/job/789', { fetcher });
  assert.equal(result.title, 'Associate');
  assert.equal(result.source, 'title');
  assert.equal(result.confidence, 'low');
});

test('extractJobLink follows redirects but validates each hop', async () => {
  let calls = 0;
  const fetcher = async (url: string) => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 302, headers: { location: '/final/99' } });
    return new Response(jsonLdPage('Final Role', 'Acme', 'Pune, India', '<p>SQL.</p>'), { status: 200 });
  };
  const result = await extractJobLink('https://jobs.example.com/start', { fetcher });
  assert.equal(calls, 2);
  assert.equal(result.title, 'Final Role');
});

test('extractJobLink refuses a redirect to a private host', async () => {
  const fetcher = async (url: string) => {
    if (url === 'https://jobs.example.com/start') {
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    }
    return new Response('{}', { status: 200 });
  };
  await assert.rejects(
    () => extractJobLink('https://jobs.example.com/start', { fetcher, resolveHost: async () => ['93.184.216.34'] }),
    /Private network addresses are not allowed/,
  );
});

test('extractJobLink blocks a hostname that resolves to a private IP (DNS rebinding)', async () => {
  const fetcher = async () => new Response('<html>should never be fetched</html>', { status: 200 });
  const resolveHost = async (hostname: string) => {
    assert.equal(hostname, 'evil.example.com');
    return ['127.0.0.1'];
  };
  await assert.rejects(
    () => extractJobLink('https://evil.example.com/job/1', { fetcher, resolveHost }),
    /resolves to a private network address/,
  );
});

test('extractJobLink blocks a redirect whose host resolves to a metadata IP', async () => {
  let calls = 0;
  const fetcher = async (url: string) => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 302, headers: { location: 'http://metadata.evil.test/latest/meta-data' } });
    return new Response('{}', { status: 200 });
  };
  const resolveHost = async (hostname: string) => (hostname === 'metadata.evil.test' ? ['169.254.169.254'] : ['93.184.216.34']);
  await assert.rejects(
    () => extractJobLink('https://jobs.example.com/start', { fetcher, resolveHost }),
    /resolves to a private network address/,
  );
});

test('extractJobLink blocks an unresolvable host', async () => {
  const fetcher = async () => new Response('<html>nope</html>', { status: 200 });
  const resolveHost = async () => { throw new Error('NXDOMAIN'); };
  await assert.rejects(
    () => extractJobLink('https://no-such-host.example/job/1', { fetcher, resolveHost }),
    /could not be resolved/,
  );
});

test('validateJobUrl rejects IPv6 loopback and literal private addresses', () => {
  assert.equal(validateJobUrl('https://[::1]/job').ok, false);
  assert.equal(validateJobUrl('https://[fe80::1]/job').ok, false);
  assert.equal(validateJobUrl('https://[::ffff:127.0.0.1]/job').ok, false);
});

test('extractJobLink surfaces fetch failures honestly', async () => {
  const fetcher = async () => new Response('<html>blocked</html>', { status: 403 });
  await assert.rejects(
    () => extractJobLink('https://jobs.example.com/job/1', { fetcher }),
    /could not be fetched/,
  );
});
