import type { TradeIntent } from "./types";
// Shared by both responsive order-card instances. A quote belongs to one exact intent.
export function virtualQuoteKey(
  deployment: string,
  marketId: string,
  wallet: string | undefined,
  outcome: number,
  mode: string,
  input: string,
) {
  return [
    "virtual",
    deployment,
    "quote",
    marketId,
    wallet?.toLowerCase(),
    outcome,
    mode,
    input,
  ] as const;
}
export function assertQuoteIntent(actual: TradeIntent, expected: Omit<TradeIntent, "nonce">) {
  if (
    actual.wallet.toLowerCase() !== expected.wallet.toLowerCase() ||
    actual.marketId !== expected.marketId ||
    actual.outcome !== expected.outcome ||
    actual.isBuy !== expected.isBuy ||
    actual.input !== expected.input
  )
    throw Error("Quote no longer matches this market, wallet or order. Refresh quote.");
}
export function assertFreshProjection(
  indexedTimestamp: bigint,
  latestTimestamp: bigint,
  maxAgeSeconds: number,
) {
  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < 1 ||
    maxAgeSeconds > 3600 ||
    latestTimestamp < indexedTimestamp ||
    latestTimestamp - indexedTimestamp > BigInt(maxAgeSeconds)
  )
    throw Error("Virtual indexer is stale; trading blocked until reconciliation.");
}
export function missingReceiptStatus(previous: { block_number: unknown } | null) {
  return previous?.block_number != null ? ("reorged" as const) : ("pending" as const);
}

export function assertFreshChainTime(
  headTimestamp: bigint,
  observedAt: bigint,
  maxAgeSeconds: number,
) {
  if (headTimestamp > observedAt + 30n || observedAt - headTimestamp > BigInt(maxAgeSeconds))
    throw Error("Virtual chain data is stale; trading blocked until the provider recovers.");
}
