import { TransactionReceiptNotFoundError, formatEther, type Address, type Hex } from "viem";
import { virtualAmmAbi } from "./abi";
import { virtualRuntime } from "./runtime.server";
import { virtualDb } from "./database.server";
import { verifyTradeReceipt } from "./receipt";
import { validateResolutionSpec } from "./market-data";
import { assertFreshProjection, assertFreshChainTime, missingReceiptStatus } from "./guards";
import type { TradeIntent } from "./types";
export async function prepareVirtualTrade(
  wallet: Address,
  marketId: string,
  outcome: number,
  isBuy: boolean,
  input: string,
) {
  const r = await virtualRuntime();
  if (!r.deployment.enabled) throw Error("Virtual trading disabled");
  const meta = r.markets.find(
    (m) => m.id === marketId && outcome >= 0 && outcome < m.outcomes.length,
  );
  if (!meta) throw Error("Unknown virtual market/outcome");
  if (!meta.resolutionSpec) throw Error("Market source policy not verified; trading blocked");
  validateResolutionSpec(meta.resolutionSpec, meta.category, meta.outcomes.length);
  const { readVirtualAccount } = await import("./read.server");
  const projected = await readVirtualAccount(wallet);
  const amount = BigInt(input);
  if (amount <= 0n || amount > 18446744073709551615n) throw Error("Invalid quantity");
  const b = await r.client.getBlock({ blockTag: "latest" });
  assertFreshChainTime(
    b.timestamp,
    BigInt(Math.floor(Date.now() / 1000)),
    r.maxProjectionAgeSeconds,
  );
  const indexed = await r.client.getBlock({ blockNumber: BigInt(projected.blockNumber) });
  assertFreshProjection(indexed.timestamp, b.timestamp, r.maxProjectionAgeSeconds);
  const q = await r.client.readContract({
    address: r.deployment.engine,
    abi: virtualAmmAbi,
    functionName: isBuy ? "quoteBuy" : "quoteSell",
    args: [BigInt(marketId), outcome, amount],
    blockNumber: b.number,
  });
  const nonce = await r.client.readContract({
    address: r.deployment.engine,
    abi: virtualAmmAbi,
    functionName: "actionNonce",
    args: [wallet],
    blockNumber: b.number,
  });
  const pool = await r.client.readContract({
    address: r.deployment.engine,
    abi: virtualAmmAbi,
    functionName: "pool",
    args: [BigInt(marketId)],
    blockNumber: b.number,
  });
  if (
    meta.resolutionSpec.kind === "crypto" &&
    pool.terms.closeAt - pool.terms.openAt !== BigInt(meta.resolutionSpec.intervalSeconds)
  )
    throw Error("Invalid crypto resolution policy");
  const cash = await r.client.readContract({
    address: r.deployment.engine,
    abi: virtualAmmAbi,
    functionName: "cash",
    args: [wallet],
    blockNumber: b.number,
  });
  const position = await r.client.readContract({
    address: r.deployment.engine,
    abi: virtualAmmAbi,
    functionName: "positions",
    args: [BigInt(marketId), wallet, outcome],
    blockNumber: b.number,
  });
  const known = projected.positions.find((p) => p.marketId === marketId && p.outcome === outcome);
  if (
    cash !== BigInt(projected.balance) ||
    position[0] !== BigInt(known?.shares ?? "0") ||
    position[1] !== BigInt(known?.basis ?? "0")
  )
    throw Error("Waiting for verified virtual indexing before another trade");
  if (
    isBuy ? cash < amount || position[0] + q.output > pool.terms.maxPosition : position[0] < amount
  )
    throw Error("Insufficient virtual balance/shares or position limit");
  const deadline = b.timestamp + 120n;
  const gasUnits = await r.client.estimateContractGas({
    account: wallet,
    address: r.deployment.engine,
    abi: virtualAmmAbi,
    functionName: isBuy ? "buy" : "sell",
    args: [BigInt(marketId), outcome, amount, q.output, q.revision, deadline, nonce],
  });
  const gasPrice = await r.client.getGasPrice();
  return {
    gasUnits: gasUnits.toString(),
    executionGasEth: formatEther(gasUnits * gasPrice),
    deployment: r.deployment,
    intent: {
      wallet,
      marketId,
      outcome,
      isBuy,
      input,
      nonce: nonce.toString(),
    } satisfies TradeIntent,
    output: q.output.toString(),
    fee: q.fee.toString(),
    revision: q.revision.toString(),
    blockNumber: b.number.toString(),
    blockHash: b.hash,
    deadline: deadline.toString(),
  };
}
export async function observeVirtualTrade(hash: Hex, intent: TradeIntent) {
  const { client, deployment: d } = await virtualRuntime();
  let status: "pending" | "confirmed" | "finalized" | "reverted" | "reorged" | "invalid" =
      "pending",
    blockNumber: string | null = null,
    blockHash: string | null = null;
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase())
      throw Error("Receipt transaction hash mismatch");
    const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
    const final = await client.getBlock({ blockTag: "finalized" });
    try {
      status = verifyTradeReceipt(receipt, d.engine, intent, canonical.hash, final.number).status;
    } catch {
      status = "invalid";
    }
    blockNumber = receipt.blockNumber.toString();
    blockHash = receipt.blockHash;
  } catch (e) {
    if (!(e instanceof TransactionReceiptNotFoundError)) throw e;
    const previous = await virtualDb
      .from("virtual_transactions")
      .select("block_number,block_hash")
      .eq("deployment_id", d.id)
      .eq("tx_hash", hash)
      .eq("wallet", intent.wallet.toLowerCase())
      .maybeSingle();
    if (previous.error) throw Error("Prior transaction evidence unavailable");
    status = missingReceiptStatus(previous.data);
    blockNumber = previous.data?.block_number ?? null;
    blockHash = previous.data?.block_hash ?? null;
  }
  const saved = await virtualDb.from("virtual_transactions").upsert(
    {
      deployment_id: d.id,
      tx_hash: hash,
      wallet: intent.wallet.toLowerCase(),
      status,
      intent,
      block_number: blockNumber,
      block_hash: blockHash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "deployment_id,tx_hash,wallet" },
  );
  if (saved.error)
    throw Error("Transaction observation storage unavailable; trade state must be reconciled");
  return { hash, status, blockNumber };
}
