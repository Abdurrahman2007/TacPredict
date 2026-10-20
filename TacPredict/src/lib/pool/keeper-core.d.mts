export const LATEST_ATTEMPT_S: number;
export const MAX_READING_AGE_S: number;
export function boundaryFor(nowMs: number, stepSec?: number): number;
export type KeeperJob = { kind: "start" | "end"; asset: string; minutes: number; duration: number; start: number };
export function boundaryJobs(boundarySec: number): KeeperJob[];
export function dueJobs(jobs: KeeperJob[], windows: Array<Record<string, unknown> | null>): KeeperJob[];
export function freshReadings(
  body: unknown,
  assets: string[],
  boundarySec: number,
): Record<string, { price: bigint; observedAt: number }>;
export function reportItems(
  jobs: KeeperJob[],
  readings: Record<string, { price: bigint; observedAt: number }>,
): Array<{ asset: number; duration: number; start: bigint; price: bigint; observedAt: bigint }>;
export function runKeeper(deps: {
  nowMs: () => number;
  readWindows: (jobs: KeeperJob[]) => Promise<Array<Record<string, unknown> | null>>;
  fetchPrices: (assets: string[]) => Promise<unknown>;
  sendReports: (input: { ends: unknown[]; starts: unknown[] }) => Promise<string[]>;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
  maxAttempts?: number;
  log?: (message: string) => void;
}): Promise<{ status: string; boundary: number; [key: string]: unknown }>;
