/**
 * Off-chain mirror of VirtualPriceAMM `probability` / execution pricing (feed-v1).
 * Integer ppm math matches Solidity (1e6 = 100%). Display ¢ = round(ppm / 10_000).
 *
 * This is a rational probability approximation — not a calibrated normal CDF.
 * Executable on-chain quotes still come from VirtualPriceAMM; this module powers
 * paper UI estimates and parity tests until Sepolia feed-v1 is authorized.
 */

export const UNIT = 1_000_000;

export type FeedV1Policy = {
  /** Frozen per-√second volatility (ppm). */
  sigmaPpm: number;
  minProbabilityPpm: number;
  skewPpm: number;
  spreadPpm: number;
  impactPpm: number;
  feeBps: number;
  seed: number;
  reserveUp: number;
  reserveDown: number;
};

/** Default policy tuned for short crypto windows (matches contract bounds). */
export function defaultFeedV1Policy(minutes: number): FeedV1Policy {
  // Higher sigma → slower move to extremes (more time-value left).
  const sigmaPpm =
    minutes <= 5 ? 900 : minutes <= 15 ? 700 : minutes <= 30 ? 550 : minutes <= 60 ? 400 : 220;
  return {
    sigmaPpm,
    minProbabilityPpm: 10_000, // 1¢ floor
    skewPpm: 5_000,
    spreadPpm: 5_000,
    impactPpm: 2_000,
    feeBps: 30,
    seed: 100_000,
    reserveUp: 100_000,
    reserveDown: 100_000,
  };
}

function ceilSqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x < n) x += 1;
  return x;
}

/**
 * Up probability in ppm [min, UNIT-min]. Null if inputs invalid or market closed (t<=0).
 */
export function feedV1UpPpm(
  spot: number,
  strike: number,
  remainingSec: number,
  policy: FeedV1Policy,
): number | null {
  if (
    !(spot > 0) ||
    !(strike > 0) ||
    !Number.isFinite(spot) ||
    !Number.isFinite(strike) ||
    !(remainingSec > 0) ||
    !Number.isFinite(remainingSec)
  ) {
    return null;
  }
  const S = Math.round(spot * 1e8); // mimic 8-decimal feed scale (ratio cancels)
  const K = Math.round(strike * 1e8);
  if (S <= 0 || K <= 0) return null;

  const delta = Math.trunc(((S - K) * UNIT) / K);
  const distance = Math.abs(delta);
  const rt = ceilSqrt(Math.floor(remainingSec));
  const scale = policy.sigmaPpm * rt;
  const adjustment = Math.floor((UNIT / 2) * distance / (distance + scale));
  let prob = UNIT / 2 + (delta < 0 ? -adjustment : adjustment);

  const inventory = policy.reserveDown - policy.reserveUp;
  let skew = Math.trunc((inventory * policy.skewPpm) / policy.seed);
  if (skew > policy.skewPpm) skew = policy.skewPpm;
  if (skew < -policy.skewPpm) skew = -policy.skewPpm;
  prob += skew;

  if (prob < policy.minProbabilityPpm) prob = policy.minProbabilityPpm;
  if (prob > UNIT - policy.minProbabilityPpm) prob = UNIT - policy.minProbabilityPpm;
  return Math.trunc(prob);
}

export function feedV1ShareOdds(
  spot: number | null | undefined,
  strike: number | null | undefined,
  remainingSec: number,
  minutes = 5,
  policy?: Partial<FeedV1Policy>,
): { up: number; down: number; upPpm: number; updatedAt: number } | null {
  if (typeof spot !== "number" || typeof strike !== "number") return null;
  const p = { ...defaultFeedV1Policy(minutes), ...policy };
  const upPpm = feedV1UpPpm(spot, strike, remainingSec, p);
  if (upPpm == null) return null;
  const up = Math.round(upPpm / 10_000); // ¢
  const down = 100 - up;
  return { up, down, upPpm, updatedAt: Date.now() };
}

/** Mid ¢ for display; buy ask / sell bid apply spread+impact like the contract. */
export function feedV1ExecutionCents(
  upPpm: number,
  outcome: "Up" | "Down",
  amountAtoms: number,
  buySide: boolean,
  policy: FeedV1Policy,
): number | null {
  let price = outcome === "Up" ? upPpm : UNIT - upPpm;
  const impact = Math.floor((amountAtoms * policy.impactPpm) / policy.seed);
  const spread = policy.spreadPpm + impact;
  if (buySide) {
    price += spread;
    if (price >= UNIT) return null;
  } else {
    if (price <= spread) return null;
    price -= spread;
  }
  return Math.max(1, Math.min(99, Math.round(price / 10_000)));
}

export function feedV1BuyPreview(
  cashUsdc: number,
  askCents: number,
  feeBps: number,
): { fee: number; shares: number; toWin: number; profitIfWin: number } | null {
  if (!(cashUsdc > 0) || !(askCents > 0 && askCents < 100)) return null;
  const fee = Math.ceil((cashUsdc * feeBps) / 10000 * 1e6) / 1e6;
  const net = cashUsdc - fee;
  const shares = net / (askCents / 100);
  return {
    fee,
    shares,
    toWin: shares,
    profitIfWin: shares - cashUsdc,
  };
}

/** Equality / void policy for paper settlement (matches VirtualPriceAMM tieVoids). */
export type PaperSettleResult = "Up" | "Down" | "void";

export function paperOutcome(
  start: number,
  end: number,
  tieVoids = true,
): PaperSettleResult | null {
  if (!(start > 0) || !(end > 0)) return null;
  if (end > start) return "Up";
  if (end < start) return "Down";
  return tieVoids ? "void" : "Down"; // contract: tieVoids → void; else documented Down
}
