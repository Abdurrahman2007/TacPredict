/**
 * The one-time welcome box. The contract only lets the box-granter wallet call grantBox, once per wallet, and caps how
 * many boxes it hands out per day; the server only picks the random whole-dollar amount (50 to 500) and sends the
 * transaction from the granter wallet. The user pays nothing and signs nothing for the box itself.
 */
import { encodeFunctionData, getAddress, type Hex } from "viem";
import { virtualUsdcAbi } from "./abi";
import { dbError, vdb } from "./db.server";
import {
  VSET_CONTRACTS,
  granterAccount,
  publicClient,
  walletClientFor,
} from "./onchain.server";
import { boxAmount } from "./schedule.mjs";

export type BoxResult =
  | { ok: true; already: false; amount: number; txHash: Hex }
  | { ok: true; already: true; amount: number | null; txHash: null }
  | { ok: false; reason: "busy" | "closed" | "gas" | "unavailable" };

const MIN_GRANTER_ETH = 20_000_000_000_000n; // 0.00002 ETH
const inFlight = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();

/** One send at a time from the granter wallet in this server instance, so two boxes never share a nonce. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

function draw(): number {
  const [a = 0, b = 0] = crypto.getRandomValues(new Uint32Array(2));
  return boxAmount(a / 2 ** 32, b / 2 ** 32);
}

export async function grantWelcomeBox(wallet: string): Promise<BoxResult> {
  const account = getAddress(wallet);
  const key = account.toLowerCase();
  const pub = publicClient();
  const db = await vdb();

  let claimed: boolean;
  let open: boolean;
  try {
    [claimed, open] = await Promise.all([
      pub.readContract({ address: VSET_CONTRACTS.usdc, abi: virtualUsdcAbi, functionName: "boxClaimed", args: [account] }),
      pub.readContract({ address: VSET_CONTRACTS.usdc, abi: virtualUsdcAbi, functionName: "boxOpen" }),
    ]);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (claimed) {
    const { data } = await db.from("vset_boxes").select("amount").eq("account", key).maybeSingle();
    const raw = (data as { amount?: number } | null)?.amount;
    return { ok: true, already: true, amount: typeof raw === "number" ? raw / 1_000_000 : null, txHash: null };
  }
  if (!open) return { ok: false, reason: "closed" };
  if (inFlight.has(key)) return { ok: false, reason: "busy" };
  inFlight.add(key);
  try {
    const amount = draw();
    const granter = granterAccount();
    const hash = await serial(async () => {
      const [nonce, fees, balance] = await Promise.all([
        pub.getTransactionCount({ address: granter.address, blockTag: "pending" }),
        pub.estimateFeesPerGas(),
        pub.getBalance({ address: granter.address }),
      ]);
      if (balance < MIN_GRANTER_ETH) return null;
      return walletClientFor(granter).sendTransaction({
        to: VSET_CONTRACTS.usdc,
        data: encodeFunctionData({
          abi: virtualUsdcAbi,
          functionName: "grantBox",
          args: [account, BigInt(amount) * 1_000_000n],
        }),
        gas: 200_000n,
        nonce,
        maxFeePerGas: (fees.maxFeePerGas * 3n) / 2n,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        type: "eip1559",
      });
    });
    if (!hash) return { ok: false, reason: "gas" };
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 20_000 });
    if (receipt.status !== "success") return { ok: false, reason: "unavailable" };
    const { error } = await db
      .from("vset_boxes")
      .upsert(
        { account: key, amount: amount * 1_000_000, tx_hash: hash },
        { onConflict: "account", ignoreDuplicates: true },
      );
    if (error) console.error(dbError("record box", error).message);
    return { ok: true, already: false, amount, txHash: hash };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    inFlight.delete(key);
  }
}
