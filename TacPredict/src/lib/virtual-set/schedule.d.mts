export type VsetAsset = "bitcoin" | "ethereum" | "solana" | "bnb";
export declare const VSET_ASSETS: readonly VsetAsset[];
export declare const VSET_DURATIONS: readonly number[];
export declare const VSET_PRODUCTS: Readonly<Record<VsetAsset, string>>;
export declare const WINDOWS_AHEAD: Readonly<Record<number, number>>;
export declare const OPEN_LEAD_SEC: number;
export declare const PRE_OPEN_SEC: number;
export declare const PROPOSE_DELAY_SEC: number;
export declare const RESOLUTION_WINDOW_SEC: number;
export declare const QUOTE_CUTOFF_SEC: number;
export type PlannedWindow = {
  key: string;
  asset: VsetAsset;
  minutes: number;
  startSec: number;
  endSec: number;
  openAtSec: number;
};
export declare function isVsetPair(asset: unknown, minutes: unknown): boolean;
export declare function marketKey(asset: VsetAsset, startMs: number, minutes: number): string;
export declare function parseMarketKey(
  key: unknown,
): { asset: VsetAsset; startMs: number; minutes: number } | null;
export declare function windowStartSec(nowSec: number, minutes: number): number;
export declare function plannedWindows(nowSec: number, asset: VsetAsset, minutes: number): PlannedWindow[];
export declare function windowOutcome(
  open: number,
  close: number,
): { outcome: 0 | 1; voided: boolean } | null;
export type QuoteRow = {
  failed?: boolean;
  market_id?: number | null;
  inventory_ready?: boolean;
  strike?: number | null;
  open_at: string;
  start_at: string;
  end_at: string;
};
export declare function quoteBlocker(row: QuoteRow | null | undefined, nowSec: number): string | null;
export declare function sharesForUsdc(usdc: bigint | number | string, pricePpm: number): bigint;
export declare function fillCostFor(shares: bigint | number | string, pricePpm: number): bigint;
export declare function boxAmount(roll: number, pick: number): number;
