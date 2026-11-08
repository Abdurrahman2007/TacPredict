/**
 * The on-chain terms of one Up/Down window market: what the Factory is called with, and the public metadata whose hash
 * the contract stores. Everything is derived from the market key alone, so anyone can recompute the hashes.
 */
import { keccak256, stringToBytes } from "viem";
import {
  PROPOSE_DELAY_SEC,
  RESOLUTION_WINDOW_SEC,
  VSET_PRODUCTS,
  parseMarketKey,
} from "./schedule.mjs";

const hash = (text) => keccak256(stringToBytes(text));

export const RULES_TEXT =
  "Up pays 1 Virtual USDC per share when the close of the last one-minute Coinbase Exchange candle of the window is higher than the open of its first one; Down pays 1 when it is lower. An exact tie voids the market and every share pays 0.5. Virtual USDC has no cash value and cannot be withdrawn. The TacPredict resolver proposes the result and anyone can dispute it for 60 seconds.";

export const RULES_HASH = hash(RULES_TEXT);

/** The price source named in the market: one hash per product, so a market can never be settled from another feed. */
export function sourceHashFor(asset) {
  const product = VSET_PRODUCTS[asset];
  if (!product) throw new Error("Unknown asset");
  return hash(`coinbase-exchange:${product}:candles:60s`);
}

export function metadataUri(key) {
  return `https://tacpredict.fun/api/v2/market/${key}`;
}

/** Public metadata for a market key. The same object is served at metadataUri(key) and hashed into the market. */
export function marketMetadata(key) {
  const parsed = parseMarketKey(key);
  if (!parsed) throw new Error("Not a window market key");
  const startSec = parsed.startMs / 1000;
  return {
    v: 1,
    kind: "updown-window",
    key,
    asset: parsed.asset,
    product: VSET_PRODUCTS[parsed.asset],
    minutes: parsed.minutes,
    startSec,
    endSec: startSec + parsed.minutes * 60,
    outcomes: ["Up", "Down"],
    currency: "Virtual USDC",
    rules: RULES_TEXT,
  };
}

/** Arguments for VirtualMarketFactory.createMarket for one planned window (see plannedWindows). */
export function marketTerms(window) {
  const metadata = marketMetadata(window.key);
  return {
    terms: {
      salt: hash(`tacpredict.virtual.v2.market:${window.key}`),
      metadataHash: hash(JSON.stringify(metadata)),
      rulesHash: RULES_HASH,
      sourceHash: sourceHashFor(window.asset),
      outcomes: 2,
      openAt: BigInt(window.openAtSec),
      closeAt: BigInt(window.endSec),
      resolveAfter: BigInt(window.endSec + PROPOSE_DELAY_SEC),
      resolutionDeadline: BigInt(window.endSec + RESOLUTION_WINDOW_SEC),
    },
    metadataURI: metadataUri(window.key),
    metadata,
  };
}

/** Evidence hash for a proposal: the exact candle prices the result was computed from. */
export function evidenceHashFor(evidence) {
  return hash(JSON.stringify(evidence));
}
