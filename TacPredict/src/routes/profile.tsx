import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Copy, Eye, EyeOff } from "lucide-react";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { usePaperLedger, type PaperPosition, type PaperTrade } from "@/lib/paper/ledger";
import "@/styles/portfolio-v2.css";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Portfolio — TacPredict" }],
  }),
  component: PortfolioPage,
});

function money(n: number, hidden: boolean) {
  if (hidden) return "••••";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedMoney(n: number, hidden: boolean) {
  if (hidden) return "••••";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tradeVolume(trades: PaperTrade[]): number {
  return trades.filter((t) => t.kind === "buy").reduce((sum, t) => sum + Math.abs(t.usdc), 0);
}

function sellCents(avgCost: number) {
  return Math.max(1, Math.min(99, Math.round(avgCost * 100)));
}

function PortfolioPage() {
  const wallet = useBaseWallet();
  const access = useWalletAccess("/profile");
  const ledger = usePaperLedger();
  const [hidden, setHidden] = useOverviewPrivacy();
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const disconnected = !wallet.address;
  const showConnect = !wallet.address && !wallet.restoring;

  const positionValue = useMemo(
    () => ledger.positions.reduce((sum: number, p: PaperPosition) => sum + p.shares * p.avgCost, 0),
    [ledger.positions],
  );
  const available = disconnected ? 0 : ledger.balance;
  const equity = disconnected ? 0 : ledger.balance + positionValue;
  const realized = disconnected ? 0 : ledger.realizedPnl;
  const totalVolume = disconnected ? 0 : tradeVolume(ledger.trades);
  const openCount = disconnected ? 0 : ledger.positions.length;
  const pnlTone = realized > 0 ? "up" : realized < 0 ? "down" : "";

  async function copyAddress() {
    if (!wallet.address) {
      void access.run();
      return;
    }
    try {
      await navigator.clipboard.writeText(wallet.address);
      setNotice("Copied");
      window.setTimeout(() => setNotice(""), 1200);
    } catch {
      setNotice("Copy unavailable");
    }
  }

  function sell(id: string) {
    const position = ledger.positions.find((p) => p.id === id);
    if (!position) return;
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirm(null);
    const res = ledger.sell(id, sellCents(position.avgCost));
    setNotice(res.ok ? `Sold · ${signedMoney(res.pnl, false)}` : res.message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <main className="pf pf-pro">
      <header className="pf-pro-top">
        <div>
          <p className="pf-pro-label">Portfolio</p>
          <button
            type="button"
            className="pf-pro-addr"
            onClick={() => void copyAddress()}
            aria-label={disconnected ? "Connect wallet" : "Copy wallet address"}
          >
            {disconnected
              ? wallet.restoring
                ? "Connecting…"
                : "Not connected"
              : `${wallet.address!.slice(0, 6)}…${wallet.address!.slice(-4)}`}
            {!disconnected ? <Copy size={12} aria-hidden /> : null}
          </button>
        </div>
        <button
          type="button"
          className="pf-pro-icon"
          onClick={() => setHidden(!hidden)}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          aria-pressed={hidden}
        >
          {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      <section className="pf-pro-hero" aria-label="Portfolio value">
        <p className="pf-pro-label">Total value</p>
        <h1 className="pf-pro-equity">{money(equity, hidden)}</h1>
        <p className={`pf-pro-pnl ${pnlTone}`}>{signedMoney(realized, hidden)}</p>
      </section>

      <section className="pf-pro-metrics" aria-label="Totals">
        <div>
          <span>Available</span>
          <strong>{money(available, hidden)}</strong>
        </div>
        <div>
          <span>Positions</span>
          <strong>{money(disconnected ? 0 : positionValue, hidden)}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{money(totalVolume, hidden)}</strong>
        </div>
      </section>

      <div className="pf-pro-cta">
        {showConnect ? (
          <button type="button" className="pf-pro-btn primary" onClick={() => void access.run()}>
            Connect wallet
          </button>
        ) : disconnected ? (
          <button type="button" className="pf-pro-btn primary" disabled>
            Connecting…
          </button>
        ) : (
          <Link to="/up-down" className="pf-pro-btn primary">
            Trade
          </Link>
        )}
        <Link to="/rewards" className="pf-pro-btn ghost">
          Rewards
        </Link>
      </div>

      <section className="pf-pro-book" aria-label="Holdings">
        <div className="pf-pro-tabs" role="tablist">
          {(["positions", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "on" : undefined}
              onClick={() => setTab(t)}
            >
              {t === "positions" ? `Positions${openCount ? ` · ${openCount}` : ""}` : "History"}
            </button>
          ))}
        </div>

        {tab === "positions" ? (
          openCount === 0 ? (
            <div className="pf-pro-empty">
              <b>0</b>
              <Link to="/up-down">Start trading</Link>
            </div>
          ) : (
            <ul className="pf-pro-list">
              {ledger.positions.map((p) => {
                const cost = p.shares * p.avgCost;
                return (
                  <li key={p.id}>
                    <div className="pf-pro-row-main">
                      <span className="pf-pro-side" data-side={p.side}>
                        {p.side}
                      </span>
                      <div>
                        <strong>{p.title}</strong>
                        <small>
                          {p.shares.toFixed(2)} sh · {(p.avgCost * 100).toFixed(0)}¢
                        </small>
                      </div>
                    </div>
                    <div className="pf-pro-row-val">
                      <b>{money(cost, hidden)}</b>
                      <button
                        type="button"
                        className="pf-pro-sell"
                        data-confirm={confirm === p.id || undefined}
                        onClick={() => sell(p.id)}
                      >
                        {confirm === p.id ? "Confirm" : `Sell ${sellCents(p.avgCost)}¢`}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : ledger.trades.length === 0 || disconnected ? (
          <div className="pf-pro-empty">
            <b>0</b>
          </div>
        ) : (
          <ul className="pf-pro-list">
            {ledger.trades.slice(0, 40).map((t) => (
              <li key={t.id}>
                <div className="pf-pro-row-main">
                  <span className="pf-pro-side" data-side={t.side} data-kind={t.kind}>
                    {t.kind === "buy" ? "Buy" : "Sell"}
                  </span>
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {t.side} · {t.shares.toFixed(2)} @ {t.priceCents.toFixed(0)}¢
                    </small>
                  </div>
                </div>
                <div className="pf-pro-row-val">
                  <b>{money(t.usdc, hidden)}</b>
                  {t.realizedPnl != null ? (
                    <small className={t.realizedPnl >= 0 ? "up" : "down"}>
                      {signedMoney(t.realizedPnl, hidden)}
                    </small>
                  ) : (
                    <small>&nbsp;</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice ? (
        <p className="pf-pro-toast" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
