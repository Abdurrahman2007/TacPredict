import type { Market } from "@/domain/markets/types";
export type UpDownAsset = "bitcoin" | "ethereum" | "solana" | "bnb";
export const ASSETS: Record<
  UpDownAsset,
  { product: string; name: string; short: string; logo: string }
>;
export const ASSET_KEYS: readonly UpDownAsset[];
export const DISPLAY_DURATIONS: readonly number[];
export const DURATIONS: readonly number[];
export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type PricePoint = { time: number; price: number };
export type Win = { start: number; end: number; minutes: number };
export function assetFromSlug(slug: string): UpDownAsset | null;
export function slugOf(asset: UpDownAsset): string;
export function durationLabel(minutes: number): string;
export function parseDuration(value: unknown): number;
export function windowStartFor(nowMs: number, minutes: number): number;
export function makeWindow(startMs: number, minutes: number): Win;
export function windowState(w: Win, nowMs: number): "upcoming" | "live" | "past";
export function resolveWindow(param: unknown, nowMs: number, minutes: number): Win;
export function windowsAround(
  nowMs: number,
  minutes: number,
  past?: number,
  future?: number,
): Win[];
export const MAX_CANDLES: number;
export function granularityFor(minutes: number): number;
export function pastCountFor(minutes: number): number;
export function priceToBeat(
  candles: Candle[] | undefined,
  startMs: number,
  gran?: number,
): number | null;
export function windowResult(
  candles: Candle[] | undefined,
  w: Win,
  gran?: number,
): { open: number; close: number; outcome: "Up" | "Down" } | null;
export function deltaInfo(
  current: number | null | undefined,
  beat: number | null | undefined,
): { abs: number; pct: number; direction: "up" | "down" | "flat" } | null;
export function formatCountdown(ms: number): string;
export function matchNativeMarket(
  markets: Market[] | undefined,
  asset: UpDownAsset,
  w: Win,
): Market | null;
export function seriesForWindow(input: {
  candles: Candle[] | undefined;
  trades: PricePoint[] | undefined;
  ticks: PricePoint[] | undefined;
  w: Win;
  nowMs: number;
  gran?: number;
}): PricePoint[];
export function thin<T>(points: T[], max?: number): T[];
export function formatUsd(price: number | null | undefined, asset?: UpDownAsset): string;
