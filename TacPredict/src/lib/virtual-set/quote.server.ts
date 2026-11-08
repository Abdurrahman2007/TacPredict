/**
 * Instant buy / sell quotes. The maker wallet signs one short-lived order that is bound to the asking wallet; the
 * user's own wallet then sends fillOrder, so every trade is the user's own on-chain transaction and the server never
 * moves anyone's balance. The price follows the live feed (distance from the price to beat and the time left).
 *
 * Nothing is signed unless the market is created, stocked, priced and open, and the maker really holds the shares
 * (or the virtual USDC) the order needs.
 */
import { getAddress, type Address, type Hex } from "viem";
import { virtualConditionalPositionsAbi, virtualUsdcAbi } from "./abi";
import { marketByKey, patchMarket, vdb } from "./db.server";
import {
  exchangeDomain,
  makerFairUpPpm,
  makerOrder,
  makerQuote,
  signMakerOrder,
  userPrice,
} from "./market-maker.mjs";
import {
  KEEPER_ADDRESS,
  MAX_SHARES_PER_ORDER,
  VSET_CONTRACTS,
  keeperAccount,
  publicClient,
  tokenIdOf,
} from "./onchain.server";
import { fillCostFor, parseMarketKey, quoteBlocker, sharesForUsdc } from "./schedule.mjs";

/** Expected move per square-root second, in ppm of price: the same 0.009% the page's own odds use. */
export const SIGMA_PPM = 90;
/** The maker's edge on each side of the fair price: 1 cent. */
export const HALF_SPREAD_PPM = 10_000;
/** A quote can be hit for this many seconds, enough for a wallet confirmation and no more. */
export const QUOTE_TTL_SEC = 30;
const MIN_SPEND = 1_000_000n; // $1
const MAX_SPEND = 5_000_000_000n; // $5,000

export type QuoteInput = {
  key: string;
  outcome: 0 | 1;
  side: "buy" | "sell";
  taker: string;
  /** Buy: how much virtual USDC to spend (6 decimals). */
  usdc?: string | undefined;
  /** Sell: how many shares to sell (6 decimals). */
  shares?: string | undefined;
};

export type QuoteReason =
  | "no_market"
  | "market_failed"
  | "not_created"
  | "not_ready"
  | "no_strike"
  | "not_open"
  | "closing"
  | "no_price"
  | "bad_request"
  | "too_small"
  | "too_large"
  | "no_liquidity"
  | "rate_limited"
  | "unavailable";

export type SignedQuote = {
  key: string;
  marketId: string;
  outcome: 0 | 1;
  side: "buy" | "sell";
  /** What the user pays or gets per share, in ppm of one dollar. */
  pricePpm: number;
  fairUpPpm: number;
  shares: string;
  /** Virtual USDC (6 decimals) the user pays on a buy, or receives on a sell. */
  usdc: string;
  expiration: number;
  order: {
    marketId: string;
    outcome: number;
    maker: Address;
    isBuy: boolean;
    price: string;
    shares: string;
    nonce: string;
    expiration: string;
    taker: Address;
  };
  signature: Hex;
  contracts: { exchange: Address; positions: Address; usdc: Address };
};

export type QuoteResult =
  | { ok: true; quote: SignedQuote }
  | { ok: false; reason: QuoteReason };

