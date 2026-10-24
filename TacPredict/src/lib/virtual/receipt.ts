import { decodeEventLog, type Hex, type TransactionReceipt } from "viem";
import { virtualAmmAbi } from "./abi";
import type { TradeIntent, VirtualEvent } from "./types";
const economicEvents = new Set([
  "VirtualGrant",
  "TradeExecuted",
  "PositionSettled",
  "PoolCreated",
  "ResultFinalized",
  "ResultProposed",
  "ResultChallenged",
  "TradingPauseChanged",
  "CampaignConfigured",
]);
export function decodeVirtualEvents(receipt: TransactionReceipt, engine: Hex): VirtualEvent[] {
  if (receipt.status !== "success") return [];
  const events: VirtualEvent[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== engine.toLowerCase()) continue;
    const event = decodeEventLog({
      abi: virtualAmmAbi,
      data: log.data,
      topics: log.topics,
      strict: true,
    });
    if (!economicEvents.has(event.eventName)) continue;
    const raw = event.args as unknown as Record<string, unknown>;
    // Pool terms are recorded by their frozen onchain getter, not used as client-controlled accounting.
    const args = Object.fromEntries(
      Object.entries(raw)
        .filter(([k]) => k !== "terms")
        .map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
    ) as VirtualEvent["args"];
    events.push({
      name: event.eventName,
      args,
      wallet: typeof args["wallet"] === "string" ? args["wallet"].toLowerCase() : null,
      marketId: typeof args["marketId"] === "string" ? args["marketId"] : null,
      txHash: receipt.transactionHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber.toString(),
      logIndex: log.logIndex,
    });
  }
  if (events.filter((e) => e.name === "TradeExecuted").length > 1)
    throw Error("Multiple virtual trades in one transaction");
  return events;
}
export function verifyTradeReceipt(
  receipt: TransactionReceipt,
  engine: Hex,
  expected: TradeIntent,
  canonicalHash: Hex,
  finalizedBlock: bigint,
) {
  if (receipt.blockHash.toLowerCase() !== canonicalHash.toLowerCase())
    return { status: "reorged" as const, events: [] };
  if (receipt.status !== "success") return { status: "reverted" as const, events: [] };
  const events = decodeVirtualEvents(receipt, engine);
  const trades = events.filter((e) => e.name === "TradeExecuted");
  const t = trades[0];
  if (
    trades.length !== 1 ||
    !t ||
    t.wallet !== expected.wallet.toLowerCase() ||
    t.marketId !== expected.marketId ||
    Number(t.args["outcome"]) !== expected.outcome ||
    t.args["isBuy"] !== expected.isBuy ||
    t.args["input"] !== expected.input ||
    t.args["nonce"] !== expected.nonce ||
    BigInt(String(t.args["output"])) <= 0n
  )
    throw Error("Missing or mismatched virtual trade event");
  return {
    status: receipt.blockNumber <= finalizedBlock ? ("finalized" as const) : ("confirmed" as const),
    events,
  };
}
export function projectWalletEvents(events: VirtualEvent[], wallet: string) {
  let cash = 0n,
    realized = 0n;
  const positions = new Map<
    string,
    { marketId: string; outcome: number; shares: string; basis: string }
  >();
  const seen = new Set<string>();
  const transactions = new Set<string>();
  const settled = new Set<string>();
  const ordered = [...events].sort((a, b) =>
    BigInt(a.blockNumber) < BigInt(b.blockNumber)
      ? -1
      : BigInt(a.blockNumber) > BigInt(b.blockNumber)
        ? 1
        : a.logIndex - b.logIndex,
  );
  const trades: VirtualEvent[] = [];
  for (const e of ordered) {
    if (e.wallet !== wallet.toLowerCase()) throw Error("Wallet projection isolation violation");
    const key = `${e.blockHash}:${e.txHash}:${e.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.name === "VirtualGrant") cash += BigInt(String(e.args["amount"]));
    else if (e.name === "TradeExecuted") {
      if (transactions.has(e.txHash)) throw Error("Duplicate trade transaction");
      transactions.add(e.txHash);
      if (!e.marketId || settled.has(e.marketId)) throw Error("Trade after settlement");
      const input = BigInt(String(e.args["input"])),
        output = BigInt(String(e.args["output"]));
      cash += e.args["isBuy"] ? -input : output;
      realized += BigInt(String(e.args["realizedPnlDelta"]));
      positions.set(`${e.marketId}:${e.args["outcome"]}`, {
        marketId: e.marketId,
        outcome: Number(e.args["outcome"]),
        shares: String(e.args["remainingShares"]),
        basis: String(e.args["remainingBasis"]),
      });
      trades.push(e);
    } else if (e.name === "PositionSettled") {
      if (!e.marketId || settled.has(e.marketId)) throw Error("Duplicate settlement");
      settled.add(e.marketId);
      cash += BigInt(String(e.args["payout"]));
      realized += BigInt(String(e.args["realizedPnlDelta"]));
      for (const [key, p] of positions)
        if (p.marketId === e.marketId) positions.set(key, { ...p, shares: "0", basis: "0" });
    }
    if (cash < 0n) throw Error("Incomplete event history: negative virtual balance");
    if (e.args["cashAfter"] !== undefined && cash !== BigInt(String(e.args["cashAfter"])))
      throw Error("Virtual cash reconciliation mismatch");
  }
  return {
    balance: cash.toString(),
    realizedPnl: realized.toString(),
    positions: [...positions.values()],
    trades,
  };
}
