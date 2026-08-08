import type { JobConnector } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';
import { createCitiConnector } from './citi.ts';
import { createDeshawConnector } from './deshaw.ts';
import { createGoldmanConnector } from './goldman.ts';
import { GROWW_CONFIG, PHONEPE_CONFIG, RAZORPAY_CONFIG, createGreenhouseConnector } from './greenhouse.ts';
import { createMoodysConnector, runMoodysConnector } from './moodys.ts';
import { BARCLAYS_CONFIG, BLACKROCK_CONFIG, createTalentBrewConnector } from './talentbrew.ts';
import { AMEX_CONFIG, JPMORGAN_CONFIG, KPMG_CONFIG, createOracleConnector } from './oracle.ts';
import { 
  ACCENTURE_CONFIG, PWC_CONFIG, WELLS_FARGO_CONFIG, DEUTSCHE_BANK_CONFIG, 
  BANK_OF_AMERICA_CONFIG, NATWEST_CONFIG, FIDELITY_CONFIG, GE_HEALTHCARE_CONFIG, 
  DIAGEO_CONFIG, MORNINGSTAR_CONFIG,
  MORGAN_STANLEY_CONFIG, PAYPAL_CONFIG, SHELL_CONFIG,
  STATE_STREET_CONFIG, NORTHERN_TRUST_CONFIG, MASTERCARD_CONFIG, VISA_CONFIG, FACTSET_CONFIG, BLOOMBERG_CONFIG,
  createWorkdayConnector
} from './workday.ts';
import { createSpGlobalConnector } from './spglobal.ts';
import { createDeloitteConnector } from './deloitte.ts';
import { createAmazonConnector } from './amazon.ts';
import { createSiemensConnector } from './siemens.ts';
import { PAYTM_LEVER_CONFIG, CRED_LEVER_CONFIG, createLeverConnector } from './lever.ts';
import { EY_GDS_YELLO_CONFIG, createYelloConnector } from './yello.ts';
import {
  MICROSOFT_CONFIG, HSBC_CONFIG,
  PIRAMAL_CONFIG, PINE_LABS_CONFIG, ICRA_CONFIG, RCV_FIRECRAWL_WAVES, createFirecrawlConnector
} from './firecrawl.ts';
import { createOfficialPageConnector } from './official-page.ts';


const UNSUPPORTED_COMPANIES: string[] = [];

const FIRECRAWL_API_KEY = typeof Deno !== 'undefined' ? Deno.env.get('FIRECRAWL_API_KEY') || '' : '';

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
    createGreenhouseConnector(GROWW_CONFIG, fetch, 'groww-watch'),
    createGreenhouseConnector(GROWW_CONFIG, fetch, 'groww-reconcile'),
    createGreenhouseConnector(PHONEPE_CONFIG, fetch, 'phonepe-watch'),
    createGreenhouseConnector(PHONEPE_CONFIG, fetch, 'phonepe-reconcile'),
    createLeverConnector(PAYTM_LEVER_CONFIG, fetch, 'paytm-watch'),
    createLeverConnector(PAYTM_LEVER_CONFIG, fetch, 'paytm-reconcile'),
    createLeverConnector(CRED_LEVER_CONFIG, fetch, 'cred-watch'),
    createLeverConnector(CRED_LEVER_CONFIG, fetch, 'cred-reconcile'),
    createYelloConnector(EY_GDS_YELLO_CONFIG, fetch, 'watch', 'ey-gds-watch'),
    createYelloConnector(EY_GDS_YELLO_CONFIG, fetch, 'reconcile', 'ey-gds-reconcile'),
    createOracleConnector(KPMG_CONFIG, fetch, 'kpmg-watch'),
    createOracleConnector(KPMG_CONFIG, fetch, 'kpmg-reconcile'),
    createOracleConnector(AMEX_CONFIG, fetch, 'amex-watch'),
    createOracleConnector(AMEX_CONFIG, fetch, 'amex-reconcile'),
    createOracleConnector(JPMORGAN_CONFIG, fetch, 'jpmorgan-watch'),
    createOracleConnector(JPMORGAN_CONFIG, fetch, 'jpmorgan-reconcile'),
    createSpGlobalConnector(fetch, 'watch'),
    createSpGlobalConnector(fetch, 'reconcile'),
    createDeloitteConnector(fetch, 'watch'),
    createDeloitteConnector(fetch, 'reconcile'),
    createAmazonConnector(fetch, 'watch'),
    createAmazonConnector(fetch, 'reconcile'),
    createSiemensConnector(fetch, 'watch'),
    createSiemensConnector(fetch, 'reconcile'),
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
      MORNINGSTAR_CONFIG,
      MORGAN_STANLEY_CONFIG,
      PAYPAL_CONFIG,
      SHELL_CONFIG
    ].flatMap(config => [
      createWorkdayConnector(config, fetch, 'watch'),
      createWorkdayConnector(config, fetch, 'reconcile')
    ]),
    ...[
      STATE_STREET_CONFIG,
      NORTHERN_TRUST_CONFIG,
      MASTERCARD_CONFIG,
      VISA_CONFIG,
      FACTSET_CONFIG,
      BLOOMBERG_CONFIG,
    ].flatMap(config => [
      createWorkdayConnector(config, fetch, 'watch'),
      createWorkdayConnector(config, fetch, 'reconcile')
    ]),
    ...[
      MICROSOFT_CONFIG,
      HSBC_CONFIG,
      PIRAMAL_CONFIG,
      PINE_LABS_CONFIG,
      ICRA_CONFIG
    ].flatMap(config => [
      createFirecrawlConnector(config, FIRECRAWL_API_KEY, 'watch'),
      createFirecrawlConnector(config, FIRECRAWL_API_KEY, 'reconcile')
    ]),
    ...RCV_FIRECRAWL_WAVES.flatMap((wave, waveIndex) => wave.flatMap(config => [
      createFirecrawlConnector(config, FIRECRAWL_API_KEY, 'watch', fetch, `rcv-firecrawl-wave-${waveIndex + 1}-watch`),
      createFirecrawlConnector(config, FIRECRAWL_API_KEY, 'reconcile', fetch, `rcv-firecrawl-wave-${waveIndex + 1}-reconcile`),
    ])),
    ...RCV_FIRECRAWL_WAVES.flatMap((wave, waveIndex) => wave.flatMap(config => [
      createOfficialPageConnector(config, fetch, 'watch', `rcv-official-page-wave-${waveIndex + 1}-watch`),
      createOfficialPageConnector(config, fetch, 'reconcile', `rcv-official-page-wave-${waveIndex + 1}-reconcile`),
    ])),
    ...[
      MICROSOFT_CONFIG,
      HSBC_CONFIG,
      PIRAMAL_CONFIG,
      PINE_LABS_CONFIG,
      ICRA_CONFIG,
    ].flatMap(config => [
      createOfficialPageConnector(config, fetch, 'watch', 'rcv-official-page-wave-5-watch'),
      createOfficialPageConnector(config, fetch, 'reconcile', 'rcv-official-page-wave-5-reconcile'),
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
