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

function MyPositions({ market }: { market: Market }) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const { user } = useProtocolUser();
  const portfolio = useNativePortfolio();
  const zone = useTimeZone();
  const positions = (portfolio.data?.positions ?? []).filter((p) => p.marketId === market.id);
  const history = (portfolio.data?.activity ?? []).filter((a) => a.marketId === market.id);
  const total = positions.reduce((sum, p) => sum + BigInt(p.valueAtomic ?? "0"), 0n);
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

export function PositionsCard({ market }: { market: Market | null }) {
  if (market) return <MyPositions market={market} />;
  return (
    <section className="ud-card" aria-label="Your positions">
      <div className="ud-tabs">
        <button type="button" aria-pressed="true">
          Positions
        </button>
        <button type="button" aria-pressed="false" disabled>
          History
        </button>
      </div>
      <p className="ud-muted">No positions</p>
      <div className="ud-row" style={{ borderTop: "1px solid var(--ud-line)", marginTop: 8 }}>
        <span>Total</span>
        <i />
        <b>$0</b>
      </div>
    </section>
  );
}

export function StatsCard({ market }: { market: Market | null }) {
  const rows: [string, string][] = [
    ["Open interest", usdcShort(market?.native?.openInterestAtomic)],
    ["Total volume", volumeText(market?.volume)],
    ["Traders", String(market?.participants ?? 0)],
    ["Settlement", "$1 per share if correct"],
  ];
  return (
    <section className="ud-card" aria-label="Statistics">
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
  const name = ASSETS[asset].name;
  return (
    <section className="ud-card" aria-label="Rules summary">
      <h2>Rules Summary</h2>
      <p className="ud-muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
        Each {durationLabel(minutes)} window compares the {name} price at the end of the window with
        its price at the start, the price to beat. Up wins if the end price is the same or higher.
        Down wins if it is lower. The chart and price to beat on this page use Coinbase{" "}
        {ASSETS[asset].product} prices.
      </p>
      {market ? (
        <p className="ud-muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
          {market.resolutionCriteria}{" "}
          <a href={market.sourceUrl} target="_blank" rel="noopener noreferrer" className="ud-up">
            Source ↗
          </a>
        </p>
      ) : (
        <p className="ud-muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
          There is no TacPredict market for this window yet, so it is shown for price tracking only.
        </p>
      )}
    </section>
  );
}

export function ActivityCard({ market }: { market: Market | null }) {
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
  const beat = priceToBeat(spot.data?.candles, start);
  const delta = deltaInfo(live.price, beat);
  const left = formatCountdown(start + minutes * 60000 - nowMs);
  return (
    <Link
      to="/up-down/$asset"
      params={{ asset: slugOf(asset) }}
      search={{ d: minutes }}
      className="ud-mini"
    >
      <img src={`/brand/crypto/${ASSETS[asset].logo}.svg`} alt="" />
      <p>{label ?? `${ASSETS[asset].name} - ${durationLabel(minutes)}`}</p>
      <small>
        {formatUsd(live.price, asset)}{" "}
        {delta && (
          <span className={delta.direction === "up" ? "ud-up" : delta.direction === "down" ? "ud-down" : ""}>
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
  const nextLength = minutes === 5 ? 15 : minutes === 15 ? 60 : 5;
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
