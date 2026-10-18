import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Market } from "@/domain/markets/types";
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
  pastCountFor,
  priceToBeat,
  resolveWindow,
  slugOf,
  windowResult,
  windowState,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { CoinGeckoChart } from "./coingecko-chart";
import { WindowPills } from "./window-pills";
import { UpDownIsland } from "./island";
import { UpDownTradeBar } from "./trade-bar";
import { ActivityCard, AlsoTrading, PositionsCard, RulesCard, StatsCard } from "./sections";

/** Keeps the query key steady while the clock moves; long look-backs round to whole hours. */
function lookbackFor(needed: number) {
  const step = needed > 300 ? 60 : 30;
  return Math.min(18000, Math.max(30, Math.ceil(needed / step) * step));
}

export function UpDownDetail({
  asset,
  minutes,
  windowParam,
  loadedAt,
  initialSide,
}: {
  asset: UpDownAsset;
  minutes: number;
  windowParam: number | undefined;
  loadedAt: number;
  initialSide?: "up" | "down" | undefined;
}) {
  const info = ASSETS[asset];
  const nowMs = useNow(loadedAt);
  const zone = useTimeZone();
  const w = resolveWindow(windowParam, nowMs, minutes);
  const state = windowState(w, nowMs);

  // Short windows use one request for the chart and the "Past" list. Long windows (1h and up)
  // use a second, coarser request for the list so the chart keeps fine candles.
  const chartNeeded = Math.ceil((nowMs - w.start) / 60000) + 10;
  const pastNeeded = minutes * (pastCountFor(minutes) + 1) + 10;
  const split = minutes >= 60;
  const spot = useQuery(
    spotWindowQueryOptions(
      asset,
      lookbackFor(split ? chartNeeded : Math.max(chartNeeded, pastNeeded)),
    ),
  );
  const history = useQuery({
    ...spotWindowQueryOptions(asset, lookbackFor(pastNeeded), 30000),
    enabled: split && nowMs > 0,
  });
  const live = useLivePrice(asset);
  const feed = useQuery(nativeMarketFeedQueryOptions);

  const candles = spot.data?.candles;
  const gran = (spot.data?.granularity ?? 60) * 1000;
  const beat = priceToBeat(candles, w.start, gran);
  const result = state === "past" ? windowResult(candles, w, gran) : null;
  const lastTrade = spot.data?.trades[spot.data.trades.length - 1]?.price ?? null;
  const lastCandle = candles?.[candles.length - 1]?.close ?? null;
  const current =
    state === "past" ? (result?.close ?? null) : (live.price ?? lastTrade ?? lastCandle);
  const delta = deltaInfo(current, beat);
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
    const observer = new IntersectionObserver(
      ([entry]) => setIslandOn(entry ? !entry.isIntersecting : false),
      {
        rootMargin: "-72px 0px 0px 0px",
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nowMs > 0]);

  const deltaText = delta ? formatUsd(Math.abs(delta.abs), asset) : null;
  const stateText =
    state === "live"
      ? `LIVE ${countdown}`
      : state === "upcoming"
        ? `IN ${countdown}`
        : result
          ? result.outcome
          : "ENDED";

  const island = {
    asset,
    label: title,
    stateText,
    live: state === "live",
    price: current,
    deltaText,
    direction: delta?.direction ?? null,
  };
  // View metadata only. No database insert, contract ID, invented probability or execution access.
  const reference: Market = {
    id: `reference-${asset}-${w.start}-${minutes}`,
    title,
    category: "Crypto",
    startsAt: new Date(w.start).toISOString(),
    endsAt: new Date(w.end).toISOString(),
    closesAt: windowText,
    volume: "0",
    participants: 0,
    outcomes: [
      { id: "0", label: "Up", probability: 0, probabilityKnown: false },
      { id: "1", label: "Down", probability: 0, probabilityKnown: false },
    ],
    description: "Coinbase price window only. No on-chain market for this window yet.",
    source: `Coinbase ${info.product}`,
    sourceUrl: `https://exchange.coinbase.com/trade/${info.product}`,
    resolutionCriteria:
      "Price tracking only. No executable quote or settlement contract exists for this reference window.",
  };
  if (!nowMs)
    return (
      <div className="ud-page ud-loading" role="status" aria-label="Loading price window">
        <div className="ud-skeleton ud-skeleton-title" />
        <div className="ud-skeleton ud-skeleton-chart" />
        Loading price window…
      </div>
    );
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
          <div className="ud-countdown" data-state={state} aria-live="off">
            {state === "past" ? (result ? result.outcome : "Ended") : countdown}
          </div>
        </div>

        <dl className="ud-prices">
          <div>
            <dt>Oracle price to beat · Coinbase</dt>
            <dd>
              {beat !== null
                ? formatUsd(beat, asset)
                : state === "upcoming"
                  ? "Set at start"
                  : spot.isPending
                    ? "Loading…"
                    : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>{state === "past" ? "Oracle final · Coinbase" : "Oracle reference · Coinbase"}</dt>
            <dd>
              {current !== null
                ? formatUsd(current, asset)
                : live.status === "connecting" || spot.isPending
                  ? "Loading…"
                  : "Unavailable"}
              {delta && deltaText && (
                <span className="ud-delta" data-dir={delta.direction}>
                  {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : ""}{" "}
                  {deltaText}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <CoinGeckoChart asset={asset} window={w} />
      <p className="cg-chart-note">
        Chart: CoinGecko. Oracle/reference values above: Coinbase {info.product}. Providers may
        differ; the chart never finalizes a result.
      </p>

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

      <WindowPills
        asset={asset}
        minutes={minutes}
        nowMs={nowMs}
        selected={w}
        candles={split ? history.data?.candles : candles}
        gran={((split ? history.data?.granularity : spot.data?.granularity) ?? 60) * 1000}
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
      <UpDownTradeBar
        market={market}
        reference={reference}
        context={island}
        initialSide={initialSide}
      />
    </div>
  );
}
