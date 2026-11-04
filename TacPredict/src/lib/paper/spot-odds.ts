/**
 * Live Up/Down share ¢ for paper display (home cards + detail page).
 *
 * Paper display only — NOT the onchain VirtualPriceAMM execution quote
 * (that contract pricing in feed-v1-quote.ts is untouched).
 *
 * The price depends only on two things, so it moves even with no other
 * traders in the app:
 *  1. Spot vs beat (price to beat): spot above beat → Up rises, Down falls.
 *  2. Time left: as expiry approaches, the same price gap becomes more
 *     decisive, so the winning side climbs toward 99¢ and the losing side
 *     falls toward 1¢. With 5 seconds left and spot $50 below beat,
 *     Down is 99¢ / Up is 1¢.
 *
 * This is a binary-option approximation: log-return divided by the
 * expected move over the remaining time (volatility ≈ 0.009% per √second,
 * about a 0.16% move over 5 minutes), passed through a logistic curve.
 * Up + Down always sum to 100¢, floored at 1¢ and capped at 99¢.
 * No real funds are involved: this is Virtual USDC / paper pricing.
 */
const VOL_PER_SQRT_SEC = 0.00009;

export function spotShareOdds(
  current: number | null | undefined,
  beat: number | null | undefined,
  minutes = 5,
  remainingSec?: number,
): { up: number; down: number } | null {
  if (
    typeof current !== "number" ||
    typeof beat !== "number" ||
    !(current > 0) ||
    !(beat > 0) ||
    !Number.isFinite(current) ||
    !Number.isFinite(beat)
  )
    return null;
  const t =
    typeof remainingSec === "number" && remainingSec > 0
      ? remainingSec
      : Math.max(1, minutes * 60);
  const stdDev = VOL_PER_SQRT_SEC * Math.sqrt(t);
  if (!(stdDev > 0)) return null;
  const d = Math.log(current / beat) / stdDev;
  // Logistic curve ≈ normal CDF; d = 0 → 50¢, d = 1 → ~85¢, d ≥ 3 → 99¢.
  const probUp = 1 / (1 + Math.exp(-1.7 * d));
  const up = Math.max(1, Math.min(99, Math.round(probUp * 100)));
  return { up, down: 100 - up };
}
