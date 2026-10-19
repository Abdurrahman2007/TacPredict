/**
 * Pure helpers for the UpDownPool contract (parimutuel Up/Down rounds on Base, paid in USDC).
 * Everything here mirrors the contract's own arithmetic; nothing invents a price or a payout.
 * The contract is the source of truth: these helpers only preview what it will do.
 */
export const POOL_ASSET_IDS = { bitcoin: 0, ethereum: 1, solana: 2, bnb: 3 };
export const POOL_ASSET_KEYS = ["bitcoin", "ethereum", "solana", "bnb"];
/** Durations the pool runs, in minutes: 5 min, 15 min, 12 hours, 24 hours. */
export const POOL_DURATIONS = [5, 15, 720, 1440];
/** CoinGecko ids; CoinGecko is the price source that decides every round. */
export const COINGECKO_IDS = { bitcoin: "bitcoin", ethereum: "ethereum", solana: "solana", bnb: "binancecoin" };
export const PRICE_DECIMALS = 8;
/** Mirror of the contract constants, in seconds. */
export const OBSERVE_WINDOW_S = 180;
export const REPORT_GRACE_S = 300;
export const REVIEW_S = 120;
export const BPS = 10000n;

export const poolAssetId = (asset) => POOL_ASSET_IDS[asset] ?? null;
export const poolAssetKey = (id) => POOL_ASSET_KEYS[Number(id)] ?? null;
export const isPoolSeries = (asset, minutes) =>
  asset in POOL_ASSET_IDS && POOL_DURATIONS.includes(minutes);
export const durationSeconds = (minutes) => minutes * 60;

/** First UTC-aligned start strictly after `nowMs` (the round that is open for bets). */
export function nextRoundStart(nowMs, minutes) {
  const size = minutes * 60000;
  return (Math.floor(nowMs / size) + 1) * size;
}
/** "betting" until the start, "live" until the end, then "ended". */
export function roundPhase(startMs, minutes, nowMs) {
  const end = startMs + minutes * 60000;
  return nowMs < startMs ? "betting" : nowMs < end ? "live" : "ended";
}
/** The contract accepts bets only for a round that has not started and starts within one duration. */
export function canBet(startMs, minutes, nowMs) {
  return startMs % (minutes * 60000) === 0 && nowMs < startMs && startMs <= nowMs + minutes * 60000;
}

/** Price text from CoinGecko -> integer with 8 decimals, without float rounding surprises. */
export function scaledPrice(value) {
  const text = typeof value === "number" ? value.toFixed(PRICE_DECIMALS) : String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const scaled = BigInt(whole + fraction.padEnd(PRICE_DECIMALS, "0").slice(0, PRICE_DECIMALS));
  return scaled > 0n ? scaled : null;
}
export const fromScaled = (value) => Number(BigInt(value)) / 10 ** PRICE_DECIMALS;

