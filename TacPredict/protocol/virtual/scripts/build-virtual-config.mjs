/**
 * Build a VIRTUAL_TRADING_CONFIG JSON skeleton for BTC/ETH/SOL/BNB hourly paper markets.
 * Requires deployment.json from prepare-price-mainnet.mjs (engine + runtimeCodeHash + startBlock).
 * Does not enable trading until you set enabled:true after pools/policies exist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, toHex, keccak256 } from "viem";
import {
  BASE_CHAINLINK_FEEDS,
  BASE_SEQUENCER_FEED,
  PAPER_TRADING_ASSETS,
  recommendedFeedPolicyFields,
} from "../../../src/lib/virtual/chainlink-feeds.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployPath =
  process.argv[2] || path.join(__dirname, "../launch/price-mainnet/deployment.json");
if (!fs.existsSync(deployPath))
  throw Error("Pass deployment.json from prepare-price-mainnet.mjs (after deploy or already-deployed)");
const d = JSON.parse(fs.readFileSync(deployPath, "utf8"));
if (!d.engine || !d.runtimeCodeHash || !d.startBlock)
  throw Error("deployment.json missing engine/runtimeCodeHash/startBlock");

const intervalSeconds = 3600; // hourly — safe vs Chainlink heartbeats; not 5-minute
const now = Math.floor(Date.now() / 1000);
const firstOpen = (Math.floor(now / intervalSeconds) + 2) * intervalSeconds;

const markets = PAPER_TRADING_ASSETS.map((asset, i) => {
  const openAt = firstOpen + i * intervalSeconds;
  const closeAt = openAt + intervalSeconds;
  const feed = recommendedFeedPolicyFields(asset);
  const meta = {
    id: String(i + 1),
    title: `${asset} Up or Down — next hour`,
    category: "Crypto",
    description: `Paper market: will ${asset} finish higher than the Chainlink open print? Virtual USDC only; not withdrawable.`,
    outcomes: ["Up", "Down"],
    source: `Chainlink ${BASE_CHAINLINK_FEEDS[asset].description} on Base`,
    sourceUrl: `https://basescan.org/address/${feed.feed}`,
    rules: `Start/end prices are the first Chainlink AggregatorV3 rounds at/after open and close for ${feed.description} (${feed.feed}), with Base sequencer ${BASE_SEQUENCER_FEED}. Tie voids. Virtual balances only.`,
    pricePolicyHash: "0x" + "00".repeat(32), // replace after configurePricePolicy with on-chain hash
    resolutionSpec: {
      kind: "crypto",
      sourceId: `chainlink-base:${asset}`,
      maxFetchAgeSeconds: feed.maxAge,
      asset,
      intervalSeconds,
      observationToleranceSeconds: 120,
      tie: "void",
    },
  };
  return meta;
});

const config = {
  chainId: 8453,
  engine: getAddress(d.engine),
  codeHash: d.runtimeCodeHash,
  startBlock: String(d.startBlock),
  enabled: false,
  model: "feed-v1",
  maxProjectionAgeSeconds: 120,
  markets,
};

const out = path.join(path.dirname(deployPath), "virtual-trading-config.draft.json");
fs.writeFileSync(out, JSON.stringify(config, null, 2) + "\n");

const policyHints = Object.fromEntries(
  PAPER_TRADING_ASSETS.map((asset) => {
    const f = recommendedFeedPolicyFields(asset);
    return [
      asset,
      {
        ...f,
        assetBytes32: toHex(asset, { size: 32 }),
        // Conservative starter economics — owner must calibrate before public use.
        boundaryTolerance: 120,
        sigmaPpm: 50_000,
        spreadPpm: 5_000,
        impactPpm: 2_000,
        skewPpm: 5_000,
        minProbabilityPpm: 50_000,
        minSpot: 1,
        maxSpot: "100000000000000000",
        tieVoids: true,
      },
    ];
  }),
);
fs.writeFileSync(
  path.join(path.dirname(deployPath), "price-policy-hints.json"),
  JSON.stringify({ sequencer: BASE_SEQUENCER_FEED, policies: policyHints }, null, 2) + "\n",
);

console.log(
  JSON.stringify({
    wrote: out,
    engine: config.engine,
    markets: markets.map((m) => m.id + ":" + m.resolutionSpec.asset),
    enabled: false,
    note: "Copy into VIRTUAL_TRADING_CONFIG after pools+policies; set enabled:true only then. Apply supabase/migration-drafts/virtual-v1.sql on staging first.",
  }),
);
void keccak256; // keep import available for future hash helpers
