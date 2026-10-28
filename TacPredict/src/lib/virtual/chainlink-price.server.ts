import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { base } from "viem/chains";
import {
  BASE_CHAINLINK_FEEDS,
  BASE_SEQUENCER_FEED,
  effectiveOracleMaxAgeSeconds,
  isChainlinkAsset,
  type ChainlinkAsset,
} from "./chainlink-feeds";
import type { metadataSchema } from "./runtime.server";
import type { z } from "zod";

/** Minimal AggregatorV3Interface — decimals + latestRoundData only. */
export const aggregatorV3Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

export type ChainlinkSpot = {
  asset: ChainlinkAsset;
  feed: Address;
  decimals: number;
  roundId: bigint;
  answer: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
  ageSeconds: number;
  maxAgeSeconds: number;
};

type ReadClient = Pick<PublicClient, "readContract">;

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Server RPC for oracle reads. Prefer VIRTUAL_RPC_URL (Ankr); fall back to BASE_PROTOCOL_RPC_URL.
 * Never invent prices when RPC is missing.
 */
export function oracleRpcUrl(): string {
  const url = process.env["VIRTUAL_RPC_URL"] || process.env["BASE_PROTOCOL_RPC_URL"];
  if (!url) throw Error("Virtual RPC unavailable");
  return url;
}

export function createOracleClient(rpcUrl = oracleRpcUrl()) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl, { timeout: 15000, retryCount: 1 }),
  });
}

/** Match VirtualPriceAMM._sequencer: answer must be 0 (up) and recovery grace > 1h. */
export async function assertSequencerUp(client: ReadClient, observedAt = nowSeconds()) {
  const [roundId, answer, since, updated, answered] = await client.readContract({
    address: BASE_SEQUENCER_FEED,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData",
  });
  if (
    roundId === 0n ||
    answered < roundId ||
    answer !== 0n ||
    since === 0n ||
    updated === 0n ||
    updated > observedAt ||
    since > observedAt ||
    observedAt - since <= 3600n
  )
    throw Error("Chainlink sequencer feed is down or still in recovery; trading blocked.");
}

/**
 * Fail-closed spot read. Rejects non-positive, incomplete rounds, future timestamps,
 * and answers older than maxAgeSeconds.
 */
export async function readFreshChainlinkSpot(
  client: ReadClient,
  asset: ChainlinkAsset,
  maxAgeSeconds: number,
  observedAt = nowSeconds(),
): Promise<ChainlinkSpot> {
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 3600)
    throw Error("Invalid oracle freshness policy");
  const feed = BASE_CHAINLINK_FEEDS[asset];
  const [decimals, round] = await Promise.all([
    client.readContract({
      address: feed.address,
      abi: aggregatorV3Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: feed.address,
      abi: aggregatorV3Abi,
      functionName: "latestRoundData",
    }),
  ]);
  const [roundId, answer, , updatedAt, answeredInRound] = round;
  if (
    decimals !== feed.decimals ||
    roundId === 0n ||
    answeredInRound < roundId ||
    answer <= 0n ||
    updatedAt === 0n ||
    updatedAt > observedAt ||
    observedAt - updatedAt > BigInt(maxAgeSeconds)
  )
    throw Error("Chainlink price is stale or invalid; quote rejected.");
  return {
    asset,
    feed: feed.address,
    decimals,
    roundId,
    answer,
    updatedAt,
    answeredInRound,
    ageSeconds: Number(observedAt - updatedAt),
    maxAgeSeconds,
  };
}

/** Sequencer + asset spot — required before an executable feed-v1 quote. */
export async function assertExecutableChainlinkOracle(
  client: ReadClient,
  asset: ChainlinkAsset,
  maxAgeSeconds: number,
  observedAt = nowSeconds(),
): Promise<ChainlinkSpot> {
  await assertSequencerUp(client, observedAt);
  return readFreshChainlinkSpot(client, asset, maxAgeSeconds, observedAt);
}

/**
 * Enforce oracle freshness for a published virtual market before quote/trade.
 * Sports / unknown assets fail closed (no Coinbase/chart fallback).
 */
export async function assertMarketOracleFresh(
  client: ReadClient,
  meta: z.infer<typeof metadataSchema>,
  observedAt = nowSeconds(),
): Promise<ChainlinkSpot> {
  const spec = meta.resolutionSpec;
  if (!spec || spec.kind !== "crypto")
    throw Error("Feed-priced binary market policy required");
  if (!isChainlinkAsset(spec.asset))
    throw Error("Chainlink feed is not configured for this asset; trading blocked.");
  const maxAge = effectiveOracleMaxAgeSeconds(spec.asset, spec.maxFetchAgeSeconds);
  return assertExecutableChainlinkOracle(client, spec.asset, maxAge, observedAt);
}
