import type {
  ConnectorRunRequest,
  HydratedSourceObservation,
  InventoryListing,
  SourceConnectorDiagnostic,
} from '../types.ts';

export interface InventoryResult {
  listings: InventoryListing[];
  diagnostic: Pick<
    SourceConnectorDiagnostic,
    'status' | 'reportedTotal' | 'pagesExpected' | 'pagesFetched' | 'errorSummaries'
  >;
}

export interface OfficialJobConnector {
  connectorId: string;
  connectorVersion: string;
  company: string;
  scanGroup: string;
  enumerate(request: ConnectorRunRequest): Promise<InventoryResult>;
  hydrate(listing: InventoryListing, request: ConnectorRunRequest): Promise<HydratedSourceObservation>;
}

