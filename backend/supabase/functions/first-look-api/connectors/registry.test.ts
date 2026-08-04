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
  assert.deepEqual(supportedOfficialConnectorIds(), [
    'moodys-official-india',
    'deshaw-official-india',
    'citi-official-india',
    'goldman-sachs-official-india',
    'blackrock-official-india',
    'barclays-official-india',
    'razorpay-official-india',
    'kpmg-official-india',
    'amex-official-india',
    'accenture-official-india',
    'pwc-official-india',
    'wells-fargo-official-india',
    'deutsche-bank-official-india',
    'bank-of-america-official-india',
    'natwest-official-india',
    'fidelity-official-india',
    'ge-healthcare-official-india',
    'diageo-official-india',
    'sp-global-official-india',
    'morningstar-official-india',
    'jpmorgan-official-india',
    'morgan-stanley-official-india',
    'paypal-official-india',
    'shell-official-india',
    'siemens-official-india'
  ]);
});

test('registers Workday connectors for 16 companies', () => {
  const connectors = createOfficialConnectorRegistry();
  const workdayPrefixes = ['accenture', 'pwc', 'wells-fargo', 'deutsche-bank', 'bank-of-america', 'natwest', 'fidelity', 'ge-healthcare', 'diageo', 'sp-global', 'morningstar', 'jpmorgan', 'morgan-stanley', 'paypal', 'shell', 'siemens'];
  for (const prefix of workdayPrefixes) {
    const subset = connectors.filter((c) => c.connectorId === `${prefix}-official-india`);
    assert.deepEqual(subset.map(c => c.scanGroup), [`${prefix}-watch`, `${prefix}-reconcile`]);
  }
});
