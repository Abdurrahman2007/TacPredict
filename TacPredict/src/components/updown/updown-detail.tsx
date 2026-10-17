import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { spotWindowQueryOptions } from "@/lib/updown/spot.functions";
import { useLivePrice } from "@/lib/updown/live-prices";
import { clock, dayLabel, useNow, useTimeZone } from "@/lib/updown/use-clock";
import {
  ASSETS,
  DURATIONS,
  deltaInfo,
  durationLabel,
  formatCountdown,
  formatUsd,
  matchNativeMarket,
  priceToBeat,
  resolveWindow,
  seriesForWindow,
  slugOf,
  thin,
  windowResult,
  windowState,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { UpDownChart } from "./updown-chart";
import { WindowPills } from "./window-pills";
import { UpDownIsland } from "./island";
import { UpDownTradeBar } from "./trade-bar";
import { ActivityCard, AlsoTrading, PositionsCard, RulesCard, StatsCard } from "./sections";

function pastCountFor(minutes: number) {
  return minutes >= 60 ? 3 : 12;
}

export function UpDownDetail({
  asset,
  minutes,
  windowParam,
  loadedAt,
}: {
  asset: UpDownAsset;
  minutes: number;
  windowParam: number | undefined;
  loadedAt: number;
}) {
  const info = ASSETS[asset];
  const nowMs = useNow(loadedAt);
  const zone = useTimeZone();
  const w = resolveWindow(windowParam, nowMs, minutes);
  const state = windowState(w, nowMs);

  // One request covers the selected window, the "Past" list and the chart; quantized so the
  // query key stays stable as the clock moves.
  const needed = Math.max(minutes * pastCountFor(minutes) + 10, Math.ceil((nowMs - w.start) / 60000) + 10);
  const lookback = Math.min(240, Math.ceil(needed / 30) * 30);
  const spot = useQuery(spotWindowQueryOptions(asset, lookback));
  const live = useLivePrice(asset);
  const feed = useQuery(nativeMarketFeedQueryOptions);

  const candles = spot.data?.candles;
  const beat = priceToBeat(candles, w.start);
  const result = state === "past" ? windowResult(candles, w) : null;
  const lastTrade = spot.data?.trades[spot.data.trades.length - 1]?.price ?? null;
  const lastCandle = candles?.[candles.length - 1]?.close ?? null;
  const current = state === "past" ? (result?.close ?? null) : (live.price ?? lastTrade ?? lastCandle);
  const delta = deltaInfo(current, beat);
  const nowSec = Math.floor(nowMs / 1000);
  const trades = spot.data?.trades;
  const series = useMemo(
    () =>
      thin(
        seriesForWindow({
          candles,
          trades,
          ticks: live.ticks,
          w: { start: w.start, end: w.end, minutes },
          nowMs: nowSec * 1000,
        }),
        260,
      ),
    [candles, trades, live.ticks, w.start, w.end, minutes, nowSec],
  );
  const market = matchNativeMarket(feed.data?.markets, asset, w);

  const remaining = state === "live" ? w.end - nowMs : state === "upcoming" ? w.start - nowMs : 0;
  const countdown = formatCountdown(remaining);
  const title = `${info.name} - ${durationLabel(minutes)}`;
  const sameDay = dayLabel(w.start, zone) === dayLabel(w.end, zone);
  const windowText = `${dayLabel(w.start, zone)}, ${clock(w.start, zone)} – ${sameDay ? "" : `${dayLabel(w.end, zone)}, `}${clock(w.end, zone)}`;

  const hero = useRef<HTMLDivElement>(null);
  const [islandOn, setIslandOn] = useState(false);
  useEffect(() => {
    const el = hero.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIslandOn(entry ? !entry.isIntersecting : false), {
      rootMargin: "-72px 0px 0px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const deltaText = delta ? formatUsd(Math.abs(delta.abs), asset) : null;
  const stateText =
    state === "live" ? `LIVE ${countdown}` : state === "upcoming" ? `IN ${countdown}` : result ? result.outcome : "ENDED";
  const error = spot.isError && !spot.data;

  return (
    <div className="ud-page animate-enter">
      <Link to="/up-down" className="ud-back">
        <ArrowLeft size={16} /> Up/Down
      </Link>

      <div ref={hero}>
        <div className="ud-title-row">
          <img src={`/brand/crypto/${info.logo}.svg`} alt={`${info.name} logo`} />
          <div>
            <h1 className="ud-title">{title}</h1>
            <p className="ud-sub">{windowText}</p>
          </div>
        </div>

        <nav className="ud-durations" aria-label="Window length">
          {DURATIONS.map((d) => (
            <Link
              key={d}
              to="/up-down/$asset"
              params={{ asset: slugOf(asset) }}
              search={{ d }}
              aria-current={d === minutes ? "page" : undefined}
            >
              {durationLabel(d)}
            </Link>
          ))}
        </nav>

        <div className="ud-countdown" data-state={state} aria-live="off">
          {state === "past" ? (result ? result.outcome : "Ended") : countdown}
          <small>
            {state === "live" ? "Remaining" : state === "upcoming" ? "Until start" : result ? "Result" : "Window ended"}
          </small>
        </div>

        <dl className="ud-prices">
          <div>
            <dt>Price to beat</dt>
            <dd>{beat !== null ? formatUsd(beat, asset) : state === "upcoming" ? "Set at start" : spot.isPending ? "Loading…" : "Unavailable"}</dd>
          </div>
          <div>
            <dt>{state === "past" ? "Final price" : "Current price"}</dt>
            <dd>
              {current !== null ? formatUsd(current, asset) : live.status === "connecting" || spot.isPending ? "Loading…" : "Unavailable"}
              {delta && deltaText && (
                <span className="ud-delta" data-dir={delta.direction}>
                  {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : ""} {deltaText}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {error ? (
        <div className="ud-chart ud-chart-empty">
          <div style={{ textAlign: "center" }}>
            Live price is unavailable right now.
            <br />
            <button type="button" className="ud-up" onClick={() => void spot.refetch()}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <UpDownChart w={w} series={series} beat={beat} asset={asset} live={state === "live" && live.status === "live"} />
      )}
      <p className="ud-muted" style={{ marginTop: 6, fontSize: 12 }}>
        Prices from Coinbase {info.product}
        {live.status === "live" ? " · live" : live.status === "offline" ? " · refreshing every few seconds" : ""}
      </p>

      <WindowPills
        asset={asset}
        minutes={minutes}
        nowMs={nowMs}
        selected={w}
        candles={candles}
        pastCount={pastCountFor(minutes)}
      />

      <PositionsCard market={market} />
      <StatsCard market={market} />
      <RulesCard asset={asset} minutes={minutes} market={market} />
      <AlsoTrading asset={asset} minutes={minutes} nowMs={nowMs} />
      <ActivityCard market={market} />

      <UpDownIsland
        show={islandOn}
        asset={asset}
        label={title}
        stateText={stateText}
        live={state === "live"}
        price={current}
        deltaText={deltaText}
        direction={delta?.direction ?? null}
      />
      <UpDownTradeBar market={market} />
    </div>
  );
}
