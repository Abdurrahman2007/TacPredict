import { BASE_CHAINLINK_FEEDS, type ChainlinkAsset } from "./chainlink-feeds";
import type { UpDownAsset } from "@/lib/updown/window.mjs";

/**
 * Settlement / trading eligibility — display feeds ≠ contract-verifiable settlement.
 *
 * Display: Coinbase WS/REST (charts, paper ¢ estimates). Never used alone as trustless
 * on-chain settlement input.
 *
 * Settlement (VirtualPriceAMM feed-v1): AggregatorV3 Chainlink on Base for BTC/ETH/SOL/BNB
 * only. Heartbeats are too slow for reliable 5-minute boundary capture on Mainnet Chainlink.
 * Short windows use paper Virtual USDC + feed-v1 quote model until a low-latency pull oracle
 * is approved. XRP is permanently out of the product — do not reintroduce.
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

/** Max Chainlink heartbeat that can still support a window (conservative: half window). */
export function chainlinkSupportsWindow(asset: ChainlinkAsset, minutes: number): boolean {
  const beat = BASE_CHAINLINK_FEEDS[asset].heartbeatSeconds;
  return beat * 2 <= minutes * 60;
}

export function assetSettlementPolicy(
  asset: UpDownAsset | string,
  minutes: number,
): AssetSettlementPolicy {
  const cl = toChainlinkAsset(asset);
  if (!cl) {
    return {
      asset: String(asset),
      minutes,
      tier: "unavailable",
      label: "Unsupported asset",
      paperTradingAllowed: false,
      onchainSettlementAllowed: false,
      reasons: ["Unknown or removed asset (XRP is not offered)"],
    };
  }

  const feed = BASE_CHAINLINK_FEEDS[cl];
  if (SHORT_MINUTES.has(minutes) || !chainlinkSupportsWindow(cl, minutes)) {
    return {
      asset: cl,
      minutes,
      tier: "paper_only",
      label: `${cl} · Virtual USDC paper · ${minutes}m`,
      paperTradingAllowed: true,
      onchainSettlementAllowed: false,
      reasons: [
        `Chainlink ${feed.description} heartbeat ${feed.heartbeatSeconds}s exceeds safe bound for ${minutes}m on-chain windows`,
        "Paper path uses feed-v1 quote + Coinbase display spot; 5m result robot settles paper positions",
        "On-chain short-window settlement needs an approved low-latency oracle",
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
