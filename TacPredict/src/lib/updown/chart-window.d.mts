import type { PricePoint, Win } from "./window.mjs";
export function chartWindow(points: PricePoint[], start: number, end: number): PricePoint[];
export function chartView(
  points: PricePoint[],
  selected: Win,
  now: number,
): { series: PricePoint[]; mode: "recent" | "window"; range: Win };

export function boundaryObservation(
  points: PricePoint[],
  boundary: number,
  now: number,
): number | null;

export function observedCandles(points: PricePoint[], range: Win): import("./window.mjs").Candle[];
export function referenceObservation(
  points: PricePoint[],
  boundary: number,
  now: number,
): number | null;
