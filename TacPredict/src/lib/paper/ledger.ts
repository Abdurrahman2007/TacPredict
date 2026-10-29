import { useCallback, useSyncExternalStore } from "react";

/** v2: start at $0 — Virtual USDC only from rewards / trades, never a free $10k grant. */
const KEY = "tac-paper-ledger-v2";
const EVENT = "tac-paper-ledger";
const START = 0;

export type PaperPosition = {
  id: string;
  marketId: string;
  title: string;
  side: "Up" | "Down";
  shares: number;
  avgCost: number; // USDC per share ($0–$1)
  openedAt: string;
};

export type PaperTrade = {
  id: string;
  marketId: string;
  title: string;
  side: "Up" | "Down";
  kind: "buy" | "sell";
  usdc: number;
  shares: number;
  priceCents: number;
  /** Realized PnL on sells only (proceeds − cost basis). */
  realizedPnl?: number;
  at: string;
};

export type Ledger = {
  balance: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  /** Cumulative realized PnL from closed paper trades. */
  realizedPnl: number;
};

const EMPTY: Ledger = Object.freeze({
  balance: START,
  positions: Object.freeze([]) as unknown as PaperPosition[],
  trades: Object.freeze([]) as unknown as PaperTrade[],
  realizedPnl: 0,
});

/** Single cached snapshot — getSnapshot must return a stable reference. */
let snapshot: Ledger = EMPTY;
let snapshotRaw: string | null = null;

function parse(raw: string | null): Ledger {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    if (typeof parsed.balance !== "number" || !Array.isArray(parsed.positions)) return EMPTY;
    return {
      balance: parsed.balance,
      positions: parsed.positions,
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
      realizedPnl: typeof parsed.realizedPnl === "number" ? parsed.realizedPnl : 0,
    };
  } catch {
    return EMPTY;
  }
}

function syncFromStorage(): Ledger {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === snapshotRaw) return snapshot;
    snapshotRaw = raw;
    snapshot = parse(raw);
    return snapshot;
  } catch {
    snapshotRaw = null;
    snapshot = EMPTY;
    return EMPTY;
  }
}

function getSnapshot(): Ledger {
  return syncFromStorage();
}

function getServerSnapshot(): Ledger {
  return EMPTY;
}

function commit(next: Ledger) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* private mode */
  }
  snapshotRaw = raw;
  snapshot = next;
  window.dispatchEvent(new Event(EVENT));
}

/** Credit Virtual USDC without opening a position (rewards / check-in). */
export function creditPaperBalance(amount: number) {
  if (!(amount > 0)) return;
  const cur = syncFromStorage();
  commit({
    ...cur,
    balance: Math.round((cur.balance + amount) * 1e6) / 1e6,
  });
}

/**
 * Idempotent paper settlement after verified expiry outcome.
 * Up/Down winners pay $1/share; losers $0; void pays $0.50/share (binary tie policy).
 * Returns null if already settled or no open positions for this market.
 */
export function settlePaperMarket(
  marketId: string,
  result: "Up" | "Down" | "void",
  evidence: { start: number; end: number; at: string },
): { payout: number; pnl: number } | null {
  const cur = syncFromStorage();
  if (cur.trades.some((t) => t.marketId === marketId && t.kind === "sell" && t.id.startsWith("settle-")))
    return null;
  const open = cur.positions.filter((p) => p.marketId === marketId);
  if (open.length === 0) return null;
  let payout = 0;
  let costBasis = 0;
  const trades: PaperTrade[] = [];
  for (const pos of open) {
    costBasis += pos.shares * pos.avgCost;
    const per =
      result === "void" ? 0.5 : result === pos.side ? 1 : 0;
    const got = pos.shares * per;
    payout += got;
    trades.push({
      id: `settle-${marketId}-${pos.side}-${evidence.at}`,
      marketId,
      title: pos.title,
      side: pos.side,
      kind: "sell",
      usdc: got,
      shares: pos.shares,
      priceCents: per * 100,
      realizedPnl: Math.round((got - pos.shares * pos.avgCost) * 1e6) / 1e6,
      at: evidence.at,
    });
  }
  const pnl = Math.round((payout - costBasis) * 1e6) / 1e6;
  commit({
    balance: Math.round((cur.balance + payout) * 1e6) / 1e6,
    positions: cur.positions.filter((p) => p.marketId !== marketId),
    trades: [...trades, ...cur.trades].slice(0, 200),
    realizedPnl: Math.round((cur.realizedPnl + pnl) * 1e6) / 1e6,
  });
  return { payout, pnl };
}

