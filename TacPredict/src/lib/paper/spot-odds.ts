import { feedV1ShareOdds } from "./feed-v1-quote";

/**
 * Live Up/Down share ¢ from spot vs open (beat), using feed-v1 (VirtualPriceAMM mirror).
 * Pass remainingSec when known so time-to-expiry affects probability (not just spot delta).
 */
export function spotShareOdds(
  current: number | null | undefined,
  beat: number | null | undefined,
  minutes = 5,
  remainingSec?: number,
): { up: number; down: number } | null {
  const t =
    typeof remainingSec === "number" && remainingSec > 0
      ? remainingSec
      : Math.max(1, minutes * 60);
  const q = feedV1ShareOdds(current, beat, t, minutes);
  if (!q) return null;
  return { up: q.up, down: q.down };
}
