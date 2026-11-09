import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Market } from "@/domain/markets/types";
import { NativeActivity } from "@/components/native-market-data";
import { useLoginDialog } from "@/components/login-dialog";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { usdcShort, sharesShort, volumeText } from "@/lib/protocol/display.mjs";
import { spotWindowQueryOptions } from "@/lib/updown/spot.functions";
import { useLivePrice } from "@/lib/updown/live-prices";
import { clock, useTimeZone } from "@/lib/updown/use-clock";
import {
  ASSETS,
  DURATIONS,
  ASSET_KEYS,
  deltaInfo,
  durationLabel,
  formatCountdown,
  formatUsd,
  priceToBeat,
  slugOf,
  windowStartFor,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { VirtualPortfolio } from "@/components/virtual/virtual-portfolio";
import { cryptoLogoUrl } from "@/lib/crypto-logo";
import { usePaperLedger } from "@/lib/paper/ledger";
import { sharesToAtomic } from "@/lib/virtual-set/trade-plan.mjs";
import { executeOnchainTrade } from "@/lib/virtual-set/wallet-trade";
import {
  useOnchainWindow,
  useOptionalWallet,
  useRefreshOnchain,
} from "@/lib/virtual-set/use-onchain";

function MyPositions({ market }: { market: Market }) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const { user } = useProtocolUser();
  const portfolio = useNativePortfolio();
  const zone = useTimeZone();
  const positions = (portfolio.data?.positions ?? []).filter(
    (p) => p.marketId === market.native?.marketId && p.chainId === market.native?.chainId,
  );
  const history = (portfolio.data?.activity ?? []).filter(
    (a) => a.marketId === market.native?.marketId && a.chainId === market.native?.chainId,
  );
  const total =
    user &&
    !portfolio.isPending &&
    !portfolio.isError &&
    positions.every((p) => p.valueAtomic !== null)
      ? positions.reduce((sum, p) => sum + BigInt(p.valueAtomic!), 0n)
      : null;
  return (
    <section className="ud-card" aria-label="Your positions">
      <div className="ud-tabs" role="group">
        {(["positions", "history"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "positions" ? "Positions" : "History"}
          </button>
        ))}
      </div>
      {!user ? (
        <p className="ud-muted">Sign in to see your positions.</p>
      ) : tab === "positions" ? (
        positions.length === 0 ? (
          <p className="ud-muted">No positions</p>
        ) : (
          <>
            {positions.map((p) => (
              <div className="ud-row" key={p.id}>
                <span>
                  {p.outcome} · {sharesShort(p.sharesAtomic)} shares
                </span>
                <i />
                <span className="tabular-nums">{usdcShort(p.valueAtomic)}</span>
              </div>
            ))}
          </>
        )
      ) : history.length === 0 ? (
        <p className="ud-muted">No history</p>
      ) : (
        history.map((a) => (
          <div className="ud-row" key={a.id}>
            <span>
              {a.kind} · {clock(Date.parse(a.timestamp), zone)}
            </span>
            <i />
            <span className="tabular-nums">{usdcShort(a.amountAtomic)}</span>
          </div>
        ))
      )}
      <div className="ud-row" style={{ borderTop: "1px solid var(--ud-line)", marginTop: 8 }}>
        <span>Total</span>
        <i />
        <b className="tabular-nums">{usdcShort(total)}</b>
      </div>
    </section>
  );
}

function signed(n: number) {
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;
}

/** Sell ¢: live odds when known, otherwise cost basis so an open position can always exit. */
function sellCents(live: number | null | undefined, avgCost: number) {
  if (typeof live === "number" && live > 0 && live <= 100) return Math.round(live);
  return Math.max(1, Math.min(99, Math.round(avgCost * 100)));
}

