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
import {
  browserPending,
  clearPending,
  isExplicitWalletRejection,
  notifyPending,
  pendingKey,
  writePending,
} from "./pending";
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
const key = (d: VirtualDeployment, w: string) => pendingKey(d, w);
export function reconciledVirtualTransaction(
  d: VirtualDeployment,
  w: string,
  hash: Hex,
  status: string,
) {
  if (clearPending(window.localStorage, d, w, hash, status)) {
    pending.delete(key(d, w));
    notifyPending();
  }
}
export async function executeVirtualTrade(
  w: WalletState,
  q: PreparedTrade,
  minOut: bigint,
  onSubmitted: (hash: Hex) => void,
) {
  if (typeof navigator === "undefined" || !navigator.locks)
    throw Error("This browser cannot safely coordinate virtual transactions");
  return navigator.locks.request(
    pendingKey(q.deployment, q.intent.wallet),
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw Error("A virtual transaction is already active in another tab");
      return executeLocked(w, q, minOut, onSubmitted);
    },
  );
}
async function executeLocked(
  w: WalletState,
  q: PreparedTrade,
  minOut: bigint,
  onSubmitted: (hash: Hex) => void,
) {
  const d = q.deployment,
    k = key(d, q.intent.wallet);
  if (pending.has(k) || browserPending(d, q.intent.wallet))
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
  let sendAttempted = false;
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
    // Persist before the wallet prompt. An ambiguous RPC failure must not permit a blind retry.
    writePending(window.localStorage, d, { hash: null, intent: q.intent });
    notifyPending();
    sendAttempted = true;
    hash = await wallet.writeContract(request);
    writePending(window.localStorage, d, { hash, intent: q.intent });
    notifyPending();
    pending.set(k, hash);
    onSubmitted(hash);
    const receipt = await pub.waitForTransactionReceipt({
      hash,
      timeout: 120000,
      onReplaced: (r) => {
        hash = r.transaction.hash;
        writePending(window.localStorage, d, { hash, intent: q.intent });
        notifyPending();
        pending.set(k, hash);
        onSubmitted(hash);
      },
    });
    const canonical = await pub.getBlock({ blockNumber: receipt.blockNumber });
    const result = verifyTradeReceipt(receipt, d.engine, q.intent, canonical.hash, -1n); // finality is verified by the server/indexer, never guessed
    if (result.status !== "confirmed") throw Error(`Virtual transaction ${result.status}`);
    reconciledVirtualTransaction(d, q.intent.wallet, receipt.transactionHash, result.status);
    return { hash: receipt.transactionHash, status: result.status };
  } catch (e) {
    if (!sendAttempted || (!hash && isExplicitWalletRejection(e))) {
      if (sendAttempted) {
        window.localStorage.removeItem(k);
        notifyPending();
      }
      pending.delete(k);
    }
    // Unknown send failures, invalid replacements and reorgs stay locked for reconciliation.
    throw e;
  }
}
