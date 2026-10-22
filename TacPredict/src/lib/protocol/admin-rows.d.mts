export type AdminRow = {
  id: string;
  label: string;
  detail: string;
  usdcAtoms: string | null;
  observedAt: string | null;
};
export function detailField(detail: string, key: string): string | null;
export function atomicToDecimal(
  value: string | bigint | null | undefined,
  decimals?: number,
  places?: number,
): string | null;
export function priceToCents(value: string | bigint | null | undefined): string | null;
export function shortHash(
  value: string | null | undefined,
  head?: number,
  tail?: number,
): string | null;
export const MARKET_STATUSES: readonly string[];
export type ParsedMarket =
  | {
      kind: "terms";
      id: string;
      title: string;
      metadataHash: string;
      createdAt: string | null;
    }
  | {
      kind: "market";
      id: string;
      code: string;
      title: string;
      status: string | null;
      onchainId: string | null;
      questionId: string | null;
      conditionId: string | null;
      closeAt: string | null;
      liquidityAtomic: string | null;
      createdAt: string | null;
    };
export function parseMarketRow(row: AdminRow): ParsedMarket;
export type ParsedTrade = {
  id: string;
  market: string;
  outcomeIndex: string | null;
  sharesAtomic: string | null;
  priceAtomic: string | null;
  txHash: string | null;
  usdcAtomic: string | null;
  timestamp: string | null;
};
export function parseTradeRow(row: AdminRow): ParsedTrade;
export type ParsedResolution = {
  id: string;
  market: string;
  status: string | null;
  proposedOutcome: string | null;
  challengeDeadline: string | null;
  evidenceHash: string | null;
  sourceHash: string | null;
  proposedAt: string | null;
};
export function parseResolutionRow(row: AdminRow): ParsedResolution;
export function parseBlockchainRows(rows: AdminRow[]): {
  checkpoint: { block: string | null; blockHash: string | null; updatedAt: string | null } | null;
  deployment: {
    contracts: { name: string; address: string }[];
    databaseTradingEnabled: boolean | null;
    recordedAt: string | null;
  } | null;
};
export function countMarketsByStatus(markets: ParsedMarket[]): Record<string, number>;
export function blockLag(
  head: string | bigint | null | undefined,
  checkpoint: string | bigint | null | undefined,
): bigint | null;
export function formatDuration(seconds: number | string | bigint): string | null;
export function formatTimestamp(value: string | null | undefined): string | null;

export function createdMarketCount(nextId: string | null | undefined): string | null;
