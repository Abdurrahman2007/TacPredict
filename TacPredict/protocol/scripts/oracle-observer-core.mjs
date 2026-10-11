/** Public-data observer only: never signs, submits a transaction or changes financial state. */
import { keccak256, stringToHex } from "viem";

export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const hashDocument = (document) => keccak256(stringToHex(canonical(document)));
const products = new Set(["BTC-USD", "ETH-USD", "SOL-USD"]);
export function decimalUnits(value) {
  const text = String(value);
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(text)) throw Error("Invalid exact USD decimal");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}
export function validateSpec(spec) {
  if (spec?.kind !== "coinbase-candle-close-v1" || !products.has(spec.product))
    throw Error("Unsupported pre-agreed resolution source");
  if (!Number.isSafeInteger(spec.candleStart) || spec.candleStart <= 0 || spec.candleStart % 60)
    throw Error("Candle start must be an exact UTC minute");
  if (typeof spec.thresholdUsd !== "string" || decimalUnits(spec.thresholdUsd) <= 0n)
    throw Error("Positive exact USD threshold required");
  return spec;
}
export function sourceForSpec(spec) {
  validateSpec(spec);
  return {
    source: "Coinbase Exchange public 1-minute candles",
    sourceUrl: `https://api.exchange.coinbase.com/products/${spec.product}/candles`,
  };
}
export function rulesForSpec(spec) {
  validateSpec(spec);
  return `Resolves Yes (outcome 0) if the Coinbase Exchange ${spec.product} 60-second candle beginning ${new Date(spec.candleStart * 1000).toISOString()} has a closing USD price greater than or equal to ${spec.thresholdUsd}; otherwise No (outcome 1). Observation time is the candle end, ${new Date((spec.candleStart + 60) * 1000).toISOString()}. Compare exact USD decimals with up to eight fractional digits. A missing, duplicate or invalid candle is not an outcome: halt automatic observation and use the pre-agreed manual dispute/timeout process. This is a bonded trusted-resolver beta, not a decentralized price oracle.`;
}
export function bindTerms(metadata, market, spec) {
  const source = sourceForSpec(spec);
  if (
    hashDocument(metadata).toLowerCase() !== market.metadataHash.toLowerCase() ||
    keccak256(stringToHex(metadata.rules)).toLowerCase() !== market.rulesHash.toLowerCase() ||
    hashDocument(source).toLowerCase() !== market.sourceHash.toLowerCase()
  )
    throw Error("On-chain immutable terms hash mismatch");
  if (
    metadata.rules !== rulesForSpec(spec) ||
    metadata.source !== source.source ||
    metadata.sourceUrl !== source.sourceUrl ||
    canonical(metadata.outcomes) !== canonical(["Yes", "No"]) ||
    Number(market.outcomeCount) !== 2 ||
    Number(market.closeAt) !== spec.candleStart + 60
  )
    throw Error("Observation does not match pre-agreed market terms");
}
export async function observeCandle(spec, fetcher = fetch, now = Math.floor(Date.now() / 1000)) {
  const source = sourceForSpec(spec);
  if (now < spec.candleStart + 120) throw Error("Wait one minute after the candle closes");
  const url = new URL(source.sourceUrl);
  url.searchParams.set("granularity", "60");
  url.searchParams.set("start", new Date(spec.candleStart * 1000).toISOString());
  url.searchParams.set("end", new Date((spec.candleStart + 60) * 1000).toISOString());
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`Source unavailable: HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw Error("Invalid source response");
  const matches = rows.filter((r) => Array.isArray(r) && r[0] === spec.candleStart);
  if (matches.length !== 1) throw Error("Missing or duplicate exact candle; no automatic outcome");
  const row = matches[0];
  if (row.length !== 6 || row.some((v) => typeof v !== "number" || !Number.isFinite(v)))
    throw Error("Invalid candle values");
  const [start, low, high, open, close, volume] = row;
  if (
    low <= 0 ||
    high < low ||
    open < low ||
    open > high ||
    close < low ||
    close > high ||
    volume < 0
  )
    throw Error("Inconsistent candle values");
  const outcome = decimalUnits(close) >= decimalUnits(spec.thresholdUsd) ? 0 : 1;
  return {
    version: 1,
    source,
    requestUrl: url.toString(),
    sourceTimestamp: start + 60,
    product: spec.product,
    thresholdUsd: spec.thresholdUsd,
    candle: row.map(String),
    outcome,
    voided: false,
  };
}
