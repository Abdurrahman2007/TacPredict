import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import { useLoginDialog } from "@/components/login-dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { usePaperLedger, type PaperPosition } from "@/lib/paper/ledger";
import "@/styles/portfolio-reference.css";
import "@/styles/portfolio-paper.css";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Portfolio — TacPredict" }],
  }),
  component: PortfolioPage,
});

const periods = {
  "1D": "Past Day",
  "1W": "Past Week",
  "1M": "Past Month",
  ALL: "All Time",
} as const;

function money(n: number, hidden: boolean) {
  if (hidden) return "••••";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedMoney(n: number, hidden: boolean) {
  if (hidden) return "••••";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PortfolioPage() {
  const wallet = useBaseWallet();
  const login = useLoginDialog();
  const ledger = usePaperLedger();
  const [hidden, setHidden] = useOverviewPrivacy();
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [range, setRange] = useState<keyof typeof periods>("1D");
  const [notice, setNotice] = useState("");
  const disconnected = !wallet.address;

  /** Cost basis of open positions (mark-to-market lives on the market page). */
  const positionValue = useMemo(
    () => ledger.positions.reduce((sum: number, p: PaperPosition) => sum + p.shares * p.avgCost, 0),
    [ledger.positions],
  );
  const available = disconnected ? 0 : ledger.balance;
  const equity = disconnected ? 0 : ledger.balance + positionValue;
  const realized = disconnected ? 0 : ledger.realizedPnl;
  const sells = useMemo(
    () => ledger.trades.filter((t) => t.kind === "sell"),
    [ledger.trades],
  );

  async function copyAddress() {
    if (!wallet.address) {
      login("/profile");
      return;
    }
    try {
      await navigator.clipboard.writeText(wallet.address);
      setNotice("Copied");
      window.setTimeout(() => setNotice(""), 1500);
    } catch {
      setNotice("Copy unavailable");
    }
  }

  return (
    <main className="tp-world-port">
      <header className="tp-wp-head">
        <div>
          <h1>Portfolio</h1>
          <div className="tp-wp-wallet">
            <Wallet size={14} aria-hidden />
            <span>
              {disconnected
                ? "Not connected"
                : `${wallet.address!.slice(0, 6)}…${wallet.address!.slice(-4)}`}
            </span>
            {!disconnected && (
              <button type="button" onClick={() => void copyAddress()} aria-label="Copy wallet">
                <Copy size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="tp-wp-tools">
          <button
            type="button"
            className="tp-wp-icon"
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            aria-pressed={hidden}
          >
            {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <button type="button" className="tp-wp-icon" aria-label="Refresh" disabled>
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <section className="tp-wp-available" aria-label="Available to trade">
        <span>Available to trade</span>
        <strong>{money(available, hidden)}</strong>
        <small>Virtual USDC · from rewards &amp; trades only</small>
        <div className="tp-wp-actions">
          {disconnected ? (
            <button type="button" className="tp-wp-primary" onClick={() => login("/profile")}>
              Connect wallet
            </button>
          ) : (
            <Link to="/rewards" className="tp-wp-primary">
              Get Virtual USDC
            </Link>
          )}
          <Link to="/" className="tp-wp-secondary">
            Trade
          </Link>
        </div>
      </section>

      <section className="tp-wp-pl" aria-label="Profit and loss">
        <div className="tp-wp-pl-row">
          <h2>Profit/Loss</h2>
          <strong className={realized > 0 ? "tp-pnl-pos" : realized < 0 ? "tp-pnl-neg" : undefined}>
            {signedMoney(realized, hidden)}
          </strong>
        </div>
        <div className="tp-wp-periods" role="group" aria-label="Period">
          {(Object.keys(periods) as (keyof typeof periods)[]).map((p) => (
            <button
              key={p}
              type="button"
              className={range === p ? "on" : undefined}
              aria-pressed={range === p}
              onClick={() => setRange(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <PortfolioPerformanceChart
          key={range}
          empty={sells.length === 0}
          preview={disconnected}
          hidden={hidden}
          period={periods[range]}
        />
        <p className="tp-wp-equity">
          Equity {money(equity, hidden)}
          {!disconnected && positionValue > 0 ? (
            <span> · Positions {money(positionValue, hidden)}</span>
          ) : null}
          <span> · Realized {signedMoney(realized, hidden)}</span>
        </p>
      </section>

      <section className="tp-wp-holdings" aria-label="Holdings">
        <div className="tp-wp-tabs" role="group">
          <button
            type="button"
            aria-pressed={tab === "positions"}
            onClick={() => setTab("positions")}
          >
            Positions
          </button>
          <button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")}>
            History
          </button>
        </div>

        {tab === "positions" ? (
          ledger.positions.length === 0 || disconnected ? (
            <div className="tp-wp-empty">
              <p>No positions</p>
              <div className="tp-wp-total">
                <span>Total</span>
                <b>{money(0, hidden)}</b>
                <Link to="/" aria-label="View markets">
                  View All <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <ul className="tp-wp-list">
                {ledger.positions.map((p) => {
                  const cost = p.shares * p.avgCost;
                  const maxWin = p.shares;
                  return (
                    <li key={p.id}>
                      <div>
                        <strong>{p.title}</strong>
                        <small>
                          {p.side} · {p.shares.toFixed(2)} sh · {(p.avgCost * 100).toFixed(0)}¢ ·
                          to win {money(maxWin, hidden)}
                        </small>
                      </div>
                      <b>
                        {money(cost, hidden)}
                        <small
                          style={{
                            display: "block",
                            fontWeight: 600,
                            color: "#6dce95",
                            fontSize: 12,
                          }}
                        >
                          {signedMoney(maxWin - cost, hidden)} if win
                        </small>
                      </b>
                    </li>
                  );
                })}
              </ul>
              <div className="tp-wp-total">
                <span>Total</span>
                <b>{money(positionValue, hidden)}</b>
                <Link to="/" aria-label="View markets">
                  View All <ChevronRight size={16} />
                </Link>
              </div>
            </>
          )
        ) : ledger.trades.length === 0 || disconnected ? (
          <div className="tp-wp-empty">
            <p>No history</p>
            <div className="tp-wp-total">
              <span>Total</span>
              <b>{money(0, hidden)}</b>
            </div>
          </div>
        ) : (
          <>
            <ul className="tp-wp-list">
              {ledger.trades.slice(0, 40).map((t) => (
                <li key={t.id}>
                  <div>
                    <strong>
                      {t.kind === "buy" ? "Buy" : "Sell"} {t.side}
                    </strong>
                    <small>
                      {t.title} · {t.shares.toFixed(2)} sh @ {t.priceCents.toFixed(0)}¢
                      {t.realizedPnl != null
                        ? ` · PnL ${signedMoney(t.realizedPnl, false)}`
                        : ""}
                    </small>
                  </div>
                  <b>{money(t.usdc, hidden)}</b>
                </li>
              ))}
            </ul>
            <div className="tp-wp-total">
              <span>Realized P&amp;L</span>
              <b className={realized >= 0 ? "tp-pnl-pos" : "tp-pnl-neg"}>
                {signedMoney(realized, hidden)}
              </b>
            </div>
          </>
        )}
      </section>

      {disconnected && (
        <button type="button" className="tp-wp-connect" onClick={() => login("/profile")}>
          Connect wallet
          <ArrowUpRight size={16} />
        </button>
      )}

      {notice ? (
        <p className="tp-wp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
