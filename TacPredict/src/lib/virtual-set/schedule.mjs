/**
 * Which on-chain Up/Down window markets exist for the Virtual USDC set, and the plain rules that decide them.
 *
 * Pure module: no network, no keys, no clock of its own. The keeper and the quote endpoint pass the time in.
 * Windows are aligned to the UTC clock, so "9:15 -> 9:20" is the same market for everybody, and the market key is the
 * same id the page already uses for that window (`reference-<asset>-<startMs>-<minutes>`).
 */

export const VSET_ASSETS = Object.freeze(["bitcoin", "ethereum", "solana", "bnb"]);
/** Only these lengths trade on chain for now. Longer windows stay "coming soon". */
export const VSET_DURATIONS = Object.freeze([5, 15]);

export const VSET_PRODUCTS = Object.freeze({
  bitcoin: "BTC-USD",
  ethereum: "ETH-USD",
  solana: "SOL-USD",
  bnb: "BNB-USD",
});

/** How many windows ahead of the current one stay prepared, per window length. */
export const WINDOWS_AHEAD = Object.freeze({ 5: 2, 15: 1 });
/** Seconds between sending the create transaction and the market opening, so it can never open in the past. */
export const OPEN_LEAD_SEC = 12;
/**
 * The market opens this many seconds before its window starts, so the maker can stock it with shares before the
 * first trade. Quotes still wait for the window start, because the price to beat only exists from then.
 */
export const PRE_OPEN_SEC = 30;
/** The market closes at the window end; the result is proposed once the last candle is final. */
export const PROPOSE_DELAY_SEC = 5;
/** A resolver gets this long after the window to finish before anyone may void the market. */
export const RESOLUTION_WINDOW_SEC = 3600;
/** No new quotes in the final seconds: the order could not land before the market closes. */
export const QUOTE_CUTOFF_SEC = 3;

const KEY_PATTERN = /^reference-(bitcoin|ethereum|solana|bnb)-(\d{10,13})-(5|15)$/;

export function isVsetPair(asset, minutes) {
  return VSET_ASSETS.includes(asset) && VSET_DURATIONS.includes(minutes);
}

export function marketKey(asset, startMs, minutes) {
  return `reference-${asset}-${startMs}-${minutes}`;
}

/** Splits a market key back into its parts, or returns null when it is not a window key of this set. */
export function parseMarketKey(key) {
  const match = typeof key === "string" ? KEY_PATTERN.exec(key) : null;
  if (!match) return null;
  const startMs = Number(match[2]);
  const minutes = Number(match[3]);
  if (!Number.isSafeInteger(startMs) || startMs % (minutes * 60_000) !== 0) return null;
  return { asset: match[1], startMs, minutes };
}

export function windowStartSec(nowSec, minutes) {
  const span = minutes * 60;
  return Math.floor(nowSec / span) * span;
}

/**
 * The windows the keeper keeps prepared for one asset and length: the one running now and the next few.
 * A window that is already running when the keeper gets to it still opens, just a few seconds from now.
 */
export function plannedWindows(nowSec, asset, minutes) {
  if (!isVsetPair(asset, minutes)) return [];
  const span = minutes * 60;
  const first = windowStartSec(nowSec, minutes);
  const ahead = WINDOWS_AHEAD[minutes] ?? 1;
  const out = [];
  for (let i = 0; i <= ahead; i += 1) {
    const startSec = first + i * span;
    const endSec = startSec + span;
    const openAtSec = Math.max(startSec - PRE_OPEN_SEC, nowSec + OPEN_LEAD_SEC);
    // Not worth opening when almost nothing is left of the window.
    if (endSec - Math.max(startSec, openAtSec) < 45) continue;
    out.push({ key: marketKey(asset, startSec * 1000, minutes), asset, minutes, startSec, endSec, openAtSec });
  }
  return out;
}

/**
 * Up when the last one-minute candle closes above the opening price of the first one, Down when below.
 * An exact tie voids the market: every share then pays half.
 */
export function windowOutcome(open, close) {
  if (![open, close].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return null;
  if (close > open) return { outcome: 0, voided: false };
  if (close < open) return { outcome: 1, voided: false };
  return { outcome: 0, voided: true };
}

/** Why a quote cannot be given right now, or null when the market can take a trade. `row` is the market's database row. */
export function quoteBlocker(row, nowSec) {
  if (!row) return "no_market";
  if (row.failed) return "market_failed";
  if (row.market_id === null || row.market_id === undefined) return "not_created";
  if (!row.inventory_ready) return "not_ready";
  if (!(typeof row.strike === "number" && row.strike > 0)) return "no_strike";
  const open = Math.max(Date.parse(row.open_at), Date.parse(row.start_at)) / 1000;
  const end = Date.parse(row.end_at) / 1000;
  if (!Number.isFinite(open) || !Number.isFinite(end)) return "no_market";
  if (nowSec < open) return "not_open";
  if (end - nowSec < QUOTE_CUTOFF_SEC) return "closing";
  return null;
}

/** Shares (6 decimals) that `usdc` (6 decimals) buys at `pricePpm`; rounds down so the cost never exceeds `usdc`. */
export function sharesForUsdc(usdc, pricePpm) {
  const price = BigInt(pricePpm);
  if (price <= 0n || price >= 1_000_000n) throw new Error("Invalid price");
  return (BigInt(usdc) * 1_000_000n) / price;
}

/** What Exchange.fillOrder charges for a single fill: floor(shares * price / 1e6). */
export function fillCostFor(shares, pricePpm) {
  return (BigInt(shares) * BigInt(pricePpm)) / 1_000_000n;
}

/** Box draw: a whole number of dollars from 50 to 500, mostly small, sometimes large. `roll` and `pick` are in [0, 1). */
export function boxAmount(roll, pick) {
  const tiers = [
    [0.6, 50, 100],
    [0.85, 101, 200],
    [0.95, 201, 350],
    [1.01, 351, 500],
  ];
  const tier = tiers.find(([limit]) => roll < limit) ?? tiers[tiers.length - 1];
  const [, low, high] = tier;
  return low + Math.min(high - low, Math.floor(pick * (high - low + 1)));
}