const recent = new Map<string, number[]>();
function limited(taker: string, now: number): boolean {
  const list = (recent.get(taker) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 40) {
    recent.set(taker, list);
    return true;
  }
  list.push(now);
  recent.set(taker, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

function randomNonce(): bigint {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`);
}

const asBigInt = (value: string | undefined): bigint | null => {
  if (typeof value !== "string" || !/^\d{1,30}$/.test(value)) return null;
  return BigInt(value);
};

export async function signQuote(input: QuoteInput): Promise<QuoteResult> {
  const parsed = parseMarketKey(input.key);
  if (!parsed || (input.outcome !== 0 && input.outcome !== 1) || !/^0x[0-9a-fA-F]{40}$/.test(input.taker))
    return { ok: false, reason: "bad_request" };
  if (input.side !== "buy" && input.side !== "sell") return { ok: false, reason: "bad_request" };
  const taker = getAddress(input.taker);
  if (taker.toLowerCase() === KEEPER_ADDRESS.toLowerCase()) return { ok: false, reason: "bad_request" };
  const now = Math.floor(Date.now() / 1000);
  if (limited(taker.toLowerCase(), now * 1000)) return { ok: false, reason: "rate_limited" };

  const db = await vdb();
  let row = await marketByKey(db, input.key);
  let blocker = quoteBlocker(row, now);

  // The price to beat is the first candle's open. The keeper does not need to be involved: take it here.
  if (row && blocker === "no_strike") {
    const open = await openPriceOf(row.asset, row.minutes, parsed.startMs);
    if (open) {
      await patchMarket(db, row.key, { strike: open });
      row = { ...row, strike: open };
      blocker = quoteBlocker(row, now);
    }
  }
  if (!row || blocker) return { ok: false, reason: (blocker ?? "no_market") as QuoteReason };
  if (row.market_id === null || row.strike === null) return { ok: false, reason: "not_ready" };

  const { spotTickers } = await import("@/lib/updown/spot.server");
  const tickers = await spotTickers();
  const spot = tickers.prices[row.asset]?.price;
  const endSec = Date.parse(row.end_at) / 1000;
  const fair = spot
    ? makerFairUpPpm({ spot, strike: row.strike, remainingSec: endSec - now, sigmaPpm: SIGMA_PPM })
    : null;
  if (!fair) return { ok: false, reason: "no_price" };
  const quote = makerQuote({ upPpm: fair, halfSpreadPpm: HALF_SPREAD_PPM });
  const price = userPrice(quote, input.outcome, input.side);

  let shares: bigint;
  if (input.side === "buy") {
    const spend = asBigInt(input.usdc);
    if (spend === null) return { ok: false, reason: "bad_request" };
    if (spend < MIN_SPEND) return { ok: false, reason: "too_small" };
    if (spend > MAX_SPEND) return { ok: false, reason: "too_large" };
    shares = sharesForUsdc(spend, price);
  } else {
    const amount = asBigInt(input.shares);
    if (amount === null) return { ok: false, reason: "bad_request" };
    shares = amount;
  }
  if (shares > MAX_SHARES_PER_ORDER) return { ok: false, reason: "too_large" };
  const cost = fillCostFor(shares, price);
  if (shares <= 0n || cost <= 0n) return { ok: false, reason: "too_small" };

  // The maker must really hold what the order promises: shares when the user buys, virtual USDC when the user sells.
  try {
    const pub = publicClient();
    if (input.side === "buy") {
      const token = await tokenIdOf(row.market_id, input.outcome);
      const held = await pub.readContract({
        address: VSET_CONTRACTS.positions,
        abi: virtualConditionalPositionsAbi,
        functionName: "balanceOf",
        args: [KEEPER_ADDRESS, token],
      });
      if (held < shares) return { ok: false, reason: "no_liquidity" };
    } else {
      const float = await pub.readContract({
        address: VSET_CONTRACTS.usdc,
        abi: virtualUsdcAbi,
        functionName: "balanceOf",
        args: [KEEPER_ADDRESS],
      });
      if (float < cost) return { ok: false, reason: "no_liquidity" };
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const order = makerOrder({
    marketId: row.market_id,
    outcome: input.outcome,
    maker: KEEPER_ADDRESS,
    userSide: input.side,
    quote,
    shares,
    nonce: randomNonce(),
    closeAt: Math.floor(endSec),
    now,
    taker,
    ttlSec: QUOTE_TTL_SEC,
  });
  const signature = await signMakerOrder(
    keeperAccount(),
    exchangeDomain({ chainId: 8453, exchange: VSET_CONTRACTS.exchange }),
    order,
  );
  return {
    ok: true,
    quote: {
      key: row.key,
      marketId: String(row.market_id),
      outcome: input.outcome,
      side: input.side,
      pricePpm: price,
      fairUpPpm: fair,
      shares: shares.toString(),
      usdc: cost.toString(),
      expiration: Number(order.expiration),
      order: {
        marketId: order.marketId.toString(),
        outcome: order.outcome,
        maker: order.maker,
        isBuy: order.isBuy,
        price: order.price.toString(),
        shares: order.shares.toString(),
        nonce: order.nonce.toString(),
        expiration: order.expiration.toString(),
        taker: order.taker,
      },
      signature,
      contracts: {
        exchange: VSET_CONTRACTS.exchange,
        positions: VSET_CONTRACTS.positions,
        usdc: VSET_CONTRACTS.usdc,
      },
    },
  };
}

/** Open price of the first one-minute candle of a window, from the same Coinbase data the page shows. */
export async function openPriceOf(asset: string, minutes: number, startMs: number): Promise<number | null> {
  try {
    const { spotWindowData } = await import("@/lib/updown/spot.server");
    const { priceToBeat } = await import("@/lib/updown/window.mjs");
    const lookback = Math.min(290, Math.ceil((Date.now() - startMs) / 60_000) + 3);
    const data = await spotWindowData(asset as "bitcoin" | "ethereum" | "solana" | "bnb", Math.max(lookback, minutes));
    return priceToBeat(data.candles, startMs, 60_000);
  } catch {
    return null;
  }
}
