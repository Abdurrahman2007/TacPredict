/**
 * Fills: every trade the maker wallet takes part in is a TradeExecuted event on the Exchange. Both the keeper's scan
 * and the "I just traded" confirmation turn those events into rows of vset_fills (cost basis and history), and both
 * read them straight from the chain, so a row can never be invented by a caller.
 */
import { getAbiItem, isHex, parseEventLogs, type Hex } from "viem";
import { virtualExchangeAbi } from "./abi";
import { dbError, vdb, type FillRow } from "./db.server";
import { KEEPER_ADDRESS, VSET_CONTRACTS, publicClient } from "./onchain.server";

export const tradeExecutedEvent = getAbiItem({ abi: virtualExchangeAbi, name: "TradeExecuted" });

type TradeLog = {
  args: {
    buyer?: string | undefined;
    seller?: string | undefined;
    marketId?: bigint | undefined;
    outcome?: number | undefined;
    price?: bigint | undefined;
    shares?: bigint | undefined;
    usdcAmount?: bigint | undefined;
  };
  logIndex: number | null;
  transactionHash: string | null;
  blockNumber: bigint | null;
};

/** Rows for the trades in `logs` that have the maker on exactly one side (that is every trade a user makes here). */
export function fillRowsFromLogs(
  logs: readonly TradeLog[],
  keyOf: ReadonlyMap<number, string>,
): Omit<FillRow, "created_at">[] {
  const me = KEEPER_ADDRESS.toLowerCase();
  return logs.flatMap((log) => {
    const { buyer, seller, marketId, outcome, price, shares, usdcAmount } = log.args;
    if (
      buyer === undefined ||
      seller === undefined ||
      marketId === undefined ||
      outcome === undefined ||
      price === undefined ||
      shares === undefined ||
      usdcAmount === undefined ||
      log.logIndex === null ||
      log.transactionHash === null ||
      log.blockNumber === null
    )
      return [];
    const buyerIsMaker = buyer.toLowerCase() === me;
    const sellerIsMaker = seller.toLowerCase() === me;
    if (buyerIsMaker === sellerIsMaker) return [];
    return [
      {
        tx_hash: log.transactionHash,
        log_index: log.logIndex,
        market_id: Number(marketId),
        market_key: keyOf.get(Number(marketId)) ?? null,
        account: (buyerIsMaker ? seller : buyer).toLowerCase(),
        side: (buyerIsMaker ? "sell" : "buy") as "buy" | "sell",
        outcome: Number(outcome),
        price_ppm: Number(price),
        shares: Number(shares),
        usdc: Number(usdcAmount),
        block_number: Number(log.blockNumber),
      },
    ];
  });
}

/**
 * Records the fills of one transaction the user just sent. Idempotent (the primary key is tx hash + log index) and
 * driven only by the receipt, so calling it with any hash is harmless.
 */
export async function recordFillsForTx(hash: string): Promise<{ recorded: number; pending: boolean }> {
  if (!isHex(hash) || hash.length !== 66) return { recorded: 0, pending: false };
  const pub = publicClient();
  let receipt;
  try {
    receipt = await pub.getTransactionReceipt({ hash: hash as Hex });
  } catch {
    return { recorded: 0, pending: true };
  }
  if (receipt.status !== "success") return { recorded: 0, pending: false };
  const logs = parseEventLogs({
    abi: virtualExchangeAbi,
    eventName: "TradeExecuted",
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === VSET_CONTRACTS.exchange.toLowerCase()),
  });
  if (!logs.length) return { recorded: 0, pending: false };
  const db = await vdb();
  const ids = [...new Set(logs.map((log) => Number(log.args.marketId)))];
  const { data } = await db.from("vset_markets").select("market_id,key").in("market_id", ids);
  const keyOf = new Map<number, string>();
  for (const row of (data ?? []) as { market_id: number | null; key: string }[])
    if (row.market_id !== null) keyOf.set(row.market_id, row.key);
  const rows = fillRowsFromLogs(logs as unknown as TradeLog[], keyOf);
  if (!rows.length) return { recorded: 0, pending: false };
  const { error } = await db.from("vset_fills").upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
  if (error) throw dbError("record fills", error);
  return { recorded: rows.length, pending: false };
}
