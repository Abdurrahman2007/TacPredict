import { useEffect, useState } from "react";
import "@/styles/market-cards.css";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { CoinGeckoChart } from "@/components/updown/coingecko-chart";
import { clock, dayLabel, useNow, useTimeZone } from "@/lib/updown/use-clock";
import {
  ASSETS,
  DISPLAY_DURATIONS,
  durationLabel,
  formatCountdown,
  makeWindow,
  slugOf,
  windowStartFor,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { cryptoLogoUrl } from "@/lib/crypto-logo";
import { useQuery } from "@tanstack/react-query";
import { seriesCopyQueryOptions } from "@/lib/pool/pool-admin.functions";
import { copyFor } from "@/lib/pool/series-copy.mjs";
import { usePriceWindow } from "@/lib/updown/use-price-window";
import { useLivePrice } from "@/lib/updown/live-prices";
import { spotTickersQueryOptions } from "@/lib/updown/spot.functions";
import { spotShareOdds } from "@/lib/paper/spot-odds";
import { formatLiq } from "@/lib/paper/virtual-liquidity";
import { paperVolumeFor, usePaperLedger } from "@/lib/paper/ledger";
import { assetSettlementPolicy } from "@/lib/virtual/oracle-policy";
import { rememberPaperOpen, runPaperSettleTick } from "@/lib/paper/settle-robot";

/** 5/15/30m paper result robot — ticks while Up/Down home is mounted. */
function PaperSettleRobot() {
  const tickers = useQuery(spotTickersQueryOptions);
  useEffect(() => {
    const getPrice = (asset: UpDownAsset) => tickers.data?.prices[asset]?.price ?? null;
    runPaperSettleTick(getPrice);
    const id = window.setInterval(() => runPaperSettleTick(getPrice), 15_000);
    return () => window.clearInterval(id);
  }, [tickers.data]);
  return null;
}

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
  large,
}: {
  asset: UpDownAsset;
  minutes: number;
  nowMs: number;
  large: boolean;
}) {
  const info = ASSETS[asset];
  const zone = useTimeZone();
  const start = windowStartFor(nowMs, minutes);
  const w = makeWindow(start, minutes);
  const copy = copyFor(useQuery(seriesCopyQueryOptions).data, asset);
  const live = useLivePrice(asset, true);
  const pw = usePriceWindow(asset, w, nowMs, true);
  const spot = live.price ?? pw.series.at(-1)?.price ?? null;
  const beat =
    pw.boundary ??
    (pw.series.find((p) => p.time >= w.start)?.price ?? null);
  const remainingSec = Math.max(0, (w.end - nowMs) / 1000);
  const odds = spotShareOdds(spot, beat, minutes, remainingSec);
  const ledger = usePaperLedger();
  const marketId = `reference-${asset}-${w.start}-${minutes}`;
  const vol = paperVolumeFor(marketId, ledger.trades);
  const title = `${copy.title} - ${durationLabel(minutes)}`;
  const search = { d: minutes };
  const sameDay = dayLabel(w.start, zone) === dayLabel(w.end, zone);
  const upCents = odds ? `${Math.round(odds.up)}¢` : "—";
  const downCents = odds ? `${Math.round(odds.down)}¢` : "—";
  const settlement = assetSettlementPolicy(asset, minutes);

  useEffect(() => {
    if (beat != null) rememberPaperOpen(asset, minutes, w.start, beat);
  }, [asset, minutes, w.start, beat]);

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
            className="tp-crypto-title tp-card-hit"
          >
            <h3>{title}</h3>
          </Link>
          <p className="tp-crypto-time">
            {dayLabel(w.start, zone)}, {clock(w.start, zone)} –{" "}
            {sameDay ? "" : `${dayLabel(w.end, zone)}, `}
            {clock(w.end, zone)}
          </p>
        </div>
        <span className="ud-live tp-crypto-live" title="Live share prices track spot vs open">
          {formatCountdown(w.end - nowMs)}
        </span>
      </div>
      {large && <CoinGeckoChart asset={asset} window={w} summary dense />}

      <div className="tp-crypto-actions">
        <Link
          to="/up-down/$asset"
          params={{ asset: slugOf(asset) }}
          search={{ ...search, side: "up" }}
          className="ios-press flex min-h-12 items-center justify-center rounded-full text-sm font-bold text-white ud-outcome-up"
        >
          Up {upCents}
        </Link>
        <Link
          to="/up-down/$asset"
          params={{ asset: slugOf(asset) }}
          search={{ ...search, side: "down" }}
          className="ios-press flex min-h-12 items-center justify-center rounded-full text-sm font-bold text-white ud-outcome-down"
        >
          Down {downCents}
        </Link>
      </div>
      <div className="tp-crypto-footer">
        <span>Vol {formatLiq(vol)}</span>
        <span title={settlement.reasons.join(" · ")}>
          {settlement.tier === "unavailable"
            ? "Charts only"
            : settlement.tier === "paper_only"
              ? "Paper · no on-chain settle"
              : odds
                ? spot != null && beat != null
                  ? `${spot >= beat ? "▲" : "▼"} vs open`
                  : "Live ¢"
                : pw.pending
                  ? "Loading…"
                  : "Paper market"}
        </span>
      </div>
    </article>
  );
}

export function UpDownSection({
  snapshotTime,
  detailed = false,
  fixedMinutes,
  initialMinutes,
}: {
  markets: Market[];
  snapshotTime: string;
  detailed?: boolean;
  fixedMinutes?: number;
  initialMinutes?: number | undefined;
}) {
  const [chosenMinutes, setMinutes] = useState(initialMinutes ?? 5);
  const minutes = fixedMinutes ?? chosenMinutes;
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
      <PaperSettleRobot />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">
          {fixedMinutes === 60
            ? "Live · 1H"
            : fixedMinutes === 1440
              ? "Live · 24H"
              : "Trending Up & Down"}
        </h2>
        <Link
          to="/up-down"
          search={fixedMinutes ? { d: fixedMinutes } : {}}
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
          {DISPLAY_DURATIONS.map((d) => (
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
            large={large}
          />
        ))}
      </div>
    </section>
  );
}