/** iOS-style positions & history card with a one-tap (confirm) Sell on each open position. */
function PaperPositionsBlock({
  marketId,
  upCents,
  downCents,
}: {
  marketId: string;
  upCents: number | null;
  downCents: number | null;
}) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const ledger = usePaperLedger();
  const wallet = useOptionalWallet();
  const openLogin = useLoginDialog();
  const onchain = useOnchainWindow(marketId);
  const refreshChain = useRefreshOnchain();
  const chainMode = onchain.enabled;
  const zone = useTimeZone();
  const open = ledger.positions.filter((p) => p.marketId === marketId);
  const history = ledger.trades.filter((t) => t.marketId === marketId).slice(0, 20);
  const markOf = (side: "Up" | "Down") => (side === "Up" ? upCents : downCents);
  const total = open.reduce((sum, p) => {
    const c = markOf(p.side);
    return sum + (c != null ? p.shares * (c / 100) : p.shares * p.avgCost);
  }, 0);
  const uPnL = open.reduce((sum, p) => {
    const c = markOf(p.side);
    if (c == null) return sum;
    return sum + (p.shares * (c / 100) - p.shares * p.avgCost);
  }, 0);

  async function sell(id: string) {
    const position = ledger.positions.find((p) => p.id === id);
    if (!position) {
      setNotice("Position not found");
      return;
    }
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirm(null);
    const cents = sellCents(markOf(position.side), position.avgCost);

    if (chainMode) {
      if (!onchain.supported) {
        setNotice("This window sells on chain as 5 or 15 min");
        return;
      }
      if (!wallet?.address) {
        openLogin();
        return;
      }
      if (!wallet.provider) {
        setNotice("Wallet is not ready — wait a moment and retry");
        return;
      }
      const atomic = sharesToAtomic(position.shares);
      if (atomic == null) {
        setNotice("Position not found");
        return;
      }
      setBusy(true);
      const res = await executeOnchainTrade({
        provider: wallet.provider,
        address: wallet.address,
        chainId: wallet.chainId,
        switchToBase: wallet.switchToBase,
        key: marketId,
        outcome: position.side === "Up" ? 0 : 1,
        side: "sell",
        sharesAtomic: atomic,
        shownCents: cents,
        onStatus: setNotice,
      });
      if (res.ok) {
        const pnl = res.usdc - position.shares * position.avgCost;
        setNotice(`Sold · PnL ${signed(pnl)}`);
        await refreshChain();
      } else {
        setNotice(res.message);
      }
      setBusy(false);
      window.setTimeout(() => setNotice(""), 3200);
      return;
    }

    const res = ledger.sell(id, cents);
    setNotice(res.ok ? `Sold · PnL ${signed(res.pnl)}` : res.message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  return (
    <section className="ud-card tp-pos-card" aria-label="Your positions">
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
            {t === "positions" && open.length > 0 ? <em>{open.length}</em> : null}
          </button>
        ))}
        <i className="tp-seg-thumb" data-pos={tab === "positions" ? 0 : 1} aria-hidden />
      </div>
      {tab === "positions" ? (
        open.length === 0 ? (
          <p className="tp-pos-empty">No positions yet</p>
        ) : (
          <ul className="tp-pos-list">
            {open.map((p) => {
              const c = markOf(p.side);
              const cost = p.shares * p.avgCost;
              const mark = c != null ? p.shares * (c / 100) : cost;
              const pnl = c != null ? mark - cost : null;
              const pct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
              return (
                <li key={p.id} className="tp-pos-row">
                  <span className="tp-pos-side" data-side={p.side}>
                    {p.side}
                  </span>
                  <span className="tp-pos-main">
                    <strong>{p.shares.toFixed(2)} shares</strong>
                    <small>
                      Avg {(p.avgCost * 100).toFixed(0)}¢
                      {c != null ? ` · Now ${Math.round(c)}¢` : ""}
                    </small>
                  </span>
                  <span className="tp-pos-val">
                    <b>${mark.toFixed(2)}</b>
                    {pnl != null ? (
                      <small className={pnl >= 0 ? "tp-pnl-pos" : "tp-pnl-neg"}>
                        {signed(pnl)}
                        {pct != null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)` : ""}
                      </small>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="tp-pos-sell"
                    data-confirm={confirm === p.id || undefined}
                    disabled={busy || (chainMode && onchain.supported === false)}
                    onClick={() => void sell(p.id)}
                  >
                    {confirm === p.id
                      ? "Confirm"
                      : `Sell ${sellCents(c, p.avgCost)}¢`}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : history.length === 0 ? (
        <p className="tp-pos-empty">No history yet</p>
      ) : (
        <ul className="tp-pos-list">
          {history.map((t) => (
            <li key={t.id} className="tp-pos-row tp-pos-hist">
              <span className="tp-pos-side" data-side={t.side} data-kind={t.kind}>
                {t.kind === "buy" ? "Buy" : "Sell"}
              </span>
              <span className="tp-pos-main">
                <strong>
                  {t.side} · {t.shares.toFixed(2)} sh @ {t.priceCents.toFixed(0)}¢
                </strong>
                <small>{clock(Date.parse(t.at), zone)}</small>
              </span>
              <span className="tp-pos-val">
                <b>${t.usdc.toFixed(2)}</b>
                {t.realizedPnl != null ? (
                  <small className={t.realizedPnl >= 0 ? "tp-pnl-pos" : "tp-pnl-neg"}>
                    {signed(t.realizedPnl)}
                  </small>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {notice ? (
        <p className="tp-pos-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="tp-pos-foot">
        <span>
          Total <b className="tabular-nums">${total.toFixed(2)}</b>
          {open.length > 0 && (upCents != null || downCents != null) ? (
            <small className={uPnL >= 0 ? "tp-pnl-pos" : "tp-pnl-neg"}> {signed(uPnL)}</small>
          ) : null}
        </span>
        <Link to="/profile" className="tp-pos-all">
          View All ↗
        </Link>
      </div>
    </section>
  );
}

export function PositionsCard({
  market,
  paperMarketId,
  upCents = null,
  downCents = null,
}: {
  market: Market | null;
  paperMarketId?: string;
  upCents?: number | null;
  downCents?: number | null;
}) {
  const [tab, setTab] = useState("positions");
  if (paperMarketId)
    return <PaperPositionsBlock marketId={paperMarketId} upCents={upCents} downCents={downCents} />;
  if (market?.virtual)
    return (
      <section className="ud-card">
        <div className="ud-tabs">
          {["positions", "history"].map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === "positions" ? "Positions" : "History"}
            </button>
          ))}
        </div>
        <VirtualPortfolio
          deployment={market.virtual.deployment}
          marketId={market.virtual.onchainId}
          markets={[market]}
          tab={tab === "history" ? "History" : "Positions"}
        />
      </section>
    );
  if (market) return <MyPositions market={market} />;
  return (
    <section className="ud-card" aria-label="Your positions">
      <div className="ud-tabs">
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
      <p className="ud-muted">{tab === "positions" ? "No positions" : "No history"}</p>
      <div className="ud-row" style={{ borderTop: "1px solid var(--ud-line)", marginTop: 8 }}>
        <span>Total</span>
        <i />
        <b>—</b>
        <Link to="/profile" className="ud-muted">
          View All ↗
        </Link>
      </div>
    </section>
  );
}

export function StatsCard({
  market,
  paperVolume,
}: {
  market: Market | null;
  /** Real paper volume only — never fake liquidity. */
  paperVolume?: string | null;
}) {
  const rows: [string, string][] = [
    ["Volume", paperVolume ?? (market ? volumeText(market.volume) : "—")],
    ["Traders", market ? String(market.participants ?? "—") : "—"],
  ];
  return (
    <section className="ud-card ud-statistics" aria-label="Statistics">
      <h2>Statistics</h2>
      {rows.map(([label, value]) => (
        <div className="ud-row" key={label}>
          <span>{label}</span>
          <i />
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </section>
  );
}

export function RulesCard({
  asset,
  minutes,
  market,
}: {
  asset: UpDownAsset;
  minutes: number;
  market: Market | null;
}) {
  return (
    <section className="ud-card ud-rules" aria-label="Rules summary">
      <details>
        <summary>Rules Summary</summary>
        <p className="ud-muted" style={{ lineHeight: 1.7, marginTop: 10 }}>
          {market?.resolutionCriteria ??
            `${ASSETS[asset].name} · ${durationLabel(minutes)} reference window. No prediction market is active for this window. Chart observations are not settlement evidence.`}
        </p>
        {market && (
          <a href={market.sourceUrl} target="_blank" rel="noopener noreferrer" className="ud-up">
            Source ↗
          </a>
        )}
      </details>
    </section>
  );
}

export function ActivityCard({ market }: { market: Market | null }) {
  if (market?.virtual)
    return (
      <section className="mt-7" aria-label="Your activity">
        <h2>Your activity</h2>
        <VirtualPortfolio
          deployment={market.virtual.deployment}
          marketId={market.virtual.onchainId}
          markets={[market]}
          tab="History"
        />
      </section>
    );
  if (market) return <NativeActivity marketId={market.id} />;
  return (
    <section className="mt-7" aria-label="Market activity">
      <h2 style={{ fontSize: 17, fontWeight: 650 }}>Activity</h2>
      <p className="ud-muted" style={{ marginTop: 10 }}>
        No trades yet.
      </p>
    </section>
  );
}

function MiniCard({
  asset,
  minutes,
  nowMs,
  label,
}: {
  asset: UpDownAsset;
  minutes: number;
  nowMs: number;
  label?: string;
}) {
  const start = windowStartFor(nowMs, minutes);
  const lookback = Math.ceil((minutes + 10) / 30) * 30;
  const spot = useQuery(spotWindowQueryOptions(asset, lookback, 30000));
  const live = useLivePrice(asset);
  const beat = priceToBeat(spot.data?.candles, start, (spot.data?.granularity ?? 60) * 1000);
  const delta = deltaInfo(live.price, beat);
  const left = formatCountdown(start + minutes * 60000 - nowMs);
  return (
    <Link
      to="/up-down/$asset"
      params={{ asset: slugOf(asset) }}
      search={{ d: minutes }}
      className="ud-mini"
    >
      <img src={cryptoLogoUrl(ASSETS[asset].logo)} alt="" />
      <p>{label ?? `${ASSETS[asset].name} - ${durationLabel(minutes)}`}</p>
      <small>
        {formatUsd(live.price, asset)}{" "}
        {delta && (
          <span
            className={
              delta.direction === "up" ? "ud-up" : delta.direction === "down" ? "ud-down" : ""
            }
          >
            {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : ""}{" "}
            {formatUsd(Math.abs(delta.abs), asset)}
          </span>
        )}
      </small>
      <small>Ends in {left}</small>
    </Link>
  );
}

/** Other assets in the same window length, plus this asset in the next window length. */
export function AlsoTrading({
  asset,
  minutes,
  nowMs,
}: {
  asset: UpDownAsset;
  minutes: number;
  nowMs: number;
}) {
  const others = ASSET_KEYS.filter((a) => a !== asset);
  const nextLength = DURATIONS[(DURATIONS.indexOf(minutes) + 1) % DURATIONS.length] ?? 5;
  return (
    <section className="mt-7" aria-label="People are also trading">
      <h2 style={{ fontSize: 17, fontWeight: 650 }}>People are also trading</h2>
      <div className="ud-rail">
        {others.map((a) => (
          <MiniCard key={a} asset={a} minutes={minutes} nowMs={nowMs} />
        ))}
        <MiniCard asset={asset} minutes={nextLength} nowMs={nowMs} />
        {others.map((a) => (
          <MiniCard key={`${a}-${nextLength}`} asset={a} minutes={nextLength} nowMs={nowMs} />
        ))}
      </div>
    </section>
  );
}
