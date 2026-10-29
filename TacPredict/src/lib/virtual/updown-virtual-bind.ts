/**
 * Bind a scheduled Up/Down window to a catalogue VirtualPriceAMM market when one exists.
 * No binding → paper ledger. Binding + execution gate → wallet buy/sell on-chain.
 */
import type { Market } from "@/domain/markets/types";
import type { UpDownAsset } from "@/lib/updown/window.mjs";
import { ASSETS } from "@/lib/updown/window.mjs";
import { onchainVirtualExecutionAllowed } from "./updown-onchain-gate";

const TIME_SLACK_MS = 1500;

export function matchVirtualUpDownMarket(
  markets: Market[] | undefined,
  asset: UpDownAsset,
  window: { start: number; end: number },
): Market | undefined {
  if (!markets?.length) return undefined;
  const info = ASSETS[asset];
  const assetRe = new RegExp(`\\b(${info.name}|${info.short}|${asset})\\b`, "i");
  return markets.find((m) => {
    if (!m.virtual || m.category !== "Crypto") return false;
    if (!m.startsAt || !m.endsAt) return false;
    if (!assetRe.test(m.title)) return false;
    const open = Date.parse(m.startsAt);
    const close = Date.parse(m.endsAt);
    if (!Number.isFinite(open) || !Number.isFinite(close)) return false;
    return Math.abs(open - window.start) <= TIME_SLACK_MS && Math.abs(close - window.end) <= TIME_SLACK_MS;
  });
}

export type UpDownTradeResolve = {
  market: Market;
  mode: "onchain" | "paper";
  reason: string;
};

/** Prefer on-chain VirtualAmountCard when a matching pool is indexed and execution is allowed. */
export function resolveUpDownTradeMarket(input: {
  virtualMarket: Market | null | undefined;
  paperMarket: Market;
}): UpDownTradeResolve {
  const bound = input.virtualMarket?.virtual;
  if (!bound) {
    return {
      market: input.paperMarket,
      mode: "paper",
      reason: "No VirtualPriceAMM pool bound for this window",
    };
  }
  const gate = onchainVirtualExecutionAllowed(bound.deployment);
  if (!gate.allowed) {
    return { market: input.paperMarket, mode: "paper", reason: gate.reason };
  }
  return {
    market: input.virtualMarket!,
    mode: "onchain",
    reason: `Bound to on-chain market ${bound.onchainId}`,
  };
}
