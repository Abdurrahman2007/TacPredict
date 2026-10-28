import { BASE_CHAINLINK_FEEDS, type ChainlinkAsset } from "./chainlink-feeds";
import type { UpDownAsset } from "@/lib/updown/window.mjs";

/**
 * Settlement / trading eligibility — display feeds ≠ contract-verifiable settlement.
 *
 * Display: Coinbase WS/REST (charts, paper ¢ estimates). Never used alone as trustless
 * on-chain settlement input.
 *
 * Settlement (VirtualPriceAMM feed-v1): AggregatorV3 Chainlink on Base for BTC/ETH/SOL/BNB
 * only. Heartbeats (≤1200s BTC/ETH; ≤86400s SOL/BNB) are too slow for reliable 5-minute
 * boundary capture. Short windows stay paper/display-only until an approved low-latency
 * pull oracle (e.g. Pyth / RedStone / Chainlink Data Streams) is integrated and audited.
 *
 * XRP: no Base Chainlink XRP/USD AggregatorV3 in our verified directory — keep asset in UI
 * for charts; block trading & on-chain settlement until a verifiable mechanism is approved.
 * Never invent a feed address.
 */

export type SettlementTier = "chainlink_ok" | "paper_only" | "unavailable";

export type AssetSettlementPolicy = {
  asset: string;
  minutes: number;
  tier: SettlementTier;
  /** User-facing one-liner (existing UI chrome — banner text only). */
  label: string;
  /** Allow paper Buy/Sell in the current UI. */
  paperTradingAllowed: boolean;
  /** Allow creating/settling VirtualPriceAMM markets on an authorized testnet/mainnet. */
  onchainSettlementAllowed: boolean;
  reasons: string[];
};

const SHORT_MINUTES = new Set([5, 15, 30]);

export function toChainlinkAsset(asset: UpDownAsset | string): ChainlinkAsset | null {
  const map: Record<string, ChainlinkAsset> = {
    bitcoin: "BTC",
    btc: "BTC",
    BTC: "BTC",
    ethereum: "ETH",
    eth: "ETH",
    ETH: "ETH",
    solana: "SOL",
    sol: "SOL",
    SOL: "SOL",
    bnb: "BNB",
    BNB: "BNB",
  };
  return map[asset] ?? null;
}

export function isXrpAsset(asset: UpDownAsset | string): boolean {
  const a = String(asset).toLowerCase();
  return a === "xrp" || a === "ripple";
}

/** Max Chainlink heartbeat that can still support a window (conservative: half window). */
export function chainlinkSupportsWindow(asset: ChainlinkAsset, minutes: number): boolean {
  const beat = BASE_CHAINLINK_FEEDS[asset].heartbeatSeconds;
  return beat * 2 <= minutes * 60;
}

export function assetSettlementPolicy(
  asset: UpDownAsset | string,
  minutes: number,
): AssetSettlementPolicy {
  if (isXrpAsset(asset)) {
    return {
      asset: "XRP",
      minutes,
      tier: "unavailable",
      label: "XRP · charts only — settlement oracle not available on Base",
      paperTradingAllowed: false,
      onchainSettlementAllowed: false,
      reasons: [
        "No verified Base AggregatorV3 XRP/USD feed in TacPredict registry",
        "Coinbase XRP-USD is display-only and is not contract-verifiable settlement",
        "Do not fabricate a feed address; wire Pyth/RedStone/Data Streams only after approval",
      ],
    };
  }

  const cl = toChainlinkAsset(asset);
  if (!cl) {
    return {
      asset: String(asset),
      minutes,
      tier: "unavailable",
      label: "Unsupported asset",
      paperTradingAllowed: false,
      onchainSettlementAllowed: false,
      reasons: ["Unknown asset"],
    };
  }

  const feed = BASE_CHAINLINK_FEEDS[cl];
  if (SHORT_MINUTES.has(minutes) || !chainlinkSupportsWindow(cl, minutes)) {
    return {
      asset: cl,
      minutes,
      tier: "paper_only",
      label: `${cl} · paper quotes — Chainlink too slow for ${minutes}m settlement`,
      paperTradingAllowed: true,
      onchainSettlementAllowed: false,
      reasons: [
        `Chainlink ${feed.description} heartbeat ${feed.heartbeatSeconds}s exceeds safe bound for ${minutes}m windows`,
        "Start/expiry capture requires first Aggregator round at/after boundary with predecessor before boundary",
        "Approved low-latency pull oracle required before on-chain short-window settlement",
        "If boundary round missing/stale/jumped: pause resolution (timeout-void) — never invent a price",
      ],
    };
  }

  return {
    asset: cl,
    minutes,
    tier: "chainlink_ok",
    label: `${cl} · Chainlink ${feed.description}`,
    paperTradingAllowed: true,
    onchainSettlementAllowed: true,
    reasons: [
      `Feed ${feed.address} · maxAge≤${feed.recommendedMaxAgeSeconds}s`,
      "Sequencer uptime feed required; stale/invalid rounds revert Stale()",
      "Coinbase charts remain reference-only",
    ],
  };
}

/** Smallest safe XRP path later (documentation helper — not enabled). */
export const XRP_FOLLOWUP = {
  steps: [
    "Select Base-supported pull oracle with XRP/USD (Pyth or RedStone) — verify Mainnet+Sepolia IDs from vendor docs",
    "Extend VirtualPriceAMM or adapter to verify signed reports (not a fake Aggregator address)",
    "Freeze price policy hash; capture start/expiry from attested publishTime within tolerance",
    "Sepolia E2E then separate Mainnet approval",
  ],
  blockedUntil: "Vendor feed ID + audit + owner approval",
} as const;
