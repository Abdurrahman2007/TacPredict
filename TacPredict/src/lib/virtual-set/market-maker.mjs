/**
 * Market-maker pricing and order signing for the Virtual USDC contract set.
 *
 * The platform runs a funded wallet that is the other side of every instant buy and sell. Prices follow the real
 * feed second by second: the later in the window and the further spot is from the strike, the closer the winning side
 * gets to 99 cents (and the losing side to 1 cent). Nothing here invents a price: every number comes from the feed
 * reading (spot, strike), the time left and the policy the operator passes in.
 *
 * Trades use the unchanged VirtualExchange order book. For each request the maker wallet signs one short-lived
 * order that is bound to the asking wallet; the user's wallet then sends `fillOrder`, so every buy and sell is the
 * user's own onchain transaction. Pure module: no network, no keys. The signer is passed in.
 */

export const PRICE_SCALE = 1_000_000;
export const UP = 0;
export const DOWN = 1;
/** Cheapest and dearest a share can be quoted: 1 cent and 99 cents. */
export const MIN_PRICE_PPM = 10_000;
export const MAX_PRICE_PPM = 990_000;
/** A quote lives at most this long, so a stale price can be hit for only a few seconds. */
export const MAX_TTL_SEC = 30;
/** No quote in the last seconds of a window: the order could not land before the market closes. */
export const MIN_REMAINING_SEC = 2;

export const ORDER_TYPES = {
  Order: [
    { name: "marketId", type: "uint256" },
    { name: "outcome", type: "uint8" },
    { name: "maker", type: "address" },
    { name: "isBuy", type: "bool" },
    { name: "price", type: "uint256" },
    { name: "shares", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiration", type: "uint64" },
    { name: "taker", type: "address" },
  ],
};

/** The virtual exchange signs under its own name, so a production-exchange signature can never be replayed here. */
export function exchangeDomain({ chainId, exchange }) {
  if (chainId !== 8453 && chainId !== 84532) throw new Error("Base only");
  if (!isAddress(exchange)) throw new Error("Invalid exchange address");
  return { name: "TacPredictVirtualExchange", version: "1", chainId, verifyingContract: exchange };
}

const ZERO = "0x0000000000000000000000000000000000000000";
const isAddress = (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

// Abramowitz & Stegun 7.1.26, absolute error below 1.5e-7: far below one ppm step of a price.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}
const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/**
 * Probability (in ppm) that the window ends Up, from the live reading.
 * `sigmaPpm` is the expected move per square-root second as a share of price, in ppm (900 = 0.09% per sqrt(s)).
 * It must be calibrated from real feed history by the operator; a larger value keeps prices closer to 50 cents for longer.
 * Returns null when any input is unusable or the window is over.
 */
export function makerFairUpPpm({ spot, strike, remainingSec, sigmaPpm }) {
  for (const value of [spot, strike, remainingSec, sigmaPpm])
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const deviation = (spot - strike) / strike;
  const z = deviation / ((sigmaPpm / PRICE_SCALE) * Math.sqrt(remainingSec));
  const ppm = Math.round(normalCdf(z) * PRICE_SCALE);
  return Math.min(MAX_PRICE_PPM, Math.max(MIN_PRICE_PPM, ppm));
}

/**
 * Bid and ask for both outcomes around the fair Up probability. `halfSpreadPpm` is the maker's edge on each side;
 * buying Up and Down together always costs more than one dollar, so there is no risk-free profit for a user.
 */
export function makerQuote({ upPpm, halfSpreadPpm = 10_000 }) {
  if (!Number.isInteger(upPpm) || upPpm < MIN_PRICE_PPM || upPpm > MAX_PRICE_PPM) throw new Error("Invalid fair price");
  if (!Number.isInteger(halfSpreadPpm) || halfSpreadPpm <= 0 || halfSpreadPpm >= PRICE_SCALE / 4) throw new Error("Invalid spread");
  const upAsk = Math.min(upPpm + halfSpreadPpm, MAX_PRICE_PPM);
  const upBid = Math.max(upPpm - halfSpreadPpm, MIN_PRICE_PPM);
  return { fairUpPpm: upPpm, up: { bid: upBid, ask: upAsk }, down: { bid: PRICE_SCALE - upAsk, ask: PRICE_SCALE - upBid } };
}

/** What the user pays or receives per share: buying uses the maker's ask, selling uses the maker's bid. */
export function userPrice(quote, outcome, userSide) {
  const book = outcome === UP ? quote.up : outcome === DOWN ? quote.down : null;
  if (!book) throw new Error("Invalid outcome");
  if (userSide === "buy") return book.ask;
  if (userSide === "sell") return book.bid;
  throw new Error("Invalid side");
}

/** One short-lived maker order, bound to the wallet that asked for it. When the user buys, the maker sells, and the reverse. */
export function makerOrder({ marketId, outcome, maker, userSide, quote, shares, nonce, closeAt, now, taker, ttlSec = 10 }) {
  if (!isAddress(maker) || !isAddress(taker) || taker.toLowerCase() === ZERO) throw new Error("Order must name the maker and the asking wallet");
  if (maker.toLowerCase() === taker.toLowerCase()) throw new Error("Maker cannot trade with itself");
  if (!Number.isInteger(ttlSec) || ttlSec <= 0 || ttlSec > MAX_TTL_SEC) throw new Error("Quote lifetime out of range");
  if (!Number.isInteger(now) || !Number.isInteger(closeAt) || closeAt - now < MIN_REMAINING_SEC) throw new Error("Market is closing");
  const price = userPrice(quote, outcome, userSide);
  if (!(price > 0 && price < PRICE_SCALE)) throw new Error("Invalid price");
  const size = BigInt(shares);
  if (size <= 0n) throw new Error("Invalid size");
  return {
    marketId: BigInt(marketId),
    outcome,
    maker,
    isBuy: userSide === "sell",
    price: BigInt(price),
    shares: size,
    nonce: BigInt(nonce),
    expiration: BigInt(Math.min(now + ttlSec, closeAt)),
    taker,
  };
}

/** `account` is any viem-style account with signTypedData. The key stays with the operator, never in this repo. */
export function signMakerOrder(account, domain, order) {
  return account.signTypedData({ domain, types: ORDER_TYPES, primaryType: "Order", message: order });
}

/** Mirror of Exchange.fillOrder's cost for a first fill: floor(shares * price / 1e6). */
export const fillCost = (price, shares) => (BigInt(price) * BigInt(shares)) / BigInt(PRICE_SCALE);
