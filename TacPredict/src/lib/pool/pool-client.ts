import { rejectRealAssetTrading } from "@/lib/virtual/product-policy";
import {
  createPublicClient,
  createWalletClient,
  custom,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import type { WalletState } from "@/lib/onchain/wallet";
import { BASE_NETWORK } from "@/lib/onchain/base";
import { ERC20_ABI_TEXT, POOL_ABI_TEXT } from "./abi";
import { durationSeconds, poolAssetId, poolErrorMessage, type PoolAsset } from "./pool.mjs";

const poolAbi = parseAbi(POOL_ABI_TEXT);
const erc20Abi = parseAbi(ERC20_ABI_TEXT);
const USDC = BASE_NETWORK.usdc as Address;

export type RoundRef = { asset: string; minutes: number; startMs: number };
const args = (r: RoundRef) =>
  [
    poolAssetId(r.asset) ?? 0,
    durationSeconds(r.minutes),
    BigInt(Math.floor(r.startMs / 1000)),
  ] as const;

async function clients(w: WalletState) {
  rejectRealAssetTrading();
  if (!w.provider || !w.address) throw Error("Connect your wallet first.");
  const pub = createPublicClient({ chain: base, transport: custom(w.provider) });
  if ((await pub.getChainId()) !== BASE_NETWORK.id) throw Error("Switch your wallet to Base.");
  const account = w.address as Address;
  return {
    pub,
    account,
    wallet: createWalletClient({ chain: base, account, transport: custom(w.provider) }),
  };
}

/** Approves exactly the bet amount if needed, then places the bet. Returns the bet transaction hash. */
export async function placePoolBet(
  w: WalletState,
  pool: Address,
  round: RoundRef,
  side: "up" | "down",
  amount: bigint,
  onStep?: (step: "approve" | "bet") => void,
): Promise<Hex> {
  try {
    const { pub, wallet, account } = await clients(w);
    const balance = await pub.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    if (balance < amount) throw Error("Not enough USDC in your wallet.");
    const allowance = await pub.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, pool],
    });
    if (allowance < amount) {
      onStep?.("approve");
      const approve = await pub.simulateContract({
        account,
        address: USDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [pool, amount],
      });
      const approval = await wallet.writeContract(approve.request);
      if ((await pub.waitForTransactionReceipt({ hash: approval })).status !== "success")
        throw Error("USDC approval failed.");
    }
    onStep?.("bet");
    const bet = await pub.simulateContract({
      account,
      address: pool,
      abi: poolAbi,
      functionName: "bet",
      args: [...args(round), side === "up", amount],
    });
    const hash = await wallet.writeContract(bet.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("The bet was not accepted.");
    return hash;
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Connect|Switch|Not enough|USDC approval failed|The bet was)/.test(error.message)
    )
      throw error;
    throw Error(poolErrorMessage(error));
  }
}

/** Pays the winnings, or refunds the full stake if the round was voided. */
export async function claimPoolRound(w: WalletState, pool: Address, round: RoundRef): Promise<Hex> {
  try {
    const { pub, wallet, account } = await clients(w);
    const sim = await pub.simulateContract({
      account,
      address: pool,
      abi: poolAbi,
      functionName: "claim",
      args: args(round),
    });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("The claim was not accepted.");
    return hash;
  } catch (error) {
    if (error instanceof Error && /^(Connect|Switch|The claim)/.test(error.message)) throw error;
    throw Error(poolErrorMessage(error));
  }
}

/** Anyone can start the refund of a round whose price reading never arrived. */
export async function refundMissedReading(
  w: WalletState,
  pool: Address,
  round: RoundRef,
): Promise<Hex> {
  try {
    const { pub, wallet, account } = await clients(w);
    const sim = await pub.simulateContract({
      account,
      address: pool,
      abi: poolAbi,
      functionName: "voidUnreported",
      args: args(round),
    });
    const hash = await wallet.writeContract(sim.request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("The refund was not accepted.");
    return hash;
  } catch (error) {
    if (error instanceof Error && /^(Connect|Switch|The refund)/.test(error.message)) throw error;
    throw Error(poolErrorMessage(error));
  }
}
