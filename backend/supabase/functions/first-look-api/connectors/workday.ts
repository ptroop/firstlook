// backend/supabase/functions/first-look-api/connectors/workday.ts
import type { InventoryListing, JobConnectorResult, HydratedJob } from '../types.ts';
import type { OfficialJobConnector } from './contract.ts';

export interface WorkdayConfig {
  companyName: string;
  baseUrl: string;
  connectorIdPrefix: string;
}

export const ACCENTURE_CONFIG: WorkdayConfig = { companyName: 'Accenture', baseUrl: 'https://accenture.wd3.myworkdayjobs.com/AccentureCareers', connectorIdPrefix: 'accenture' };
export const PWC_CONFIG: WorkdayConfig = { companyName: 'PwC', baseUrl: 'https://pwc.wd3.myworkdayjobs.com/Global_Careers', connectorIdPrefix: 'pwc' };
export const WELLS_FARGO_CONFIG: WorkdayConfig = { companyName: 'Wells Fargo', baseUrl: 'https://wellsfargo.wd3.myworkdayjobs.com/wellsfargo', connectorIdPrefix: 'wells-fargo' };
export const DEUTSCHE_BANK_CONFIG: WorkdayConfig = { companyName: 'Deutsche Bank', baseUrl: 'https://db.wd3.myworkdayjobs.com/DBWebsite', connectorIdPrefix: 'deutsche-bank' };
export const BANK_OF_AMERICA_CONFIG: WorkdayConfig = { companyName: 'Bank of America', baseUrl: 'https://bankofamerica.wd1.myworkdayjobs.com/campus', connectorIdPrefix: 'bank-of-america' };
export const NATWEST_CONFIG: WorkdayConfig = { companyName: 'NatWest', baseUrl: 'https://natwestgroup.wd3.myworkdayjobs.com/NatWestGroupCareers', connectorIdPrefix: 'natwest' };
export const FIDELITY_CONFIG: WorkdayConfig = { companyName: 'Fidelity', baseUrl: 'https://fmr.wd1.myworkdayjobs.com/careers', connectorIdPrefix: 'fidelity' };
export const GE_HEALTHCARE_CONFIG: WorkdayConfig = { companyName: 'GE HealthCare', baseUrl: 'https://gehealthcare.wd1.myworkdayjobs.com/gehc-external-careers', connectorIdPrefix: 'ge-healthcare' };
export const DIAGEO_CONFIG: WorkdayConfig = { companyName: 'Diageo', baseUrl: 'https://diageo.wd3.myworkdayjobs.com/Diageo_Careers', connectorIdPrefix: 'diageo' };
export const SP_GLOBAL_CONFIG: WorkdayConfig = { companyName: 'S&P Global', baseUrl: 'https://spglobal.wd5.myworkdayjobs.com/SPGlobal_Careers', connectorIdPrefix: 'sp-global' };
export const MORNINGSTAR_CONFIG: WorkdayConfig = { companyName: 'Morningstar', baseUrl: 'https://morningstar.wd5.myworkdayjobs.com/Morningstar_Careers', connectorIdPrefix: 'morningstar' };

const INDIA_LOCATIONS = /\b(?:india|bengaluru|bangalore|gurgaon|gurugram|mumbai|pune|hyderabad|delhi|noida|chennai)\b/i;

export function createWorkdayConnector(
  config: WorkdayConfig,
  fetcher: typeof fetch,
  runType: 'watch' | 'reconcile'
): OfficialJobConnector {
  const connectorId = `${config.connectorIdPrefix}-official-india`;
  const scanGroup = `${config.connectorIdPrefix}-${runType}`;

  return {
    connectorId,
    scanGroup,
    company: config.companyName,
    
    enumerate: async () => {
      const startedAt = new Date().toISOString();
      let offset = 0;
      const limit = 20;
      const listings: InventoryListing[] = [];
      let totalDiscovered = 0;

      while (true) {
        const body = JSON.stringify({ limit, offset, appliedFacets: {}, searchText: "" });
        const res = await fetcher(`${config.baseUrl}/wday/cxs/client/customUI/v1.2/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        if (!res.ok) throw new Error(`Workday fetch failed: ${res.status} ${res.statusText}`);
        const data = await res.json();
        const postings = data.jobPostings || [];
        if (postings.length === 0) break;

        for (const job of postings) {
          totalDiscovered++;
          if (INDIA_LOCATIONS.test(job.locationsText || '')) {
            listings.push({
              connectorId,
              sourceExternalId: job.externalPath,
              company: config.companyName,
              title: job.title,
              location: job.locationsText || 'India',
              category: null,
              department: null,
              detailUrl: `${config.baseUrl}${job.externalPath}`,
              listingMetadataHash: job.externalPath,
              rawMetadata: job
            });
          }
        }
        
        offset += limit;
        if (postings.length < limit) break;
      }

      return {
        listings,
        diagnostic: {
          company: config.companyName,
          status: 'complete',
          discoveredCount: totalDiscovered,
          fetchedCount: Math.ceil(totalDiscovered / limit),
          matchingCount: listings.length,
          excluded: { 'Non-India Location': totalDiscovered - listings.length },
          startedAt,
          finishedAt: new Date().toISOString()
        }
      };
    },

    hydrate: async (listing) => {
      const res = await fetcher(`${config.baseUrl}/wday/cxs/client/customUI/v1.2/jobPosting${listing.sourceExternalId}`);
      if (!res.ok) throw new Error(`Failed to hydrate Workday job: ${res.status} ${res.statusText}`);
      const data = await res.json();
      
      const description = data.jobPostingInfo?.jobDescription || '';
      return {
        title: listing.title,
        employerJobId: data.jobPostingInfo?.reqId || listing.sourceExternalId,
        description,
        location: listing.location,
        applyUrl: `${config.baseUrl}${listing.sourceExternalId}/apply`
      };
    }
  };
}
