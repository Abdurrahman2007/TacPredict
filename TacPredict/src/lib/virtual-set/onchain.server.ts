/**
 * Server-only wiring for the Virtual USDC set on Base: the RPC client, the two operator wallets and their limits.
 *
 * The two private keys live ONLY in Cloudflare secrets (never in the repo, the database or a browser):
 *   VSET_KEEPER_PRIVATE_KEY      the market maker + keeper wallet (creates markets, stocks them, resolves, signs quotes)
 *   VSET_BOX_GRANTER_PRIVATE_KEY the wallet allowed to hand out the one-time welcome box
 * Each key must belong to the fixed address below, so a pasted wrong key fails loudly instead of acting as someone else.
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { base } from "viem/chains";
import { virtualConditionalPositionsAbi } from "./abi";
import { VIRTUAL_SET_ADDRESSES } from "./deployment.mjs";

export class VsetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VsetConfigError";
  }
}

export const VSET_CONTRACTS = {
  usdc: VIRTUAL_SET_ADDRESSES.usdc as Address,
  registry: VIRTUAL_SET_ADDRESSES.registry as Address,
  oracle: VIRTUAL_SET_ADDRESSES.oracle as Address,
  factory: VIRTUAL_SET_ADDRESSES.factory as Address,
  positions: VIRTUAL_SET_ADDRESSES.positions as Address,
  exchange: VIRTUAL_SET_ADDRESSES.exchange as Address,
  settlement: VIRTUAL_SET_ADDRESSES.settlement as Address,
} as const;

/** Market maker and keeper (one wallet): holds the float, creates and resolves markets, signs every quote. */
export const KEEPER_ADDRESS = "0x104305146C70de6a09c9c963d2D78e66A0807515" as Address;
/** The only wallet that may call VirtualUSDC.grantBox. */
export const BOX_GRANTER_ADDRESS = "0x01285bb2d6E9Ce78fF3B1224F2b9EF9F7AfD37E2" as Address;

/** Shares the maker puts into one market per side, and when it tops a side up. All in 6-decimal units. */
export const INVENTORY_PER_SIDE = 2_000_000_000n;
export const INVENTORY_LOW_WATER = 400_000_000n;
/** One order never moves more than this many shares, so one trade cannot drain a market. */
export const MAX_SHARES_PER_ORDER = 2_000_000_000n;
/** Allowance the maker keeps open to the contracts it uses. */
export const MAKER_ALLOWANCE = 5_000_000_000_000n;

const rpcUrl = () =>
  process.env["VSET_RPC_URL"] ||
  process.env["VIRTUAL_RPC_URL"] ||
  process.env["BASE_PROTOCOL_RPC_URL"] ||
  "https://mainnet.base.org";

function makePublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl(), { batch: true, timeout: 10_000, retryCount: 1 }),
  });
}
export type VsetPublicClient = ReturnType<typeof makePublicClient>;

let shared: VsetPublicClient | undefined;
export function publicClient(): VsetPublicClient {
  shared ??= makePublicClient();
  return shared;
}

function loadAccount(name: string, expected: Address): PrivateKeyAccount {
  const raw = process.env[name]?.trim();
  if (!raw) throw new VsetConfigError(`${name} is not configured`);
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new VsetConfigError(`${name} is not a valid private key`);
  const account = privateKeyToAccount(key);
  if (account.address.toLowerCase() !== expected.toLowerCase())
    throw new VsetConfigError(`${name} does not belong to ${expected}`);
  return account;
}

export const keeperAccount = () => loadAccount("VSET_KEEPER_PRIVATE_KEY", KEEPER_ADDRESS);
export const granterAccount = () => loadAccount("VSET_BOX_GRANTER_PRIVATE_KEY", BOX_GRANTER_ADDRESS);

export function walletClientFor(account: PrivateKeyAccount) {
  return createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl(), { timeout: 10_000, retryCount: 0 }),
  });
}

/** True when the operator secrets and the database are configured, so the app can tell "off" from "broken". */
export function vsetServerConfigured(): boolean {
  return Boolean(
    process.env["VSET_KEEPER_PRIVATE_KEY"] &&
      process.env["SUPABASE_URL"] &&
      process.env["SUPABASE_SERVICE_ROLE_KEY"],
  );
}

const tokenIds = new Map<string, bigint>();
/** ERC-1155 id of one outcome of a market (cached: it never changes). */
export async function tokenIdOf(marketId: number, outcome: 0 | 1): Promise<bigint> {
  const id = `${marketId}:${outcome}`;
  const cached = tokenIds.get(id);
  if (cached !== undefined) return cached;
  const value = await publicClient().readContract({
    address: VSET_CONTRACTS.positions,
    abi: virtualConditionalPositionsAbi,
    functionName: "tokenId",
    args: [BigInt(marketId), outcome],
  });
  tokenIds.set(id, value);
  return value;
}
