import assert from 'node:assert/strict';
import test from 'node:test';

import { selectConnectorGroup } from './registry.ts';

test('selects only the requested bounded scan group', () => {
  const connectors = [
    { connectorId: 'moodys', scanGroup: 'moodys-reconcile' },
    { connectorId: 'deshaw', scanGroup: 'deshaw-reconcile' },
    { connectorId: 'citi', scanGroup: 'citi-reconcile' },
  ];
  assert.deepEqual(selectConnectorGroup(connectors, 'citi-reconcile'), [connectors[2]]);
  assert.deepEqual(selectConnectorGroup(connectors, 'unknown'), []);
});
