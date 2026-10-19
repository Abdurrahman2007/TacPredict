import { useState } from "react";
import "@/styles/market-cards.css";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { CoinGeckoChart } from "@/components/updown/coingecko-chart";
import { cents, usdcShort, volumeText } from "@/lib/protocol/display.mjs";
import { clock, dayLabel, useNow, useTimeZone } from "@/lib/updown/use-clock";
import {
  ASSETS,
  DURATIONS,
  durationLabel,
  formatCountdown,
  makeWindow,
  matchNativeMarket,
  slugOf,
  windowStartFor,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { cryptoLogoUrl } from "@/lib/crypto-logo";

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
  const market = matchNativeMarket(markets, asset, w);
  const up = market?.outcomes.find((o) => /^up$/i.test(o.label)) ?? market?.outcomes[0];
  const down = market?.outcomes.find((o) => /^down$/i.test(o.label)) ?? market?.outcomes[1];
  const title = `${info.name} Up or Down - ${durationLabel(minutes)}`;
  const search = { d: minutes };
  const sameDay = dayLabel(w.start, zone) === dayLabel(w.end, zone);

  return (
    <article className="ud-home-card tp-card" aria-label={`${info.name} Up or Down`}>
      <div className="tp-crypto-heading">
        <img
          src={cryptoLogoUrl(info.logo)}
          alt={`${info.name} logo`}
          className="size-8 shrink-0 rounded-full"
        />
        <div className="tp-crypto-copy">
          <Link
            to="/up-down/$asset"
            params={{ asset: slugOf(asset) }}
            search={search}
            className="tp-crypto-title"
          >
            <h3>{title}</h3>
          </Link>
          <p className="tp-crypto-time">
            {dayLabel(w.start, zone)}, {clock(w.start, zone)} –{" "}
            {sameDay ? "" : `${dayLabel(w.end, zone)}, `}
            {clock(w.end, zone)}
          </p>
        </div>
        <span className="ud-live tp-crypto-live">LIVE {formatCountdown(w.end - nowMs)}</span>
      </div>
      {large && <CoinGeckoChart asset={asset} window={w} summary />}

      <div className="tp-crypto-actions">
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
            search={{ ...search, side: label.toLowerCase() as "up" | "down" }}
            className={`ios-press flex min-h-12 items-center justify-center rounded-full text-sm font-bold text-white ${label === "Up" ? "ud-outcome-up" : "ud-outcome-down"}`}
          >
            {label} {cents(outcome)}
          </Link>
        ))}
      </div>
      <div className="tp-crypto-footer">
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
  if (!nowMs)
    return (
      <section className="ud-loading" role="status" aria-label="Loading Up/Down windows">
        <div className="ud-skeleton ud-skeleton-title" />
        <div className="ud-home-grid grid gap-4 sm:grid-cols-2">
          {CARDS.map(({ asset }) => (
            <div key={asset} className="ud-skeleton ud-skeleton-chart" />
          ))}
        </div>
      </section>
    );
  return (
    <section className={detailed ? "" : "mt-5"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">
          Trending Up &amp; Down
        </h2>
        <Link
          to="/up-down"
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground"
        >
          View more
          <ChevronRight className="size-4" />
        </Link>
      </div>
      {detailed && (
        <div
          className="ud-home-durations mb-4 flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1"
          role="group"
          aria-label="Window length"
        >
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={minutes === d}
              onClick={() => setMinutes(d)}
              className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold ${minutes === d ? "bg-[#e8edf3] text-[#0f161a]" : "text-muted-foreground"}`}
            >
              {durationLabel(d)}
            </button>
          ))}
        </div>
      )}
      <div className="ud-home-grid grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ asset, large }) => (
          <AssetCard
            key={asset}
            asset={asset}
            minutes={minutes}
            nowMs={nowMs}
            markets={markets}
            large={large}
          />
        ))}
      </div>
    </section>
  );
}
