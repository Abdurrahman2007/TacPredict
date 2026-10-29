import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Market } from "@/domain/markets/types";
import { NativeActivity } from "@/components/native-market-data";
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
  const ledger = usePaperLedger();
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

  return (
    <section className="ud-card" aria-label="Your positions">
      <div className="ud-tabs" role="group">
        {(["positions", "history"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "positions" ? "Positions" : "History"}
          </button>
        ))}
      </div>
      {tab === "positions" ? (
        open.length === 0 ? (
          <p className="ud-muted">No positions</p>
        ) : (
          open.map((p) => {
            const c = markOf(p.side);
            const mark = c != null ? p.shares * (c / 100) : p.shares * p.avgCost;
            const pnl = c != null ? mark - p.shares * p.avgCost : null;
            return (
              <div className="ud-row" key={p.id}>
                <span>
                  {p.side} · {p.shares.toFixed(2)} sh
                  {pnl != null ? (
                    <small style={{ display: "block", color: pnl >= 0 ? "#6dce95" : "#ff7b7b" }}>
                      PnL {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
                    </small>
                  ) : null}
                </span>
                <i />
                <span className="tabular-nums">${mark.toFixed(2)}</span>
              </div>
            );
          })
        )
      ) : history.length === 0 ? (
        <p className="ud-muted">No history</p>
      ) : (
        history.map((t) => (
          <div className="ud-row" key={t.id}>
            <span>
              {t.kind} {t.side}
              {t.realizedPnl != null ? (
                <small
                  style={{
                    display: "block",
                    color: t.realizedPnl >= 0 ? "#6dce95" : "#ff7b7b",
                  }}
                >
                  PnL {t.realizedPnl >= 0 ? "+" : "−"}${Math.abs(t.realizedPnl).toFixed(2)}
                </small>
              ) : null}
            </span>
            <i />
            <span className="tabular-nums">${t.usdc.toFixed(2)}</span>
          </div>
        ))
      )}
      <div className="ud-row" style={{ borderTop: "1px solid var(--ud-line)", marginTop: 8 }}>
        <span>
          Total
          {open.length > 0 && (upCents != null || downCents != null) ? (
            <small style={{ display: "block", color: uPnL >= 0 ? "#6dce95" : "#ff7b7b" }}>
              Unrealized {uPnL >= 0 ? "+" : "−"}${Math.abs(uPnL).toFixed(2)}
            </small>
          ) : null}
        </span>
        <i />
        <b className="tabular-nums">${total.toFixed(2)}</b>
        <Link to="/profile" className="ud-muted">
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
    return (
      <PaperPositionsBlock marketId={paperMarketId} upCents={upCents} downCents={downCents} />
    );
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
    ["Volume", paperVolume ?? (market ? volumeText(market.volume) : "$0")],
    ["Traders", market ? String(market.participants ?? 0) : "0"],
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
