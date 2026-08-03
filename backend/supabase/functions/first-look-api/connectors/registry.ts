import type { JobConnector } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';
import { createCitiConnector } from './citi.ts';
import { createDeshawConnector } from './deshaw.ts';
import { createGoldmanConnector } from './goldman.ts';
import { createMoodysConnector, runMoodysConnector } from './moodys.ts';
import { BARCLAYS_CONFIG, BLACKROCK_CONFIG, createTalentBrewConnector } from './talentbrew.ts';

const UNSUPPORTED_COMPANIES = [
  'JPMorgan Chase',
  'KPMG',
  'Deloitte',
  'HSBC',
  'D. E. Shaw',
  'Accenture',
  'PwC',
  'Wells Fargo',
  'Citi',
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
    createDeshawConnector(fetch, 'deshaw-watch'),
    createDeshawConnector(fetch, 'deshaw-reconcile'),
    createCitiConnector(fetch, 'citi-watch'),
    createCitiConnector(fetch, 'citi-reconcile'),
    createGoldmanConnector(fetch, 'goldman-reconcile'),
    createTalentBrewConnector(BLACKROCK_CONFIG, fetch, 'blackrock-watch'),
    createTalentBrewConnector(BLACKROCK_CONFIG, fetch, 'blackrock-reconcile'),
    createTalentBrewConnector(BARCLAYS_CONFIG, fetch, 'barclays-watch'),
    createTalentBrewConnector(BARCLAYS_CONFIG, fetch, 'barclays-reconcile'),
  ];
}

export function supportedOfficialConnectorIds(): string[] {
  return [...new Set(createOfficialConnectorRegistry().map((connector) => connector.connectorId))];
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
