import type { Win } from "./window.mjs";
import type { PoolRound } from "../pool/pool-types";
export function historyWindows(
  now: number,
  minutes: number,
  before?: number,
  count?: number,
): Win[];
export function historyState(round: PoolRound | null, window: Win, now: number): string;
