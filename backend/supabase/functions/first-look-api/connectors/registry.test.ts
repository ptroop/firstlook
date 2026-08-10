import assert from 'node:assert/strict';
import test from 'node:test';

import { createOfficialConnectorRegistry, selectConnectorGroup, supportedOfficialConnectorIds } from './registry.ts';

test('selects only the requested bounded scan group', () => {
  const connectors = [
    { connectorId: 'moodys', scanGroup: 'moodys-reconcile' },
    { connectorId: 'deshaw', scanGroup: 'deshaw-reconcile' },
    { connectorId: 'citi', scanGroup: 'citi-reconcile' },
    { connectorId: 'goldman', scanGroup: 'goldman-reconcile' },
  ];
  assert.deepEqual(selectConnectorGroup(connectors, 'citi-reconcile'), [connectors[2]]);
  assert.deepEqual(selectConnectorGroup(connectors, 'unknown'), []);
});

test('registers separate Moody’s watch and reconciliation groups on one connector identity', () => {
  const connectors = createOfficialConnectorRegistry();
  const moodys = connectors.filter((connector) => connector.connectorId === 'moodys-official-india');
  assert.deepEqual(moodys.map((connector) => connector.scanGroup), ['moodys-watch', 'moodys-reconcile']);
});

test('registers separate D. E. Shaw watch and reconciliation groups', () => {
  const connectors = createOfficialConnectorRegistry();
  const deshaw = connectors.filter((connector) => connector.connectorId === 'deshaw-official-india');
  assert.deepEqual(deshaw.map((connector) => connector.scanGroup), ['deshaw-watch', 'deshaw-reconcile']);
});

test('registers separate bounded Citi watch and full reconciliation groups', () => {
  const connectors = createOfficialConnectorRegistry();
  const citi = connectors.filter((connector) => connector.connectorId === 'citi-official-india');
  assert.deepEqual(citi.map((connector) => connector.scanGroup), ['citi-watch', 'citi-reconcile']);
});

test('registers Goldman Sachs full India reconciliation', () => {
  const connectors = createOfficialConnectorRegistry();
  const goldman = connectors.filter((connector) => connector.connectorId === 'goldman-sachs-official-india');
  assert.deepEqual(goldman.map((connector) => connector.scanGroup), ['goldman-reconcile']);
});

test('registers KPMG India watch and reconciliation groups', () => {
  const connectors = createOfficialConnectorRegistry();
  const kpmg = connectors.filter((connector) => connector.connectorId === 'kpmg-official-india');
  assert.deepEqual(kpmg.map((connector) => connector.scanGroup), ['kpmg-watch', 'kpmg-reconcile']);
});

test('registers American Express watch and reconciliation groups', () => {
  const connectors = createOfficialConnectorRegistry();
  const amex = connectors.filter((connector) => connector.connectorId === 'amex-official-india');
  assert.deepEqual(amex.map((connector) => connector.scanGroup), ['amex-watch', 'amex-reconcile']);
});

test('reports coverage only for implemented official connectors', () => {
  const ids = supportedOfficialConnectorIds();
  const expectedExistingIds = [
    'moodys-official-india',
    'deshaw-official-india',
    'citi-official-india',
    'goldman-sachs-official-india',
    'blackrock-official-india',
    'barclays-official-india',
    'razorpay-official-india',
    'groww-official-india',
    'phonepe-official-india',
    'paytm-official-india',
    'cred-official-india',
    'ey-gds-official-india',
    'kpmg-official-india',
    'amex-official-india',
    'jpmorgan-official-india',
    'sp-global-official-india',
    'deloitte-firecrawl-india',
    'amazon-official-india',
    'siemens-official-india',
    'hdfc-bank-ripplehire-india',
    'axis-bank-ripplehire-india',
    'accenture-official-india',
    'pwc-official-india',
    'wells-fargo-official-india',
    'deutsche-bank-official-india',
    'bank-of-america-official-india',
    'natwest-official-india',
    'fidelity-official-india',
    'ge-healthcare-official-india',
    'diageo-official-india',
    'morningstar-official-india',
    'morgan-stanley-official-india',
    'paypal-official-india',
    'shell-official-india',
    'state-street-official-india',
    'northern-trust-official-india',
    'mastercard-official-india',
    'visa-official-india',
    'factset-official-india',
    'bloomberg-official-india',
    'microsoft-firecrawl-india',
    'hsbc-firecrawl-india',
    'piramal-firecrawl-india',
    'pine-labs-firecrawl-india',
    'icra-firecrawl-india',
    'bcg-firecrawl-india',
    'bcg-expand-firecrawl-india',
    'mckinsey-firecrawl-india',
    'bain-capability-network-firecrawl-india',
    'kearney-firecrawl-india',
    'alvarez-marsal-firecrawl-india',
    'zs-firecrawl-india',
    'bny-firecrawl-india',
    'msci-firecrawl-india',
    'crisil-firecrawl-india',
    'care-ratings-firecrawl-india',
    'tresvista-firecrawl-india',
    'smart-cube-firecrawl-india',
    'evalueserve-firecrawl-india',
    'acuity-knowledge-partners-firecrawl-india',
    'sg-analytics-firecrawl-india',
    'ey-gds-firecrawl-india',
    'gt-bharat-firecrawl-india',
    'hdfc-bank-firecrawl-india',
    'icici-bank-firecrawl-india',
    'axis-bank-firecrawl-india',
    'kotak-firecrawl-india',
    'idfc-first-firecrawl-india',
    'bajaj-finserv-firecrawl-india',
    'tata-capital-firecrawl-india',
    'cred-firecrawl-india',
    'hdfc-amc-firecrawl-india',
    'icici-pru-amc-firecrawl-india',
    'motilal-oswal-firecrawl-india',
    'edelweiss-firecrawl-india',
    'zerodha-firecrawl-india'
  ];
  for (const id of expectedExistingIds) assert.ok(ids.includes(id), `missing connector ${id}`);
  assert.equal(ids.filter((id) => id.endsWith('-official-page-india')).length, 36);
});

