import type { Fixture } from "../protocol/market-templates.mjs";
export const FOOTBALL_COMPETITIONS: readonly { code: string; name: string }[];
export type SportsResult = {
  state: "pending" | "final" | "void" | "review";
  winner?: "home" | "away" | "draw";
  winnerName?: string;
  note: string;
  evidence: Record<string, unknown>;
};
export function parseFootballFixtures(json: unknown, competitionName?: string): Fixture[];
export function regulationScore(match: unknown): { home: number; away: number } | null;
export function footballResult(json: unknown): SportsResult;
export function parseCricketFixtures(json: unknown): Fixture[];
export function cricketResult(json: unknown): SportsResult;
export function proposalFor(
  sport: "football" | "cricket",
  result: SportsResult | null | undefined,
  labels: string[] | undefined,
): { outcome: number; voided: boolean } | null;
