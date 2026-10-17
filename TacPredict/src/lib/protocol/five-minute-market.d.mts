import type { Draft, DraftTimes } from "./market-templates.mjs";
export type FiveMinuteTimes = DraftTimes;
export function fiveMinuteTemplate(asset: "bitcoin" | "ethereum", now?: number): Draft;
