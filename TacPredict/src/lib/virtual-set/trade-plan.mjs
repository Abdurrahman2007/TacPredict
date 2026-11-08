/**
 * Pure rules the browser applies around one on-chain trade: how a typed amount becomes atomic units, which approvals
 * come first, whether a signed quote still matches what the page showed, and how a failure reads to a person.
 * No network and no wallet in here, so every rule runs in a plain node test.
 */
const UNIT = 1_000_000n;

/** The allowance a wallet grants the exchange once; virtual USDC has no value, so one big grant avoids repeat prompts. */
export const APPROVE_AMOUNT = 1_000_000n * UNIT;
/** A quote may differ from the price on the page by at most this many cents before the trade is held back. */
export const MAX_QUOTE_GAP_CENTS = 15;
/** A quote needs at least this many seconds of life left when the wallet is asked to sign. */
export const MIN_QUOTE_LIFE_SEC = 6;
/** Below this much ETH a transaction cannot be paid for. */
export const MIN_GAS_WEI = 5_000_000_000_000n; // 0.000005 ETH

/** "12.5" -> 12_500_000n. Returns null for anything that is not a plain amount with up to six decimals. */
export function toAtomic(text) {
  if (typeof text !== "string" || !/^\d{1,12}(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(6, "0"));
}

/** Whole shares held (as the page reads them from the chain) back to exact atomic units. */
export function sharesToAtomic(shares) {
  if (typeof shares !== "number" || !Number.isFinite(shares) || shares <= 0) return null;
  return BigInt(Math.round(shares * 1_000_000));
}

/** Distance in cents between a signed quote and the price the page was showing. */
export function quoteGapCents(pricePpm, shownCents) {
  return Math.abs(Number(pricePpm) / 10_000 - Number(shownCents));
}

/** True when the page's price and the signed price are too far apart to trade on without asking again. */
export function quoteTooFar(pricePpm, shownCents) {
  if (typeof shownCents !== "number" || !Number.isFinite(shownCents)) return false;
  return quoteGapCents(pricePpm, shownCents) > MAX_QUOTE_GAP_CENTS;
}

export function quoteLifeSec(expiration, nowSec) {
  return Number(expiration) - nowSec;
}

/**
 * Approvals needed before the order itself. A buy spends virtual USDC by allowance; a sell moves shares, which the
 * exchange may only do once the wallet approved it as an operator.
 */
export function neededApprovals({ side, cost, allowance, approvedForAll }) {
  if (side === "buy") return BigInt(allowance) < BigInt(cost) ? ["usdc"] : [];
  return approvedForAll ? [] : ["shares"];
}

/** EIP-1193 user rejection (4001) and the wording wallets use for it. */
export function isRejection(error) {
  const code = error && typeof error === "object" ? error.code : undefined;
  if (code === 4001 || code === "ACTION_REJECTED") return true;
  const text = String(error && typeof error === "object" && "message" in error ? error.message : error ?? "");
  return /user (rejected|denied|cancel)|rejected the request|request rejected|denied transaction/i.test(text);
}

const REASONS = {
  no_market: "Preparing this window — try again in a few seconds",
  not_created: "Preparing this window — try again in a few seconds",
  not_ready: "Preparing this window — try again in a few seconds",
  market_failed: "This window is unavailable",
  no_strike: "Waiting for the price to beat — try again in a moment",
  not_open: "This window has not opened yet",
  closing: "Trading in this window just closed",
  no_price: "Live price unavailable — try again in a moment",
  bad_request: "Pick a side and an amount",
  too_small: "Minimum trade is $1",
  too_large: "That is more than one trade can take — try a smaller amount",
  no_liquidity: "No shares available at this price right now — try a smaller amount",
  rate_limited: "Too many requests — wait a few seconds",
  unavailable: "On-chain trading is unavailable right now",
  wallet_not_verified: "Verify your wallet first",
  busy: "Busy — try again in a moment",
  closed: "Welcome box is closed right now",
  gas: "The reward wallet is out of gas — try again later",
};

export function reasonText(reason) {
  return REASONS[reason] ?? "On-chain trading is unavailable right now";
}

/** A short, human line for a thrown error from the trade flow. */
export function errorText(error) {
  if (isRejection(error)) return "Cancelled in your wallet";
  const message = String(error && typeof error === "object" && "message" in error ? error.message : error ?? "");
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(message))
    return "Not enough ETH on Base for network fees";
  if (/expired|Order expired/i.test(message)) return "That price expired — try again";
  if (/Insufficient|balance|allowance/i.test(message)) return "Not enough Virtual USDC";
  if (/execution reverted|reverted/i.test(message)) return "The price moved — try again";
  return message.length > 0 && message.length < 140 ? message : "Trade failed — try again";
}