/** USDC text ("12.5") -> 6-decimal integer, or null if it is not a plain amount. */
export function usdcAtomic(text) {
  const clean = String(text).trim();
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function formatUsdc(atomic, digits = 2) {
  const value = BigInt(atomic);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").slice(0, digits);
  return digits > 0 ? `${whole.toLocaleString("en-US")}.${fraction}` : whole.toLocaleString("en-US");
}

/**
 * What a winner is paid, exactly as the contract computes it: the stake back, plus the stake's
 * share of the losing side after the fee. The fee is taken from the losing side only.
 */
export function payoutFor({ winnersPool, losersPool, feeBps, stake }) {
  const w = BigInt(winnersPool);
  const l = BigInt(losersPool);
  const s = BigInt(stake);
  if (w === 0n || l === 0n || s === 0n) return s;
  const fee = (l * BigInt(feeBps)) / BPS;
  return s + (s * (l - fee)) / w;
}

/**
 * Preview of a new bet on top of the live pools. Shows the payout if that side wins with the pools as
 * they are now (other bets can still change it before the round starts) and the plain refund case.
 */
export function previewBet({ up, down, feeBps, side, stake }) {
  const s = BigInt(stake);
  const u = BigInt(up) + (side === "up" ? s : 0n);
  const d = BigInt(down) + (side === "down" ? s : 0n);
  const winners = side === "up" ? u : d;
  const losers = side === "up" ? d : u;
  const payout = payoutFor({ winnersPool: winners, losersPool: losers, feeBps, stake: s });
  const opposed = losers > 0n;
  return {
    payout,
    profit: payout - s,
    opposed,
    // Multiple of the stake, e.g. 1.84 means 1.84x including the stake. Null while nobody is on the other side.
    multiple: opposed && s > 0n ? Number((payout * 10000n) / s) / 10000 : null,
  };
}
/** Pool shares for the Up/Down bar; null while the round has no bets. */
export function poolShare(up, down) {
  const u = BigInt(up);
  const d = BigInt(down);
  const total = u + d;
  if (total === 0n) return null;
  const upPct = Number((u * 10000n) / total) / 100;
  return { up: upPct, down: Math.round((100 - upPct) * 100) / 100 };
}

/** The contract enums: state 0 open, 1 settled, 2 void; result 0 none, 1 up, 2 down. */
export function roundStatus(round, nowSec) {
  const state = Number(round.state);
  const result = Number(round.result);
  if (state === 2) return { kind: "refund", label: "Refunded" };
  if (state === 1)
    return nowSec >= Number(round.claimOpensAt)
      ? { kind: "settled", label: result === 1 ? "Up won" : "Down won", result: result === 1 ? "up" : "down" }
      : { kind: "review", label: result === 1 ? "Up won · payouts open soon" : "Down won · payouts open soon", result: result === 1 ? "up" : "down" };
  return { kind: "open", label: "Open" };
}

/** Can the missing-reading refund be triggered for this round yet? Mirrors voidUnreported. */
export function unreportedRefundDue(round, startSec, minutes, nowSec) {
  if (Number(round.state) !== 0) return false;
  if (BigInt(round.up) + BigInt(round.down) === 0n) return false;
  const end = startSec + minutes * 60;
  return BigInt(round.startPrice) === 0n
    ? nowSec > startSec + REPORT_GRACE_S
    : nowSec > end + REPORT_GRACE_S;
}

/** Rules shown on every pool round. Plain words, same facts the contract enforces. */
export function poolRules(asset, minutes, feeBps) {
  const names = { bitcoin: "Bitcoin", ethereum: "Ethereum", solana: "Solana", bnb: "BNB" };
  const name = names[asset] ?? asset;
  const length = minutes >= 60 ? `${minutes / 60}-hour` : `${minutes}-minute`;
  const fee = (Number(feeBps) / 100).toString();
  return [
    `This is a ${length} ${name} Up or Down round. Everyone who bets on the round shares one pool of USDC.`,
    `Bets close when the round starts. Rounds start on the UTC clock.`,
    `The price to beat is the first CoinGecko USD price for ${name} read at or after the round start, no more than 3 minutes after it. The end price is the first CoinGecko USD price read at or after the round end, under the same rule.`,
    `Up wins if the end price is higher than the price to beat. Down wins if it is lower.`,
    `Winners get their stake back plus a share of the losing side, split in proportion to their stake. A ${fee}% fee is taken from the losing side only, never from a winner's stake.`,
    `Full refund of every stake, with no fee, if the two prices are equal, if nobody bet on the other side, or if a price reading does not arrive in time. Anyone can trigger that refund 5 minutes after the missed reading.`,
    `Payouts open about 2 minutes after the end price is posted. During that time a guardian can void a round with a wrong price; a void only returns stakes.`,
    `No administrator can change a bet or move user funds. The owner can only withdraw collected fees and rounding dust.`,
  ];
}

/** Plain-language text for the revert reasons the contract can give, and for wallet errors. */
const ERROR_TEXT = [
  [/user rejected|rejected the request|denied transaction|request rejected|action_rejected/i, "Wallet request cancelled."],
  [/Betting paused/i, "Betting is paused right now."],
  [/Series is off/i, "This round is not open for betting."],
  [/Round already started/i, "This round has already started. Bets close when a round starts."],
  [/Round opens later/i, "This round is not open for bets yet."],
  [/Round is not aligned/i, "This is not a valid round."],
  [/Below minimum/i, "That is below the minimum bet."],
  [/Over personal limit/i, "That is over your limit for this round."],
  [/Round is full/i, "This round's pool is full."],
  [/Round closed/i, "This round is closed."],
  [/Already claimed/i, "This position was already paid out."],
  [/Payouts open soon/i, "Payouts open about 2 minutes after the end price is posted."],
  [/No winning stake/i, "This position did not win."],
  [/Readings can still arrive/i, "The price reading can still arrive. Try again in a few minutes."],
  [/exceeds balance|insufficient (funds|balance)|transfer amount/i, "Not enough USDC or gas in your wallet."],
  [/allowance/i, "USDC approval is missing."],
];
export function poolErrorMessage(error) {
  const parts = [error?.shortMessage, error?.details, error?.cause?.reason, error?.cause?.shortMessage, error?.message]
    .filter((part) => typeof part === "string")
    .join(" ");
  for (const [pattern, text] of ERROR_TEXT) if (pattern.test(parts)) return text;
  return "The transaction could not be sent. Check your wallet and try again.";
}
