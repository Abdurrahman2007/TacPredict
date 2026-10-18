import type { PricePoint, Win } from "./window.mjs";
export function chartWindow(points: PricePoint[], start: number, end: number): PricePoint[];
export function chartView(
  points: PricePoint[],
  selected: Win,
  now: number,
): { series: PricePoint[]; mode: "recent" | "window"; range: Win };
