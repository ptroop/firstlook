import type { JobConnector } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';
import { createCitiConnector } from './citi.ts';
import { createDeshawConnector } from './deshaw.ts';
import { createGoldmanConnector } from './goldman.ts';
import { RAZORPAY_CONFIG, createGreenhouseConnector } from './greenhouse.ts';
import { createMoodysConnector, runMoodysConnector } from './moodys.ts';
import { BARCLAYS_CONFIG, BLACKROCK_CONFIG, createTalentBrewConnector } from './talentbrew.ts';
import { AMEX_CONFIG, KPMG_CONFIG, createOracleConnector } from './oracle.ts';
import { 
  ACCENTURE_CONFIG, PWC_CONFIG, WELLS_FARGO_CONFIG, DEUTSCHE_BANK_CONFIG, 
  BANK_OF_AMERICA_CONFIG, NATWEST_CONFIG, FIDELITY_CONFIG, GE_HEALTHCARE_CONFIG, 
  DIAGEO_CONFIG, SP_GLOBAL_CONFIG, MORNINGSTAR_CONFIG, createWorkdayConnector 
} from './workday.ts';


const UNSUPPORTED_COMPANIES = [
  'JPMorgan Chase',
  'Deloitte',
  'HSBC',
  'D. E. Shaw',
  'Citi',
  'Morgan Stanley',
  'PayPal',
  'Piramal Finance'
  , 'Amazon'
  , 'Microsoft'
  , 'Shell'
  , 'Siemens'
  , 'Razorpay'
  , 'Pine Labs'
  , 'ICRA'
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
    createGreenhouseConnector(RAZORPAY_CONFIG, fetch, 'razorpay-watch'),
    createGreenhouseConnector(RAZORPAY_CONFIG, fetch, 'razorpay-reconcile'),
    createOracleConnector(KPMG_CONFIG, fetch, 'kpmg-watch'),
    createOracleConnector(KPMG_CONFIG, fetch, 'kpmg-reconcile'),
    createOracleConnector(AMEX_CONFIG, fetch, 'amex-watch'),
    createOracleConnector(AMEX_CONFIG, fetch, 'amex-reconcile'),
    ...[
      ACCENTURE_CONFIG,
      PWC_CONFIG,
      WELLS_FARGO_CONFIG,
      DEUTSCHE_BANK_CONFIG,
      BANK_OF_AMERICA_CONFIG,
      NATWEST_CONFIG,
      FIDELITY_CONFIG,
      GE_HEALTHCARE_CONFIG,
      DIAGEO_CONFIG,
      SP_GLOBAL_CONFIG,
      MORNINGSTAR_CONFIG
    ].flatMap(config => [
      createWorkdayConnector(config, fetch, 'watch'),
      createWorkdayConnector(config, fetch, 'reconcile')
    ]),
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
