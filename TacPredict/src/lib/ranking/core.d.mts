export type RankingPeriod = "1d" | "7d" | "30d" | "all";
export type RankingActivity = {
  id: string;
  marketId: string;
  title: string;
  side: string;
  amountAtomic: string;
  timestamp: string;
  txHash: string;
  outcome: number;
};
export type RankingPosition = {
  marketId: string;
  title: string;
  outcome: number;
  sharesAtomic: string;
  settled: boolean;
};
export type RankingTrader = {
  wallet: string;
  name: string;
  volumeAtomic: string;
  pnlAtomic: string | null;
  markets: number;
  settledMarkets: number;
  rank: number | null;
  activity: RankingActivity[];
  positions: RankingPosition[];
};
export function isWallet(v: unknown): v is string;
export function atoms(v: unknown): bigint;
export function signedMoney(v: string | null | undefined): string;
export function unsignedMoney(v: string | null | undefined): string;
export function traderName(address: string): string;
export function buildRanking(input: {
  events: {
    tx_hash: string;
    log_index: number;
    event_name: string;
    payload: Record<string, unknown>;
  }[];
  markets: { id: string; onchain_id: string | number; market_id: string; title: string }[];
  tradeTimes: Record<string, string>;
  settledTimes: Record<string, string>;
  now?: number;
  period?: RankingPeriod;
}): RankingTrader[];
