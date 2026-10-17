import type { UpDownAsset } from "../updown/window.mjs";
export type DraftTimes = { openAt: string; closeAt: string; resolveAfter: string; resolutionDeadline: string };
export type Draft = {
  title: string;
  description: string;
  category: "Crypto" | "Sports";
  subcategory?: "Football" | "Cricket";
  outcomes: string;
  rules: string;
  source: string;
  sourceUrl: string;
  tags: string[];
  times: DraftTimes;
};
export type Fixture = {
  sport: "football" | "cricket";
  provider: string;
  matchId: string;
  competition: string;
  home: string;
  away: string;
  startsAt: string;
  status: string;
};
export const SPORTS: Record<"football" | "cricket", { section: string; resolveAfterMs: number; deadlineMs: number; minLeadMs: number }>;
export function cryptoWindowTemplate(asset: UpDownAsset, minutes: number, now?: number): Draft;
export function footballTemplate(fixture: Fixture, now?: number): Draft;
export function cricketTemplate(fixture: Fixture, now?: number): Draft;
export function footballRules(input: { home: string; away: string; competition: string; matchId: string; kickoff: number; resolveAfter: number; deadline: number }): string;
export function cricketRules(input: { home: string; away: string; competition: string; matchId: string; kickoff: number; resolveAfter: number; deadline: number }): string;
export function missingSportsClauses(rules: string, sport: "football" | "cricket"): string[];
export function validateDraft(
  draft: Partial<Omit<Draft, "times" | "tags">> & { times?: Partial<DraftTimes> | undefined },
  now?: number,
  options?: { times?: boolean },
): string[];
