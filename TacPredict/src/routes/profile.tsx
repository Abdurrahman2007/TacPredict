import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet,
  BarChart3,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { usePaperLedger, type PaperPosition, type PaperTrade } from "@/lib/paper/ledger";
import { useTacPointsBalance } from "@/lib/tac-points";
import "@/styles/portfolio-reference.css";
import "@/styles/portfolio-v2.css";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Portfolio — TacPredict" }],
  }),
  component: PortfolioPage,
});

const periods = {
  "1D": { label: "Past Day", ms: 86_400_000 },
  "1W": { label: "Past Week", ms: 604_800_000 },
  "1M": { label: "Past Month", ms: 2_592_000_000 },
  ALL: { label: "All Time", ms: Number.POSITIVE_INFINITY },
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

/** Buy notional only — real traded volume, never buy+sell double count. */
function tradeVolume(trades: PaperTrade[]): number {
  return trades.filter((t) => t.kind === "buy").reduce((sum, t) => sum + Math.abs(t.usdc), 0);
}

function cumulativePnlPoints(trades: PaperTrade[], sinceMs: number) {
  const sells = trades
    .filter((t) => t.kind === "sell" && typeof t.realizedPnl === "number")
    .map((t) => ({ at: Date.parse(t.at), pnl: t.realizedPnl as number }))
    .filter((t) => Number.isFinite(t.at))
    .sort((a, b) => a.at - b.at);

  const cutoff = Number.isFinite(sinceMs) ? Date.now() - sinceMs : 0;
  let running = 0;
  const points: { at: number; pnl: number }[] = [];
  for (const s of sells) {
    running += s.pnl;
    if (s.at >= cutoff) points.push({ at: s.at, pnl: running });
  }
  if (points.length === 0 && sells.length > 0) {
    points.push({ at: Date.now(), pnl: running });
  }
  return points;
}

function PortfolioPage() {
  const wallet = useBaseWallet();
  const access = useWalletAccess("/profile");
  const ledger = usePaperLedger();
  const [hidden, setHidden] = useOverviewPrivacy();
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [range, setRange] = useState<keyof typeof periods>("ALL");
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
  const tac = useTacPointsBalance();
  const totalVolume = disconnected ? 0 : tradeVolume(ledger.trades);
  const sells = useMemo(() => ledger.trades.filter((t) => t.kind === "sell"), [ledger.trades]);
  const wins = sells.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const winRate =
    disconnected || sells.length === 0 ? null : Math.round((wins / sells.length) * 100);
  const pnlTone = realized > 0 ? "tp-pnl-pos" : realized < 0 ? "tp-pnl-neg" : undefined;
  const chartPoints = useMemo(
    () => (disconnected ? [] : cumulativePnlPoints(ledger.trades, periods[range].ms)),
    [disconnected, ledger.trades, range],
  );

  async function copyAddress() {
    if (!wallet.address) {
      void access.run();
      return;
    }
    try {
      await navigator.clipboard.writeText(wallet.address);
      setNotice("Address copied");
      window.setTimeout(() => setNotice(""), 1500);
    } catch {
      setNotice("Copy unavailable");
    }
  }

  return (
    <main className="tp-world-port pf">
      <header className="pf-head">
        <div>
          <p className="pf-kicker">Your account</p>
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
        <div className="pf-tools">
          <button
            type="button"
            className="pf-icon"
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            aria-pressed={hidden}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button
            type="button"
            className="pf-icon"
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      <section className="pf-hero" aria-label="Portfolio value">
        <i className="pf-hero-orb" aria-hidden />
        <span className="pf-label">Total equity · Virtual USDC</span>
        <strong className="pf-equity">{money(equity, hidden)}</strong>
        <span className={`pf-pnl-pill ${pnlTone ?? ""}`}>
          <TrendingUp size={13} aria-hidden /> {signedMoney(realized, hidden)} realized
        </span>
        <div className="pf-split">
          <div>
            <small>Available</small>
            <b>{money(available, hidden)}</b>
          </div>
          <div>
            <small>In positions</small>
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
            <Link to="/rewards" className="pf-primary">
              Get Virtual USDC
            </Link>
          )}
          <Link to="/up-down" className="pf-secondary">
            Trade
          </Link>
        </div>
      </section>

      <section className="pf-stats" aria-label="Portfolio totals">
        <div>
          <span className="pf-stat-icon blue">
            <BarChart3 size={16} />
          </span>
          <small>Volume</small>
          <b>{money(totalVolume, hidden)}</b>
          <em className="pf-stat-note">Buy size from your trades</em>
        </div>
        <div>
          <span className="pf-stat-icon green">
            <TrendingUp size={16} />
          </span>
          <small>Profit/Loss</small>
          <b className={pnlTone}>{signedMoney(realized, hidden)}</b>
          <em className="pf-stat-note">Settled sells only</em>
        </div>
        <div>
          <span className="pf-stat-icon orange">
            <Target size={16} />
          </span>
          <small>Win rate</small>
          <b>{hidden ? "••••" : winRate == null ? "—" : `${winRate}%`}</b>
          <em className="pf-stat-note">
            {disconnected || sells.length === 0 ? "No closed trades" : `${wins}/${sells.length} wins`}
          </em>
        </div>
        <div>
          <span className="pf-stat-icon purple">
            <Star size={16} />
          </span>
          <small>TAC Points</small>
          <b>
            {hidden
              ? "••••"
              : disconnected || tac.isPending || tac.isError
                ? "0"
                : (tac.data?.balance.toLocaleString("en-US") ?? "0")}
          </b>
          <em className="pf-stat-note">Rewards balance</em>
        </div>
      </section>

      <section className="pf-card pf-chart" aria-label="Profit and loss">
        <div className="pf-card-head">
          <div>
            <h2>Profit/Loss</h2>
            <strong className={pnlTone}>{signedMoney(realized, hidden)}</strong>
          </div>
          <div className="pf-periods" role="group" aria-label="Period">
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
        </div>
        <PortfolioPerformanceChart
          key={range}
          points={chartPoints}
          empty={sells.length === 0}
          preview={disconnected}
          hidden={hidden}
          period={periods[range].label}
        />
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
              <span className="pf-empty-icon" aria-hidden>
                <BarChart3 size={24} />
              </span>
              <p>No open positions</p>
              <Link to="/up-down" className="pf-secondary">
                Start trading <ChevronRight size={16} />
              </Link>
            </div>
          ) : (
            <ul className="tp-pos-list">
              {ledger.positions.map((p) => {
                const cost = p.shares * p.avgCost;
                const maxWin = p.shares;
                return (
                  <li key={p.id} className="tp-pos-row tp-pos-hist">
                    <span className="tp-pos-side" data-side={p.side}>
                      {p.side}
                    </span>
                    <span className="tp-pos-main">
                      <strong>{p.title}</strong>
                      <small>
                        {p.shares.toFixed(2)} sh · avg {(p.avgCost * 100).toFixed(0)}¢
                      </small>
                    </span>
                    <span className="tp-pos-val">
                      <b>{money(cost, hidden)}</b>
                      <small className="tp-pnl-pos">
                        {signedMoney(maxWin - cost, hidden)} if win
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        ) : ledger.trades.length === 0 || disconnected ? (
          <div className="pf-empty">
            <span className="pf-empty-icon" aria-hidden>
              <RefreshCw size={22} />
            </span>
            <p>No trades yet</p>
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
                    {t.side} · {t.shares.toFixed(2)} sh @ {t.priceCents.toFixed(0)}¢
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
        <div className="tp-pos-foot">
          <span>
            {tab === "positions" ? "Total" : "Realized P&L"}{" "}
            <b className={tab === "history" ? pnlTone : undefined}>
              {tab === "positions"
                ? money(disconnected ? 0 : positionValue, hidden)
                : signedMoney(realized, hidden)}
            </b>
          </span>
          <Link to="/up-down" className="tp-pos-all">
            Trade ↗
          </Link>
        </div>
      </section>

      {notice ? (
        <p className="pf-notice" role="status">
          {notice}
        </p>
      ) : null}
    </main>
  );
}
