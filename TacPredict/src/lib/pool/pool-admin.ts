import {
  concat,
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  getCreate2Address,
  keccak256,
  parseAbi,
  parseAbiParameters,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import type { WalletState } from "@/lib/onchain/wallet";
import { BASE_NETWORK } from "@/lib/onchain/base";
import { POOL_ABI_TEXT } from "./abi";
import { POOL_CREATION_BYTECODE } from "./artifact";
import { durationSeconds, poolAssetId, poolErrorMessage, type PoolAsset } from "./pool.mjs";

const poolAbi = parseAbi(POOL_ABI_TEXT);
/** The public deterministic deployment proxy; the existing TacPredict contracts were deployed through it too. */
export const CREATE2_PROXY: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
export const REPORTER_ROLE: Hex = keccak256(stringToHex("REPORTER_ROLE"));
export const GUARDIAN_ROLE: Hex = keccak256(stringToHex("GUARDIAN_ROLE"));

export const poolBytecodeReady = () => /^0x[0-9a-fA-F]{2,}$/.test(POOL_CREATION_BYTECODE) || /^[0-9a-fA-F]{2,}$/.test(POOL_CREATION_BYTECODE);
const initBytecode = (): Hex => (POOL_CREATION_BYTECODE.startsWith("0x") ? POOL_CREATION_BYTECODE : `0x${POOL_CREATION_BYTECODE}`) as Hex;

async function ctx(w: WalletState) {
  if (!w.provider || !w.address) throw Error("Connect the administrator wallet first.");
  const pub = createPublicClient({ chain: base, transport: custom(w.provider) });
  if ((await pub.getChainId()) !== BASE_NETWORK.id) throw Error("Switch your wallet to Base.");
  const account = w.address as Address;
  return { pub, account, wallet: createWalletClient({ chain: base, account, transport: custom(w.provider) }) };
}
const friendly = (error: unknown) => {
  if (error instanceof Error && /^(Connect|Switch|Deploy|Enter|The contract|That)/.test(error.message)) return error;
  const text = poolErrorMessage(error);
  const extra = /AccessControlUnauthorizedAccount|missing role|0xe2517d3f/i.test(
    [(error as { shortMessage?: string })?.shortMessage, (error as Error)?.message].join(" "),
  );
  return Error(extra ? "This wallet does not hold the role the contract needs for that action." : text);
};

/** Deterministic address for these constructor values. The same values always give the same address. */
export function predictPoolDeployment(admin: Address, treasury: Address, feeBps: number) {
  if (!poolBytecodeReady()) throw Error("The contract bytecode is not packaged in this build yet.");
  const args = encodeAbiParameters(parseAbiParameters("address admin,address usdc,address treasury,uint256 feeBps"), [
    admin,
    BASE_NETWORK.usdc as Address,
    treasury,
    BigInt(feeBps),
  ]);
  const initCode = concat([initBytecode(), args]);
  const salt = keccak256(stringToHex(`tacpredict.updown-pool.v1|${admin.toLowerCase()}|${treasury.toLowerCase()}|${feeBps}`));
  return { salt, initCode, address: getCreate2Address({ from: CREATE2_PROXY, salt, bytecode: initCode }) };
}

/** Deploys UpDownPool through the deterministic proxy. The connected wallet becomes the pool admin. */
export async function deployPool(w: WalletState, treasury: Address, feeBps: number): Promise<{ hash: Hex; address: Address }> {
  try {
    const { pub, wallet, account } = await ctx(w);
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw Error("That fee is not allowed. Use 0% to 10%.");
    const plan = predictPoolDeployment(account, treasury, feeBps);
    const existing = await pub.getCode({ address: plan.address });
    if (existing && existing !== "0x") throw Error(`That contract is already deployed at ${plan.address}.`);
    const proxy = await pub.getCode({ address: CREATE2_PROXY });
    if (!proxy || proxy === "0x") throw Error("The deployment proxy is not available on this network.");
    const hash = await wallet.sendTransaction({ to: CREATE2_PROXY, data: concat([plan.salt, plan.initCode]) });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw Error("The deployment transaction failed.");
    const code = await pub.getCode({ address: plan.address });
    if (!code || code === "0x") throw Error("The deployment transaction succeeded but no contract was created.");
    return { hash, address: plan.address };
  } catch (error) {
    if (error instanceof Error && /^(That|Connect|Switch|The deployment|The contract|Deploy|Enter)/.test(error.message)) throw error;
    throw friendly(error);
  }
}

export async function setSeriesTx(w: WalletState, pool: Address, asset: PoolAsset, minutes: number, enabled: boolean): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({
      account,
      address: pool,
      abi: poolAbi,
      functionName: "setSeries",
      args: [poolAssetId(asset) ?? 0, durationSeconds(minutes), enabled],
    });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
export async function setFeeTx(w: WalletState, pool: Address, feeBps: number): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({ account, address: pool, abi: poolAbi, functionName: "setFee", args: [BigInt(feeBps)] });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
export async function setLimitsTx(w: WalletState, pool: Address, min: bigint, perUser: bigint, perPool: bigint): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({ account, address: pool, abi: poolAbi, functionName: "setLimits", args: [min, perUser, perPool] });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
export async function setTreasuryTx(w: WalletState, pool: Address, treasury: Address): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({ account, address: pool, abi: poolAbi, functionName: "setTreasury", args: [treasury] });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
export async function pauseTx(w: WalletState, pool: Address, paused: boolean): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({ account, address: pool, abi: poolAbi, functionName: "setBettingPaused", args: [paused] });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
export async function reporterRoleTx(w: WalletState, pool: Address, reporter: Address, grant: boolean): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({
      account,
      address: pool,
      abi: poolAbi,
      functionName: grant ? "grantRole" : "revokeRole",
      args: [REPORTER_ROLE, reporter],
    });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
/** Refund control: returns every stake of a round, only before payouts open. Never pays anyone more than they bet. */
export async function voidRoundTx(w: WalletState, pool: Address, asset: PoolAsset, minutes: number, startMs: number, reason: string): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({
      account,
      address: pool,
      abi: poolAbi,
      functionName: "voidWindow",
      args: [poolAssetId(asset) ?? 0, durationSeconds(minutes), BigInt(Math.floor(startMs / 1000)), keccak256(stringToHex(reason || "guardian"))],
    });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
/** Sends collected fees and rounding dust to the treasury. Anyone can call it. */
export async function withdrawFeesTx(w: WalletState, pool: Address): Promise<Hex> {
  try {
    const { pub, wallet, account } = await ctx(w);
    const sim = await pub.simulateContract({ account, address: pool, abi: poolAbi, functionName: "withdrawOwnerBalance" });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success") throw Error("The contract did not accept the change.");
    return hash;
  } catch (error) {
    throw friendly(error);
  }
}
