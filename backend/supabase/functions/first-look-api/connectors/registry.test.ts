import assert from 'node:assert/strict';
import test from 'node:test';

import { createOfficialConnectorRegistry, selectConnectorGroup } from './registry.ts';

test('selects only the requested bounded scan group', () => {
  const connectors = [
    { connectorId: 'moodys', scanGroup: 'moodys-reconcile' },
    { connectorId: 'deshaw', scanGroup: 'deshaw-reconcile' },
    { connectorId: 'citi', scanGroup: 'citi-reconcile' },
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
