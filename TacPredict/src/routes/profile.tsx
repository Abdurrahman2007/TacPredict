import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Copy, Eye, EyeOff, Wallet } from "lucide-react";
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
  const pnlTone = realized > 0 ? "tp-pnl-pos" : realized < 0 ? "tp-pnl-neg" : undefined;

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
    <main className="tp-world-port pf pf-min">
      <header className="pf-head">
        <div>
          <h1>Portfolio</h1>
          <button
            type="button"
            className="pf-wallet"
            onClick={() => void copyAddress()}
            aria-label={disconnected ? "Connect wallet" : "Copy wallet address"}
          >
            <Wallet size={13} aria-hidden />
            {disconnected
              ? wallet.restoring
                ? "Connecting…"
                : "Not connected"
              : `${wallet.address!.slice(0, 6)}…${wallet.address!.slice(-4)}`}
            {!disconnected && <Copy size={12} aria-hidden />}
          </button>
        </div>
        <button
          type="button"
          className="pf-icon"
          onClick={() => setHidden(!hidden)}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          aria-pressed={hidden}
        >
          {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      <section className="pf-hero" aria-label="Portfolio value">
        <strong className="pf-equity">{money(equity, hidden)}</strong>
        <span className={`pf-pnl-pill ${pnlTone ?? ""}`}>{signedMoney(realized, hidden)}</span>
        <div className="pf-split">
          <div>
            <small>Available</small>
            <b>{money(available, hidden)}</b>
          </div>
          <div>
            <small>Positions</small>
            <b>{money(disconnected ? 0 : positionValue, hidden)}</b>
          </div>
        </div>
        <div className="pf-actions">
          {showConnect ? (
            <button type="button" className="pf-primary" onClick={() => void access.run()}>
              Connect wallet
            </button>
          ) : disconnected ? (
            <button type="button" className="pf-primary" disabled>
              Connecting…
            </button>
          ) : (
            <Link to="/up-down" className="pf-primary">
              Trade
            </Link>
          )}
          <Link to="/rewards" className="pf-secondary">
            Rewards
          </Link>
        </div>
      </section>

      <section className="pf-stats pf-stats-3" aria-label="Totals">
        <div>
          <small>Volume</small>
          <b>{money(totalVolume, hidden)}</b>
        </div>
        <div>
          <small>P&amp;L</small>
          <b className={pnlTone}>{signedMoney(realized, hidden)}</b>
        </div>
        <div>
          <small>Open</small>
          <b>{hidden ? "••••" : disconnected ? "0" : String(ledger.positions.length)}</b>
        </div>
      </section>

      <section className="pf-card pf-holdings" aria-label="Holdings">
        <div className="tp-seg" role="tablist">
          {(["positions", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "on" : undefined}
              onClick={() => setTab(t)}
            >
              {t === "positions" ? "Positions" : "History"}
              {t === "positions" && !disconnected && ledger.positions.length > 0 ? (
                <em>{ledger.positions.length}</em>
              ) : null}
            </button>
          ))}
          <i className="tp-seg-thumb" data-pos={tab === "positions" ? 0 : 1} aria-hidden />
        </div>

        {tab === "positions" ? (
          ledger.positions.length === 0 || disconnected ? (
            <div className="pf-empty">
              <p>0</p>
            </div>
          ) : (
            <ul className="tp-pos-list">
              {ledger.positions.map((p) => {
                const cost = p.shares * p.avgCost;
                return (
                  <li key={p.id} className="tp-pos-row">
                    <span className="tp-pos-side" data-side={p.side}>
                      {p.side}
                    </span>
                    <span className="tp-pos-main">
                      <strong>{p.title}</strong>
                      <small>
                        {p.shares.toFixed(2)} · {(p.avgCost * 100).toFixed(0)}¢
                      </small>
                    </span>
                    <span className="tp-pos-val">
                      <b>{money(cost, hidden)}</b>
                    </span>
                    <button
                      type="button"
                      className="tp-pos-sell"
                      data-confirm={confirm === p.id || undefined}
                      onClick={() => sell(p.id)}
                    >
                      {confirm === p.id ? "Confirm" : `Sell ${sellCents(p.avgCost)}¢`}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : ledger.trades.length === 0 || disconnected ? (
          <div className="pf-empty">
            <p>0</p>
          </div>
        ) : (
          <ul className="tp-pos-list">
            {ledger.trades.slice(0, 40).map((t) => (
              <li key={t.id} className="tp-pos-row tp-pos-hist">
                <span className="tp-pos-side" data-side={t.side} data-kind={t.kind}>
                  {t.kind === "buy" ? "Buy" : "Sell"}
                </span>
                <span className="tp-pos-main">
                  <strong>{t.title}</strong>
                  <small>
                    {t.side} · {t.shares.toFixed(2)} @ {t.priceCents.toFixed(0)}¢
                  </small>
                </span>
                <span className="tp-pos-val">
                  <b>{money(t.usdc, hidden)}</b>
                  {t.realizedPnl != null ? (
                    <small className={t.realizedPnl >= 0 ? "tp-pnl-pos" : "tp-pnl-neg"}>
                      {signedMoney(t.realizedPnl, hidden)}
                    </small>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice ? (
        <p className="pf-notice" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
