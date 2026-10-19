import { createPublicClient, http, keccak256, parseAbi, stringToHex, type Address } from "viem";
import { base } from "viem/chains";
import { ERC20_ABI_TEXT, POOL_ABI_TEXT } from "./abi";
import { configuredPoolAddress } from "./deployment";
import { POOL_ASSET_KEYS, durationSeconds, POOL_DURATIONS, poolAssetId, type PoolAsset } from "./pool.mjs";

export const poolAbi = parseAbi(POOL_ABI_TEXT);
export const erc20Abi = parseAbi(ERC20_ABI_TEXT);

import type { PoolConfig, PoolPosition, PoolRound } from "./pool-types";
export type { PoolConfig, PoolPosition, PoolRound };
export type RecentPosition = PoolPosition & { asset: PoolAsset; minutes: number; start: number };

function client() {
  return createPublicClient({
    chain: base,
    transport: http(process.env["BASE_PROTOCOL_RPC_URL"] || "https://mainnet.base.org", {
      timeout: 8000,
      retryCount: 1,
    }),
  });
}

const saved = new Map<string, { expires: number; value: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = saved.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  saved.set(key, { expires: Date.now() + ttl, value });
  return value;
}

export async function poolConfig(): Promise<PoolConfig> {
  const address = configuredPoolAddress();
  const empty: PoolConfig = {
    address: null,
    feeBps: 0,
    minBet: "0",
    maxPerUser: "0",
    maxPool: "0",
    paused: false,
    ownerBalance: "0",
    treasury: "",
    series: {},
  };
  if (!address) return empty;
  return cached(`config:${address}`, 4000, async () => {
    const pub = client();
    const pairs = POOL_ASSET_KEYS.flatMap((asset) => POOL_DURATIONS.map((minutes) => ({ asset, minutes })));
    const [feeBps, minBet, maxPerUser, maxPool, paused, ownerBalance, treasury] = await pub.multicall({
      allowFailure: false,
      contracts: [
        { address, abi: poolAbi, functionName: "feeBps" },
        { address, abi: poolAbi, functionName: "minBet" },
        { address, abi: poolAbi, functionName: "maxPerUser" },
        { address, abi: poolAbi, functionName: "maxPoolPerWindow" },
        { address, abi: poolAbi, functionName: "bettingPaused" },
        { address, abi: poolAbi, functionName: "ownerBalance" },
        { address, abi: poolAbi, functionName: "treasury" },
      ],
    });
    const enabled = await pub.multicall({
      allowFailure: false,
      contracts: pairs.map(({ asset, minutes }) => ({
        address,
        abi: poolAbi,
        functionName: "seriesEnabled" as const,
        args: [poolAssetId(asset) ?? 0, durationSeconds(minutes)] as const,
      })),
    });
    return {
      address,
      feeBps: Number(feeBps),
      minBet: String(minBet),
      maxPerUser: String(maxPerUser),
      maxPool: String(maxPool),
      paused: Boolean(paused),
      ownerBalance: String(ownerBalance),
      treasury: String(treasury),
      series: Object.fromEntries(pairs.map(({ asset, minutes }, i) => [`${asset}:${minutes}`, Boolean(enabled[i])])),
    };
  });
}

function roundArgs(asset: PoolAsset, minutes: number, startMs: number) {
  return [poolAssetId(asset) ?? 0, durationSeconds(minutes), BigInt(Math.floor(startMs / 1000))] as const;
}

export async function poolRound(asset: PoolAsset, minutes: number, startMs: number): Promise<PoolRound | null> {
  const address = configuredPoolAddress();
  if (!address) return null;
  return cached(`round:${address}:${asset}:${minutes}:${startMs}`, 3000, async () => {
    const w = await client().readContract({
      address,
      abi: poolAbi,
      functionName: "getWindow",
      args: roundArgs(asset, minutes, startMs),
    });
    return {
      up: String(w.upPool),
      down: String(w.downPool),
      feeBps: Number(w.feeBps),
      state: Number(w.state),
      result: Number(w.result),
      startPrice: String(w.startPrice),
      endPrice: String(w.endPrice),
      startObservedAt: Number(w.startObservedAt),
      endObservedAt: Number(w.endObservedAt),
      claimOpensAt: Number(w.claimOpensAt),
    };
  });
}

