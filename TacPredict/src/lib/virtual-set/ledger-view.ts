/**
 * Shapes the on-chain account into the same Ledger the pages already render from the paper ledger, so balance,
 * positions, history and profit read from the chain without any page having to change how it draws them.
 */
import type { Ledger, PaperPosition, PaperTrade } from "@/lib/paper/ledger";
import { ASSETS, durationLabel } from "@/lib/updown/window.mjs";
import type { getOnchainPortfolio } from "./functions";

export type OnchainPortfolioData = NonNullable<Awaited<ReturnType<typeof getOnchainPortfolio>>>;

const titleFor = (asset: string, minutes: number) => {
  const name = (ASSETS as Record<string, { name: string } | undefined>)[asset]?.name ?? asset;
  return minutes > 0 ? `${name} - ${durationLabel(minutes)}` : name;
};

export const EMPTY_ONCHAIN_LEDGER: Ledger = { balance: 0, positions: [], trades: [], realizedPnl: 0 };

export function onchainToLedger(portfolio: OnchainPortfolioData): Ledger {
  const positions: PaperPosition[] = portfolio.positions.map((p) => ({
    id: `${p.marketId}-${p.side}`,
    marketId: p.marketId,
    title: titleFor(p.asset, p.minutes),
    side: p.side,
    shares: p.shares,
    avgCost: p.avgCost,
    openedAt: p.openedAt,
  }));
  const trades: PaperTrade[] = portfolio.trades.map((t) => ({
    id: t.id,
    marketId: t.marketId,
    title: titleFor(t.asset, t.minutes),
    side: t.side,
    kind: t.kind,
    usdc: t.usdc,
    shares: t.shares,
    priceCents: t.priceCents,
    ...(t.realizedPnl === undefined ? {} : { realizedPnl: t.realizedPnl }),
    at: t.at,
  }));
  return { balance: portfolio.balance, positions, trades, realizedPnl: portfolio.realizedPnl };
}
