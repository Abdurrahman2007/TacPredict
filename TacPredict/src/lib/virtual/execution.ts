import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import type { WalletState } from "@/lib/onchain/wallet";
import { virtualAmmAbi } from "./abi";
import { verifyTradeReceipt } from "./receipt";
import type { VirtualDeployment, TradeIntent } from "./types";
export type PreparedTrade = {
  deployment: VirtualDeployment;
  intent: TradeIntent;
  output: string;
  fee: string;
  revision: string;
  deadline: string;
  blockNumber: string;
  blockHash: Hex;
};
const pending = new Map<string, Hex | null>();
const key = (d: VirtualDeployment, w: string) => `${d.id}:${w.toLowerCase()}`;
export function reconciledVirtualTransaction(
  d: VirtualDeployment,
  w: string,
  hash: Hex,
  status: string,
) {
  if (status !== "pending" && pending.get(key(d, w)) === hash) pending.delete(key(d, w));
}
export async function executeVirtualTrade(
  w: WalletState,
  q: PreparedTrade,
  minOut: bigint,
  onSubmitted: (hash: Hex) => void,
) {
  const d = q.deployment,
    k = key(d, q.intent.wallet);
  if (pending.has(k))
    throw Error("Reconcile your pending virtual transaction before another trade");
  if (
    !d.enabled ||
    !w.provider ||
    !w.address ||
    w.address.toLowerCase() !== q.intent.wallet.toLowerCase() ||
    w.chainId !== d.chainId ||
    minOut <= 0n ||
    minOut > BigInt(q.output)
  )
    throw Error("Wallet, network, quote or minimum output unavailable");
  pending.set(k, null);
  let hash: Hex | undefined;
  try {
    const chain =
      d.chainId === 8453
        ? base
        : d.chainId === 84532
          ? baseSepolia
          : defineChain({
              id: 31337,
              name: "Local test",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: { default: { http: [] } },
            });
    const pub = createPublicClient({ chain, transport: custom(w.provider) });
    if ((await pub.getChainId()) !== d.chainId)
      throw Error("Switch to the configured virtual market network");
    const code = await pub.getBytecode({ address: d.engine });
    if (!code || keccak256(code).toLowerCase() !== d.codeHash.toLowerCase())
      throw Error("Virtual contract code mismatch");
    const account = w.address as Address;
    const { request } = await pub.simulateContract({
      account,
      address: d.engine,
      abi: virtualAmmAbi,
      functionName: q.intent.isBuy ? "buy" : "sell",
      args: [
        BigInt(q.intent.marketId),
        q.intent.outcome,
        BigInt(q.intent.input),
        minOut,
        BigInt(q.revision),
        BigInt(q.deadline),
        BigInt(q.intent.nonce),
      ],
    });
    const wallet = createWalletClient({ chain, account, transport: custom(w.provider) });
    hash = await wallet.writeContract(request);
    pending.set(k, hash);
    onSubmitted(hash);
    const receipt = await pub.waitForTransactionReceipt({
      hash,
      timeout: 120000,
      onReplaced: (r) => {
        hash = r.transaction.hash;
        pending.set(k, hash);
        onSubmitted(hash);
      },
    });
    const canonical = await pub.getBlock({ blockNumber: receipt.blockNumber });
    const result = verifyTradeReceipt(receipt, d.engine, q.intent, canonical.hash, -1n); // finality is verified by the server/indexer, never guessed
    if (result.status !== "confirmed") throw Error(`Virtual transaction ${result.status}`);
    pending.delete(k);
    return { hash: receipt.transactionHash, status: result.status };
  } catch (e) {
    if (!hash) pending.delete(k);
    throw e;
  }
}