/** Sum of buy+sell notional for one market (real paper volume). */
export function paperVolumeFor(marketId: string, trades: PaperTrade[]): number {
  return trades
    .filter((t) => t.marketId === marketId)
    .reduce((sum, t) => sum + t.usdc, 0);
}

function subscribe(cb: () => void) {
  const onChange = () => {
    syncFromStorage();
    cb();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePaperLedger(): Ledger & {
  buy: (input: {
    marketId: string;
    title: string;
    side: "Up" | "Down";
    usdc: number;
    priceCents: number;
  }) => { ok: true } | { ok: false; message: string };
  sell: (positionId: string, priceCents: number) => { ok: true; pnl: number } | { ok: false; message: string };
} {
  const ledger = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const buy = useCallback(
    ({
      marketId,
      title,
      side,
      usdc,
      priceCents,
    }: {
      marketId: string;
      title: string;
      side: "Up" | "Down";
      usdc: number;
      priceCents: number;
    }) => {
      if (!(usdc > 0) || !(priceCents > 0 && priceCents <= 100))
        return { ok: false as const, message: "Invalid order" };
      const price = Math.min(0.99, Math.max(0.01, priceCents / 100));
      const cost = usdc;
      const cur = syncFromStorage();
      if (cost > cur.balance + 1e-9)
        return { ok: false as const, message: "Insufficient Virtual USDC" };
      const shares = cost / price;
      const existing = cur.positions.find((p) => p.marketId === marketId && p.side === side);
      let positions = cur.positions;
      if (existing) {
        const totalShares = existing.shares + shares;
        const avgCost = (existing.avgCost * existing.shares + cost) / totalShares;
        positions = cur.positions.map((p) =>
          p.id === existing.id ? { ...p, shares: totalShares, avgCost } : p,
        );
      } else {
        positions = [
          {
            id: `${marketId}-${side}-${Date.now()}`,
            marketId,
            title,
            side,
            shares,
            avgCost: price,
            openedAt: new Date().toISOString(),
          },
          ...cur.positions,
        ];
      }
      const trade: PaperTrade = {
        id: `buy-${Date.now()}`,
        marketId,
        title,
        side,
        kind: "buy",
        usdc: cost,
        shares,
        priceCents,
        at: new Date().toISOString(),
      };
      commit({
        balance: Math.round((cur.balance - cost) * 1e6) / 1e6,
        positions,
        trades: [trade, ...cur.trades].slice(0, 200),
        realizedPnl: cur.realizedPnl,
      });
      return { ok: true as const };
    },
    [],
  );

  const sell = useCallback((positionId: string, priceCents: number) => {
    if (!(priceCents > 0 && priceCents <= 100))
      return { ok: false as const, message: "Invalid price" };
    const cur = syncFromStorage();
    const pos = cur.positions.find((p) => p.id === positionId);
    if (!pos) return { ok: false as const, message: "Position not found" };
    const proceeds = pos.shares * (priceCents / 100);
    const costBasis = pos.shares * pos.avgCost;
    const pnl = Math.round((proceeds - costBasis) * 1e6) / 1e6;
    const trade: PaperTrade = {
      id: `sell-${Date.now()}`,
      marketId: pos.marketId,
      title: pos.title,
      side: pos.side,
      kind: "sell",
      usdc: proceeds,
      shares: pos.shares,
      priceCents,
      realizedPnl: pnl,
      at: new Date().toISOString(),
    };
    commit({
      balance: Math.round((cur.balance + proceeds) * 1e6) / 1e6,
      positions: cur.positions.filter((p) => p.id !== positionId),
      trades: [trade, ...cur.trades].slice(0, 200),
      realizedPnl: Math.round((cur.realizedPnl + pnl) * 1e6) / 1e6,
    });
    return { ok: true as const, pnl };
  }, []);

  return {
    balance: ledger.balance,
    positions: ledger.positions,
    trades: ledger.trades,
    realizedPnl: ledger.realizedPnl,
    buy,
    sell,
  };
}