test('registers Workday connectors for the original and RCV companies', () => {
  const connectors = createOfficialConnectorRegistry();
  // JPMorgan is deliberately absent: it moved to the Oracle Recruiting Cloud
  // adapter and is covered by the Oracle-specific test below.
  const workdayPrefixes = ['accenture', 'pwc', 'wells-fargo', 'deutsche-bank', 'bank-of-america', 'natwest', 'fidelity', 'ge-healthcare', 'diageo', 'morningstar', 'morgan-stanley', 'paypal', 'shell', 'state-street', 'northern-trust', 'mastercard', 'visa', 'factset', 'bloomberg'];
  for (const prefix of workdayPrefixes) {
    const subset = connectors.filter((c) => c.connectorId === `${prefix}-official-india`);
    assert.deepEqual(subset.map(c => c.scanGroup), [`${prefix}-watch`, `${prefix}-reconcile`]);
  }
});

test('registers JPMorgan through the Oracle Recruiting Cloud adapter', () => {
  const connectors = createOfficialConnectorRegistry();
  const jpmorgan = connectors.filter((c) => c.connectorId === 'jpmorgan-official-india');
  assert.deepEqual(jpmorgan.map(c => c.scanGroup), ['jpmorgan-watch', 'jpmorgan-reconcile']);
});

test('registers Paytm through the public Lever postings feed', () => {
  const connectors = createOfficialConnectorRegistry().filter((c) => c.connectorId === 'paytm-official-india');
  assert.deepEqual(connectors.map((c) => c.scanGroup), ['paytm-watch', 'paytm-reconcile']);
});

test('registers HDFC Bank and Axis Bank through their public RippleHire feeds', () => {
  const connectors = createOfficialConnectorRegistry();
  for (const prefix of ['hdfc-bank-ripplehire', 'axis-bank-ripplehire']) {
    const subset = connectors.filter((connector) => connector.connectorId === `${prefix}-india`);
    assert.deepEqual(subset.map((connector) => connector.scanGroup), [`${prefix}-india-watch`, `${prefix}-india-reconcile`]);
  }
});

test('registers Firecrawl connectors for 5 companies', () => {
  const connectors = createOfficialConnectorRegistry();
  const firecrawlPrefixes = ['microsoft', 'hsbc', 'piramal', 'pine-labs', 'icra'];
  for (const prefix of firecrawlPrefixes) {
    const subset = connectors.filter((c) => c.connectorId === `${prefix}-firecrawl-india`);
    assert.deepEqual(subset.map(c => c.scanGroup), [`${prefix}-firecrawl-india-watch`, `${prefix}-firecrawl-india-reconcile`]);
  }
});

test('registers quota-free official-page discovery for every Firecrawl fallback company', () => {
  const connectors = createOfficialConnectorRegistry();
  const pageConnectors = connectors.filter((connector) => connector.connectorId.endsWith('-official-page-india'));
  assert.equal(new Set(pageConnectors.map((connector) => connector.connectorId)).size, 36);
  for (let wave = 1; wave <= 4; wave += 1) {
    const expectedCount = wave < 4 ? 10 : 1;
    assert.equal(connectors.filter((connector) => connector.scanGroup === `rcv-official-page-wave-${wave}-watch`).length, expectedCount);
    assert.equal(connectors.filter((connector) => connector.scanGroup === `rcv-official-page-wave-${wave}-reconcile`).length, expectedCount);
  }
  assert.equal(connectors.filter((connector) => connector.scanGroup === 'rcv-official-page-wave-5-watch').length, 5);
  assert.equal(connectors.filter((connector) => connector.scanGroup === 'rcv-official-page-wave-5-reconcile').length, 5);
});
