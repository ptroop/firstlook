import type { JobConnector } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';
import { createMoodysConnector, runMoodysConnector } from './moodys.ts';

const UNSUPPORTED_COMPANIES = [
  'Goldman Sachs',
  'JPMorgan Chase',
  'KPMG',
  'Deloitte',
  'BlackRock',
  'HSBC',
  'D. E. Shaw',
  'Accenture',
  'PwC',
  'Wells Fargo',
  'Citi',
  'Barclays',
  'Deutsche Bank',
  'Morgan Stanley',
  'Bank of America',
  'American Express',
  'PayPal',
  'NatWest',
  'Piramal Finance',
  'Fidelity'
];

export function createConnectorRegistry(): JobConnector[] {
  return [
    { company: "Moody's", run: () => runMoodysConnector() },
    ...UNSUPPORTED_COMPANIES.map(unsupportedConnector)
  ];
}

export function createOfficialConnectorRegistry(): OfficialJobConnector[] {
  return [
    createMoodysConnector(fetch, 'moodys-watch'),
    createMoodysConnector(fetch, 'moodys-reconcile'),
  ];
}

function unsupportedConnector(company: string): JobConnector {
  return {
    company,
    run: async () => {
      const now = new Date().toISOString();
      return {
        jobs: [],
        diagnostic: {
          company,
          status: 'unsupported',
          discoveredCount: 0,
          fetchedCount: 0,
          matchingCount: 0,
          excluded: {},
          errorMessage: 'A verified source connector has not been added yet',
          startedAt: now,
          finishedAt: now
        }
      };
    }
  };
}

export function selectConnectorGroup<T extends { scanGroup: string }>(connectors: T[], scanGroup: string): T[] {
  return connectors.filter((connector) => connector.scanGroup === scanGroup);
}
