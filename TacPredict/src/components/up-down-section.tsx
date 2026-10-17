import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { UpDownChart } from "@/components/updown/updown-chart";
import { cents, usdcShort, volumeText } from "@/lib/protocol/display.mjs";
import { useLivePrice } from "@/lib/updown/live-prices";
import { spotWindowQueryOptions } from "@/lib/updown/spot.functions";
import { clock, dayLabel, useNow, useTimeZone } from "@/lib/updown/use-clock";
import {
  ASSETS,
  DURATIONS,
  deltaInfo,
  durationLabel,
  formatCountdown,
  formatUsd,
  makeWindow,
  matchNativeMarket,
  priceToBeat,
  seriesForWindow,
  slugOf,
  thin,
  windowStartFor,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";

const CARDS: { asset: UpDownAsset; large: boolean }[] = [
  { asset: "bitcoin", large: true },
  { asset: "ethereum", large: true },
  { asset: "solana", large: true },
  { asset: "bnb", large: true },
];

function AssetCard({
  asset,
  minutes,
  nowMs,
  markets,
  large,
}: {
  asset: UpDownAsset;
  minutes: number;
  nowMs: number;
  markets: Market[];
  large: boolean;
}) {
  const info = ASSETS[asset];
  const zone = useTimeZone();
  const start = windowStartFor(nowMs, minutes);
  const w = makeWindow(start, minutes);
  const lookback = Math.ceil((minutes + 10) / 30) * 30;
  const spot = useQuery(spotWindowQueryOptions(asset, lookback, 10000));
  const live = useLivePrice(asset);
  const candles = spot.data?.candles;
  const trades = spot.data?.trades;
  const gran = (spot.data?.granularity ?? 60) * 1000;
  const beat = priceToBeat(candles, start, gran);
  const current =
    live.price ?? trades?.[trades.length - 1]?.price ?? candles?.[candles.length - 1]?.close ?? null;
  const delta = deltaInfo(current, beat);
  const nowSec = Math.floor(nowMs / 1000);
  const series = useMemo(
    () =>
      large
        ? thin(
            seriesForWindow({ candles, trades, ticks: live.ticks, w: { start, end: start + minutes * 60000, minutes }, nowMs: nowSec * 1000, gran }),
            200,
          )
        : [],
    [large, candles, trades, live.ticks, start, minutes, nowSec, gran],
  );
  const market = matchNativeMarket(markets, asset, w);
  const up = market?.outcomes.find((o) => /^up$/i.test(o.label)) ?? market?.outcomes[0];
  const down = market?.outcomes.find((o) => /^down$/i.test(o.label)) ?? market?.outcomes[1];
  const title = `${info.name} - ${durationLabel(minutes)}`;
  const search = { d: minutes };
  const sameDay = dayLabel(w.start, zone) === dayLabel(w.end, zone);

  return (
    <article
      className="overflow-hidden rounded-[26px] border border-border bg-card p-5 sm:p-6"
      aria-label={`${info.name} Up or Down`}
    >
      <div className="flex items-center gap-3">
        <img src={`/brand/crypto/${info.logo}.svg`} alt={`${info.name} logo`} className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">
            <Link to="/up-down/$asset" params={{ asset: slugOf(asset) }} search={search}>
              {title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {clock(w.start, zone)} – {sameDay ? "" : `${dayLabel(w.end, zone)}, `}
            {clock(w.end, zone)}
          </p>
        </div>
        <span className="ud-live shrink-0 text-xs font-semibold tabular-nums">
          LIVE {formatCountdown(w.end - nowMs)}
        </span>
      </div>

      {large && (
        <Link to="/up-down/$asset" params={{ asset: slugOf(asset) }} search={search} className="mt-3 block">
          <UpDownChart w={w} series={series} beat={beat} asset={asset} live={live.status === "live"} />
        </Link>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Price to beat</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {beat !== null ? formatUsd(beat, asset) : spot.isPending ? "Loading…" : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Current price</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {current !== null ? formatUsd(current, asset) : live.status === "connecting" || spot.isPending ? "Loading…" : "Unavailable"}
            {delta && (
              <span className={`ml-2 text-xs ${delta.direction === "up" ? "ud-up" : delta.direction === "down" ? "ud-down" : ""}`}>
                {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : ""} {formatUsd(Math.abs(delta.abs), asset)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            ["Up", up],
            ["Down", down],
          ] as const
        ).map(([label, outcome]) => (
          <Link
            key={label}
            to="/up-down/$asset"
            params={{ asset: slugOf(asset) }}
            search={search}
            className={`ios-press flex min-h-12 items-center justify-center rounded-full text-sm font-bold text-white ${label === "Up" ? "bg-[#1f9d62]" : "bg-[#d4515c]"}`}
          >
            {label} {cents(outcome)}
          </Link>
        ))}
      </div>
      <div className="mt-4 flex justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
        <span>{usdcShort(market?.native?.openInterestAtomic)} OI</span>
        <span>{volumeText(market?.volume)} Vol</span>
      </div>
    </article>
  );
}

export function UpDownSection({
  markets,
  snapshotTime,
  detailed = false,
}: {
  markets: Market[];
  snapshotTime: string;
  detailed?: boolean;
}) {
  const [minutes, setMinutes] = useState(5);
  const nowMs = useNow(Date.parse(snapshotTime) || 0);
  return (
    <section className={detailed ? "" : "mt-5"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">Up &amp; Down</h2>
        <Link
          to="/up-down"
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground"
        >
          View more
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="mb-4 inline-flex gap-1 rounded-full border border-border bg-card p-1" role="group" aria-label="Window length">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={minutes === d}
            onClick={() => setMinutes(d)}
            className={`min-h-9 rounded-full px-4 text-sm font-semibold ${minutes === d ? "bg-[#e8edf3] text-[#0f161a]" : "text-muted-foreground"}`}
          >
            {durationLabel(d)}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map(({ asset, large }) => (
          <AssetCard key={asset} asset={asset} minutes={minutes} nowMs={nowMs} markets={markets} large={large} />
        ))}
      </div>
    </section>
  );
}