export async function poolPosition(
  asset: PoolAsset,
  minutes: number,
  startMs: number,
  user: Address,
): Promise<PoolPosition | null> {
  const address = configuredPoolAddress();
  if (!address) return null;
  const args = roundArgs(asset, minutes, startMs);
  const [position, preview] = await client().multicall({
    allowFailure: false,
    contracts: [
      { address, abi: poolAbi, functionName: "getPosition", args: [...args, user] },
      { address, abi: poolAbi, functionName: "previewClaim", args: [...args, user] },
    ],
  });
  return {
    up: String(position.up),
    down: String(position.down),
    claimed: position.claimed,
    payout: String(preview[0]),
    refund: preview[1],
    ready: preview[2],
  };
}

/** How many recent rounds per series the portfolio checks for a user's open positions. */
const LOOKBACK: Record<number, number> = { 5: 24, 15: 12, 720: 6, 1440: 7 };
export async function poolRecentPositions(user: Address, nowMs: number): Promise<RecentPosition[]> {
  const address = configuredPoolAddress();
  if (!address) return [];
  const targets: { asset: PoolAsset; minutes: number; start: number }[] = [];
  for (const asset of POOL_ASSET_KEYS)
    for (const minutes of POOL_DURATIONS) {
      const size = minutes * 60000;
      const current = Math.floor(nowMs / size) * size;
      for (let i = -(LOOKBACK[minutes] ?? 6); i <= 1; i += 1) targets.push({ asset, minutes, start: current + i * size });
    }
  const pub = client();
  const positions = await pub.multicall({
    allowFailure: false,
    contracts: targets.map((t) => ({
      address,
      abi: poolAbi,
      functionName: "getPosition" as const,
      args: [...roundArgs(t.asset, t.minutes, t.start), user] as const,
    })),
  });
  const held = targets
    .map((t, i) => ({ t, p: positions[i]! }))
    .filter(({ p }) => p.up > 0n || p.down > 0n);
  if (!held.length) return [];
  const previews = await pub.multicall({
    allowFailure: false,
    contracts: held.map(({ t }) => ({
      address,
      abi: poolAbi,
      functionName: "previewClaim" as const,
      args: [...roundArgs(t.asset, t.minutes, t.start), user] as const,
    })),
  });
  return held.map(({ t, p }, i) => ({
    ...t,
    up: String(p.up),
    down: String(p.down),
    claimed: p.claimed,
    payout: String(previews[i]![0]),
    refund: previews[i]![1],
    ready: previews[i]![2],
  }));
}

export type PoolRoleStatus = { isReporter: boolean; isAdmin: boolean; isGuardian: boolean; ethBalance: string };
const role = (name: string) => keccak256(stringToHex(name));
export async function poolRoleStatus(who: Address): Promise<PoolRoleStatus | null> {
  const address = configuredPoolAddress();
  if (!address) return null;
  const pub = client();
  const [isReporter, isAdmin, isGuardian, balance] = await Promise.all([
    pub.readContract({ address, abi: poolAbi, functionName: "hasRole", args: [role("REPORTER_ROLE"), who] }),
    pub.readContract({ address, abi: poolAbi, functionName: "hasRole", args: [`0x${"00".repeat(32)}`, who] }),
    pub.readContract({ address, abi: poolAbi, functionName: "hasRole", args: [role("GUARDIAN_ROLE"), who] }),
    pub.getBalance({ address: who }),
  ]);
  return { isReporter, isAdmin, isGuardian, ethBalance: String(balance) };
}
