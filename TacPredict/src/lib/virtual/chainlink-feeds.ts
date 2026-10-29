import { getAddress, type Address } from "viem";

/** Paper-trading assets on Base (XRP intentionally unsupported). */
export type ChainlinkAsset = "BTC" | "ETH" | "SOL" | "BNB";

export type BaseChainlinkFeed = {
  asset: ChainlinkAsset;
  /** AggregatorV3 proxy on Base Mainnet (8453). */
  address: Address;
  /** Human-readable Chainlink product name (on-chain description). */
  description: string;
  /** Published heartbeat seconds (upper bound between forced updates). */
  heartbeatSeconds: number;
  /**
   * Safe maxAge for VirtualPriceAMM pricePolicies.maxAge.
   * Contract hard-caps at 3600; never raise maxAge to hide a slow feed.
   */
  recommendedMaxAgeSeconds: number;
  decimals: 8;
};

/**
 * Base Mainnet Chainlink feeds for paper-trading quotes / settlement.
 * On-chain reads only — no API key. Backend uses VIRTUAL_RPC_URL (Ankr).
 *
 * BTC uses the product-requested proxy (on-chain description WBTC/USD).
 * True BTC/USD remains available as BTC_USD_OFFICIAL if ownership switches later.
 */
export const BASE_CHAINLINK_FEEDS: Record<ChainlinkAsset, BaseChainlinkFeed> = {
  BTC: {
    asset: "BTC",
    address: getAddress("0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E"),
    description: "WBTC / USD",
    heartbeatSeconds: 1200,
    recommendedMaxAgeSeconds: 1200,
    decimals: 8,
  },
  ETH: {
    asset: "ETH",
    address: getAddress("0x71041dddad3595F9CEd3dCCFBe3D1F4b0a16Bb70"),
    description: "ETH / USD",
    heartbeatSeconds: 1200,
    recommendedMaxAgeSeconds: 1200,
    decimals: 8,
  },
  SOL: {
    asset: "SOL",
    address: getAddress("0x975043adBb80fc32276CbF9Bbcfd4A601a12462D"),
    description: "SOL / USD",
    heartbeatSeconds: 86400,
    recommendedMaxAgeSeconds: 3600,
    decimals: 8,
  },
  BNB: {
    asset: "BNB",
    address: getAddress("0x4b7836916781CAAfbb7Bd1E5FDd20ED544B453b1"),
    description: "BNB / USD",
    heartbeatSeconds: 86400,
    recommendedMaxAgeSeconds: 3600,
    decimals: 8,
  },
};

/** Official Chainlink BTC/USD on Base (optional alternative to WBTC/USD above). */
export const BTC_USD_OFFICIAL: Address = getAddress("0x32F587986D3fb47601157c19615d568BeD0BCabc");

/** Base L2 sequencer uptime status feed (AggregatorV3-compatible). */
export const BASE_SEQUENCER_FEED: Address = getAddress(
  "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433",
);

export const PAPER_TRADING_ASSETS = ["BTC", "ETH", "SOL", "BNB"] as const;

export function isChainlinkAsset(value: string): value is ChainlinkAsset {
  return (PAPER_TRADING_ASSETS as readonly string[]).includes(value);
}

/** Effective oracle maxAge for a market: min(policy, feed recommendation, contract cap). */
export function effectiveOracleMaxAgeSeconds(
  asset: ChainlinkAsset,
  policyMaxFetchAgeSeconds: number,
): number {
  const feed = BASE_CHAINLINK_FEEDS[asset];
  const capped = Math.min(
    policyMaxFetchAgeSeconds,
    feed.recommendedMaxAgeSeconds,
    feed.heartbeatSeconds,
    3600,
  );
  if (!Number.isInteger(capped) || capped < 1) throw Error("Invalid oracle freshness policy");
  return capped;
}

/**
 * Suggested immutable PricePolicy feed fields for VirtualPriceAMM.configurePricePolicy.
 * Economic params (sigma/spread/…) remain owner-calibrated separately.
 */
export function recommendedFeedPolicyFields(asset: ChainlinkAsset) {
  const feed = BASE_CHAINLINK_FEEDS[asset];
  return {
    feed: feed.address,
    sequencer: BASE_SEQUENCER_FEED,
    asset,
    maxAge: feed.recommendedMaxAgeSeconds,
    description: feed.description,
  };
}
