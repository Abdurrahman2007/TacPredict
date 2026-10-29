import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Market } from "@/domain/markets/types";
import { ArrowLeft } from "lucide-react";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { spotWindowQueryOptions } from "@/lib/updown/spot.functions";
import { useLivePrice } from "@/lib/updown/live-prices";
import { usePriceWindow } from "@/lib/updown/use-price-window";
import { poolConfigQueryOptions, poolRoundQueryOptions } from "@/lib/pool/pool.functions";
import { POOL_DURATIONS, fromScaled } from "@/lib/pool/pool.mjs";
import { seriesCopyQueryOptions } from "@/lib/pool/pool-admin.functions";
import { copyFor } from "@/lib/pool/series-copy.mjs";
import { clock, dayLabel, useNow, useTimeZone } from "@/lib/updown/use-clock";
import {
  ASSETS,
  deltaInfo,
  durationLabel,
  formatCountdown,
  formatUsd,
  matchNativeMarket,
  pastCountFor,
  priceToBeat,
  seriesForWindow,
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
import { PoolRoundCard, PoolRulesCard, PoolTradeBar } from "./pool-trade";
import { ActivityCard, AlsoTrading, PositionsCard, RulesCard, StatsCard } from "./sections";
import { cryptoLogoUrl } from "@/lib/crypto-logo";
import { spotShareOdds } from "@/lib/paper/spot-odds";
import { formatLiq } from "@/lib/paper/virtual-liquidity";
import { paperVolumeFor, usePaperLedger } from "@/lib/paper/ledger";
import { runPaperResultRobot } from "@/lib/paper/settle-robot";
import { assetSettlementPolicy } from "@/lib/virtual/oracle-policy";
import {
  matchVirtualUpDownMarket,
  resolveUpDownTradeMarket,
} from "@/lib/virtual/updown-virtual-bind";

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
  const [chartType, setChartType] = useState<"line" | "candles">("line");
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
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const live = useLivePrice(asset);
  const virtualMarket = matchVirtualUpDownMarket(feed.data?.markets, asset, w);
  const market =
    virtualMarket ??
    (feed.data?.virtualMode ? null : matchNativeMarket(feed.data?.markets, asset, w));

  const candles = spot.data?.candles;
  const gran = (spot.data?.granularity ?? 60) * 1000;
  const nativeBeat = priceToBeat(candles, w.start, gran);
  const nativeCurrent =
    state === "past"
      ? (windowResult(candles, w, gran)?.close ?? null)
      : (live.price ?? spot.data?.trades.at(-1)?.price ?? candles?.at(-1)?.close ?? null);
  const nativePoints = seriesForWindow({
    candles,
    trades: spot.data?.trades,
    ticks: live.ticks,
    w,
    nowMs,
    gran,
  });
  const result = state === "past" ? windowResult(candles, w, gran) : null;
  // Pool rounds (UpDownPool): the deciding price is CoinGecko, posted on-chain by the reporter.
  const poolConfig = useQuery(poolConfigQueryOptions);
  const poolOn = false; /* virtual-only product: legacy pool disabled */
  const poolRound = useQuery(poolRoundQueryOptions(asset, minutes, w.start, poolOn));
  const priceFeed = usePriceWindow(asset, w, nowMs, !poolOn);
  const poolBeat =
    poolRound.data && BigInt(poolRound.data.startPrice) > 0n
      ? fromScaled(poolRound.data.startPrice)
      : null;
  const poolEnd =
    poolRound.data && BigInt(poolRound.data.endPrice) > 0n
      ? fromScaled(poolRound.data.endPrice)
      : null;
  const geckoNow = priceFeed.series.at(-1)?.price ?? null;
  // Title and description the administrator saved for this coin (or the built-in default text).
  const savedCopy = useQuery({ ...seriesCopyQueryOptions, enabled: poolOn });
  const seriesCopy = copyFor(savedCopy.data, asset);

  const shownBeat =
    (poolOn ? poolBeat : market ? nativeBeat : priceFeed.boundary) ??
    priceFeed.boundary ??
    priceFeed.series.find((p) => p.time >= w.start)?.price ??
    null;
  const shownCurrent = poolOn
    ? state === "past"
      ? poolEnd
      : (live.price ?? geckoNow)
    : (live.price ?? (market ? nativeCurrent : geckoNow));
  const delta = deltaInfo(shownCurrent, shownBeat);

  const remaining = state === "live" ? w.end - nowMs : state === "upcoming" ? w.start - nowMs : 0;
  const countdown = formatCountdown(remaining);
  const title = `${poolOn ? seriesCopy.title : info.name} - ${durationLabel(minutes)}`;
  const sameDay = dayLabel(w.start, zone) === dayLabel(w.end, zone);
  const windowText = `${dayLabel(w.start, zone)}, ${clock(w.start, zone)} – ${sameDay ? "" : `${dayLabel(w.end, zone)}, `}${clock(w.end, zone)}`;

  const clockReady = nowMs > 0;
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
  }, [clockReady]);

  const deltaText = delta ? formatUsd(Math.abs(delta.abs), asset) : null;
  const poolResult =
    poolRound.data?.state === 1 ? (poolRound.data.result === 1 ? "Up" : "Down") : null;
  const settledResult = poolOn ? poolResult : market ? result?.outcome : null;
  const stateText =
    state === "live"
      ? `LIVE ${countdown}`
      : state === "upcoming"
        ? `IN ${countdown}`
        : settledResult
          ? settledResult
          : "ENDED";

  const island = {
    asset,
    label: title,
    stateText,
    live: state === "live",
    price: shownCurrent,
    deltaText,
    direction: delta?.direction ?? null,
  };
  // Live share prices: feed-v1 (spot, strike, time remaining) — never stale feed ¢.
  const remainingSec = state === "live" ? Math.max(0, (w.end - nowMs) / 1000) : 0;
  const odds = spotShareOdds(shownCurrent, shownBeat, minutes, remainingSec);
  const settlement = assetSettlementPolicy(asset, minutes);
  const paper = usePaperLedger();
  const referenceId = `reference-${asset}-${w.start}-${minutes}`;
  const paperVol = paperVolumeFor(referenceId, paper.trades);
  const reference: Market = {
    id: referenceId,
    title,
    category: "Crypto",
    startsAt: new Date(w.start).toISOString(),
    endsAt: new Date(w.end).toISOString(),
    closesAt: windowText,
    volume: formatLiq(paperVol),
    participants: paper.trades.filter((t) => t.marketId === referenceId && t.kind === "buy").length,
    outcomes: [
      {
        id: "0",
        label: "Up",
        probability: odds?.up ?? 50,
        probabilityKnown: Boolean(odds),
      },
      {
        id: "1",
        label: "Down",
        probability: odds?.down ?? 50,
        probabilityKnown: Boolean(odds),
      },
    ],
    description: "Virtual USDC paper window. Share prices move with live spot vs open.",
    source: `Coinbase ${info.product}`,
    sourceUrl: `https://exchange.coinbase.com/trade/${info.product}`,
    resolutionCriteria:
      "Paper Virtual USDC only. Up/Down share prices follow live spot versus the window open price.",
  };
  const paperTradeMarket = odds
    ? {
        ...reference,
        outcomes: [
          { id: "0", label: "Up", probability: odds.up, probabilityKnown: true },
          { id: "1", label: "Down", probability: odds.down, probabilityKnown: true },
        ],
      }
    : reference;
  const resolved = resolveUpDownTradeMarket({
    virtualMarket,
    paperMarket: paperTradeMarket,
  });
  const tradeMarket = resolved.market;
  const onchain = resolved.mode === "onchain";

  // 5m+ paper result robot: settle once when past + verified start/end spots exist.
  useEffect(() => {
    if (onchain) return;
    if (state !== "past" || shownBeat == null || shownCurrent == null) return;
    runPaperResultRobot({
      marketId: referenceId,
      startPrice: shownBeat,
      endPrice: shownCurrent,
      closedAtIso: new Date(w.end).toISOString(),
    });
  }, [onchain, state, shownBeat, shownCurrent, referenceId, w.end]);

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
          <img src={cryptoLogoUrl(info.logo)} alt={`${info.name} logo`} />
          <div>
            <h1 className="ud-title">{title}</h1>
            <p className="ud-sub">{windowText}</p>
          </div>
          <div className="ud-countdown" data-state={state} aria-live="off">
            {state === "upcoming" && <span className="ud-countdown-label">Starts in</span>}
            {state === "past" ? (settledResult ?? "Ended") : countdown}
          </div>
        </div>

        <dl className="ud-prices">
          <div>
            <dt
              title={
                poolOn
                  ? "Reported round start price"
                  : "Reference observation; settlement follows the market rules"
              }
            >
              Price to beat
            </dt>
            <dd>
              {shownBeat !== null
                ? formatUsd(shownBeat, asset)
                : state === "upcoming"
                  ? "Set at start"
                  : poolOn
                    ? "Waiting for the reading"
                    : priceFeed.pending
                      ? "Loading…"
                      : "Pending"}
            </dd>
          </div>
          <div>
            <dt>
              {state === "past"
                ? poolOn || market
                  ? "Final price"
                  : "Last price"
                : "Current price"}
            </dt>
            <dd>
              {shownCurrent !== null
                ? formatUsd(shownCurrent, asset)
                : priceFeed.pending
                  ? "Loading…"
                  : "—"}
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

      <CoinGeckoChart
        asset={asset}
        window={w}
        chartType={chartType}
        evidence={
          poolOn
            ? { points: priceFeed.series, beat: poolBeat, source: "Reported round reference" }
            : market
              ? { points: nativePoints, beat: nativeBeat, source: "Coinbase" }
              : undefined
        }
      />
      <WindowPills
        asset={asset}
        minutes={minutes}
        nowMs={nowMs}
        selected={w}
        candles={poolOn || !market ? undefined : split ? history.data?.candles : candles}
        gran={((split ? history.data?.granularity : spot.data?.granularity) ?? 60) * 1000}
        pastCount={pastCountFor(minutes)}
        chartType={chartType}
        onToggleChart={() => setChartType((t) => (t === "line" ? "candles" : "line"))}
      />

      {poolOn && poolConfig.data ? (
        <>
          <PoolRoundCard
            asset={asset}
            minutes={minutes}
            startMs={w.start}
            nowMs={nowMs}
            config={poolConfig.data}
            round={poolRound.data ?? null}
          />
          <PoolRulesCard
            asset={asset}
            minutes={minutes}
            feeBps={poolRound.data?.feeBps || poolConfig.data.feeBps}
          />
          <AlsoTrading asset={asset} minutes={minutes} nowMs={nowMs} />
        </>
      ) : (
        <>
          <PositionsCard
            market={onchain ? tradeMarket : null}
            {...(onchain
              ? {}
              : {
                  paperMarketId: paperTradeMarket.id,
                  upCents: odds?.up ?? null,
                  downCents: odds?.down ?? null,
                })}
          />
          <StatsCard
            market={tradeMarket}
            {...(onchain ? {} : { paperVolume: formatLiq(paperVol) })}
          />
          <RulesCard asset={asset} minutes={minutes} market={tradeMarket} />
          <AlsoTrading asset={asset} minutes={minutes} nowMs={nowMs} />
          <ActivityCard market={onchain ? tradeMarket : null} />
        </>
      )}

      <UpDownIsland
        show={islandOn}
        asset={asset}
        label={title}
        stateText={stateText}
        live={state === "live"}
        price={shownCurrent}
        deltaText={deltaText}
        direction={delta?.direction ?? null}
      />
      {poolOn && poolConfig.data ? (
        <PoolTradeBar
          asset={asset}
          minutes={minutes}
          startMs={w.start}
          nowMs={nowMs}
          config={poolConfig.data}
          round={poolRound.data ?? null}
          context={island}
        />
      ) : (
        <UpDownTradeBar
          market={tradeMarket}
          reference={paperTradeMarket}
          context={island}
          initialSide={initialSide}
          tradingAllowed={
            onchain
              ? state === "live"
              : settlement.paperTradingAllowed && state === "live"
          }
          settlementNote={
            onchain
              ? `On-chain Virtual USDC · ${settlement.label}`
              : settlement.label
          }
        />
      )}
    </div>
  );
}
