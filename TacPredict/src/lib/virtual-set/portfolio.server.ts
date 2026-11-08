/**
 * A wallet's Virtual USDC account, read straight from Base: the balance is the token balance, the open positions are
 * the ERC-1155 share balances, and the cost basis / trade history come from the fills the keeper indexed. Everything
 * the page already shows from its paper ledger (balance, positions, trades, realized profit) comes from here instead.
 */
import { getAddress, type Address } from "viem";
import { virtualConditionalPositionsAbi, virtualUsdcAbi } from "./abi";
import { vdb, type FillRow, type MarketRow } from "./db.server";
import { VSET_CONTRACTS, publicClient, tokenIdOf } from "./onchain.server";

const ONE = 1_000_000;

export type OnchainPosition = {
  /** Same id the page uses for the window: reference-<asset>-<startMs>-<minutes>. */
  marketId: string;
  asset: string;
  minutes: number;
  startAt: string;
  endAt: string;
  side: "Up" | "Down";
  /** Whole shares (6 decimals already applied). */
  shares: number;
  /** Dollars paid per share on average. */
  avgCost: number;
  openedAt: string;
  resolved: boolean;
  /** Result when resolved: the side that won (or "Void" when every share pays half). */
  result: "Up" | "Down" | "Void" | null;
};

export type OnchainTrade = {
  id: string;
  marketId: string;
  asset: string;
  minutes: number;
  startAt: string;
  side: "Up" | "Down";
  kind: "buy" | "sell";
  usdc: number;
  shares: number;
  priceCents: number;
  realizedPnl?: number;
  at: string;
  txHash: string;
};

export type OnchainPortfolio = {
  balance: number;
  positions: OnchainPosition[];
  trades: OnchainTrade[];
  realizedPnl: number;
};

const sideOf = (outcome: number): "Up" | "Down" => (outcome === 0 ? "Up" : "Down");

export async function readOnchainPortfolio(wallet: string): Promise<OnchainPortfolio> {
  const account = getAddress(wallet) as Address;
  const pub = publicClient();
  const db = await vdb();

  const [balanceRaw, fillsResult] = await Promise.all([
    pub.readContract({ address: VSET_CONTRACTS.usdc, abi: virtualUsdcAbi, functionName: "balanceOf", args: [account] }),
    db
      .from("vset_fills")
      .select("*")
      .eq("account", account.toLowerCase())
      .order("created_at", { ascending: true })
      .order("log_index", { ascending: true })
      .limit(1000),
  ]);
  const fills = (fillsResult.data ?? []) as FillRow[];
  const balance = Number(balanceRaw) / ONE;
  if (!fills.length) return { balance, positions: [], trades: [], realizedPnl: 0 };

  const ids = [...new Set(fills.map((fill) => fill.market_id))];
  const { data: marketData } = await db.from("vset_markets").select("*").in("market_id", ids);
  const markets = new Map<number, MarketRow>();
  for (const row of (marketData ?? []) as MarketRow[]) if (row.market_id !== null) markets.set(row.market_id, row);

  // Running cost basis per market and side, in order, so each sale books its own profit.
  type Basis = { shares: number; cost: number; openedAt: string };
  const basis = new Map<string, Basis>();
  const trades: OnchainTrade[] = [];
  let realizedPnl = 0;
  for (const fill of fills) {
    const market = markets.get(fill.market_id);
    const key = market?.key ?? fill.market_key ?? String(fill.market_id);
    const slot = `${fill.market_id}:${fill.outcome}`;
    const current = basis.get(slot) ?? { shares: 0, cost: 0, openedAt: fill.created_at };
    const shares = fill.shares / ONE;
    const usdc = fill.usdc / ONE;
    let pnl: number | undefined;
    if (fill.side === "buy") {
      current.shares += shares;
      current.cost += usdc;
    } else {
      const avg = current.shares > 0 ? current.cost / current.shares : 0;
      const sold = Math.min(shares, current.shares);
      pnl = usdc - avg * sold;
      current.shares -= sold;
      current.cost -= avg * sold;
      realizedPnl += pnl;
    }
    basis.set(slot, current);
    trades.push({
      id: `${fill.tx_hash}:${fill.log_index}`,
      marketId: key,
      asset: market?.asset ?? "",
      minutes: market?.minutes ?? 0,
      startAt: market?.start_at ?? fill.created_at,
      side: sideOf(fill.outcome),
      kind: fill.side,
      usdc,
      shares,
      priceCents: Math.round(fill.price_ppm / 10_000),
      ...(pnl === undefined ? {} : { realizedPnl: pnl }),
      at: fill.created_at,
      txHash: fill.tx_hash,
    });
  }

  // What is still held is whatever the chain says: it already reflects sales and automatic payouts. A resolved market
  // books its result as a final "settled" trade (winners are paid out automatically; losing shares are just worthless).
  const slots = [...basis.entries()].slice(-80);
  const reads = await Promise.all(
    slots.map(async ([slot]) => {
      const [marketId, outcome] = slot.split(":").map(Number) as [number, 0 | 1];
      const token = await tokenIdOf(marketId, outcome);
      const onchain = await pub.readContract({
        address: VSET_CONTRACTS.positions,
        abi: virtualConditionalPositionsAbi,
        functionName: "balanceOf",
        args: [account, token],
      });
      return { slot, marketId, outcome, shares: Number(onchain) / ONE };
    }),
  );
  const positions: OnchainPosition[] = [];
  for (const read of reads) {
    const b = basis.get(read.slot);
    const market = markets.get(read.marketId);
    if (!b || !market) continue;
    const avg = b.shares > 0 ? b.cost / b.shares : 0;
    const finished = market.resolved && market.outcome !== null;
    const per = !finished ? null : market.voided ? 0.5 : market.outcome === read.outcome ? 1 : 0;
    if (per !== null) {
      const settled = per === 0 ? b.shares : Math.max(0, b.shares - read.shares);
      if (settled > 0.000001) {
        const got = settled * per;
        const pnl = got - avg * settled;
        realizedPnl += pnl;
        trades.push({
          id: `settle-${read.marketId}-${read.outcome}`,
          marketId: market.key,
          asset: market.asset,
          minutes: market.minutes,
          startAt: market.start_at,
          side: sideOf(read.outcome),
          kind: "sell",
          usdc: got,
          shares: settled,
          priceCents: per * 100,
          realizedPnl: pnl,
          at: market.end_at,
          txHash: "",
        });
      }
    }
    if (read.shares <= 0.000001 || per === 0) continue;
    positions.push({
      marketId: market.key,
      asset: market.asset,
      minutes: market.minutes,
      startAt: market.start_at,
      endAt: market.end_at,
      side: sideOf(read.outcome),
      shares: read.shares,
      avgCost: avg,
      openedAt: b.openedAt,
      resolved: finished,
      result: !finished || market.outcome === null ? null : market.voided ? "Void" : sideOf(market.outcome),
    });
  }
  trades.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { balance, positions, trades: trades.slice(-200).reverse(), realizedPnl };
}
