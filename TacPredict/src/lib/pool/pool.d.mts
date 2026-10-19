export type PoolAsset = "bitcoin" | "ethereum" | "solana" | "bnb";
export const POOL_ASSET_IDS: Record<PoolAsset, number>;
export const POOL_ASSET_KEYS: PoolAsset[];
export const POOL_DURATIONS: number[];
export const COINGECKO_IDS: Record<PoolAsset, string>;
export const PRICE_DECIMALS: number;
export const OBSERVE_WINDOW_S: number;
export const REPORT_GRACE_S: number;
export const REVIEW_S: number;
export const BPS: bigint;
export function poolAssetId(asset: string): number | null;
export function poolAssetKey(id: number | bigint): PoolAsset | null;
export function isPoolSeries(asset: string, minutes: number): boolean;
export function durationSeconds(minutes: number): number;
export function nextRoundStart(nowMs: number, minutes: number): number;
export function roundPhase(startMs: number, minutes: number, nowMs: number): "betting" | "live" | "ended";
export function canBet(startMs: number, minutes: number, nowMs: number): boolean;
export function scaledPrice(value: number | string): bigint | null;
export function fromScaled(value: bigint | string | number): number;
export function usdcAtomic(text: string): bigint | null;
export function formatUsdc(atomic: bigint | string | number, digits?: number): string;
export function payoutFor(input: {
  winnersPool: bigint | string;
  losersPool: bigint | string;
  feeBps: bigint | string | number;
  stake: bigint | string;
}): bigint;
export function previewBet(input: {
  up: bigint | string;
  down: bigint | string;
  feeBps: bigint | string | number;
  side: "up" | "down";
  stake: bigint | string;
}): { payout: bigint; profit: bigint; opposed: boolean; multiple: number | null };
export function poolShare(up: bigint | string, down: bigint | string): { up: number; down: number } | null;
export type RoundLike = {
  state: number | string;
  result: number | string;
  claimOpensAt: number | string | bigint;
  upPool: bigint | string;
  downPool: bigint | string;
  startPrice: bigint | string;
};
export function roundStatus(
  round: RoundLike,
  nowSec: number,
): { kind: "refund" | "settled" | "review" | "open"; label: string; result?: "up" | "down" };
export function unreportedRefundDue(round: RoundLike, startSec: number, minutes: number, nowSec: number): boolean;
export function poolRules(asset: string, minutes: number, feeBps: number | string | bigint): string[];
export function poolErrorMessage(error: unknown): string;
