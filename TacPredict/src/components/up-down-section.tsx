import { useEffect, useState } from "react";
import "@/styles/market-cards.css";
import { Link } from "@tanstack/react-router";
import type { Market } from "@/domain/markets/types";
import { CoinGeckoChart } from "@/components/updown/coingecko-chart";
import { useNow } from "@/lib/updown/use-clock";
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
import { useSticky } from "@/lib/ui/use-sticky";

/** Paper settlement tick — ticks while Up/Down home is mounted. New windows are 5 / 30 min; legacy 15 min positions still settle. */
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

/** World-style shimmer placeholder with the same shape as a live card. */
export function HomeCardSkeleton() {
  return (
    <div className="tp-skel-card" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="tp-skel" style={{ width: 34, height: 34, borderRadius: 999 }} />
        <div className="tp-skel" style={{ width: "48%", height: 20 }} />
        <div className="tp-skel ml-auto" style={{ width: 70, height: 18 }} />
      </div>
      <div className="mt-6 flex justify-between gap-4">
        <div className="tp-skel" style={{ width: "38%", height: 34 }} />
        <div className="tp-skel" style={{ width: "38%", height: 34 }} />
      </div>
      <div className="tp-skel mt-5" style={{ height: 150, borderRadius: 18 }} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="tp-skel" style={{ height: 56, borderRadius: 18 }} />
        <div className="tp-skel" style={{ height: 56, borderRadius: 18 }} />
      </div>
    </div>
  );
}

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
  const start = windowStartFor(nowMs, minutes);
  const w = makeWindow(start, minutes);
  const copy = copyFor(useQuery(seriesCopyQueryOptions).data, asset);
  const live = useLivePrice(asset, true);
  const pw = usePriceWindow(asset, w, nowMs, true);
  // Odds use the same Now/Beat the card displays, so the share price never
  // disagrees with the chart above it. Live ticks still flow into the series,
  // and the 1-second clock makes the price move toward 99¢/1¢ as time runs out.
  // Sticky per window: a refetch or socket reconnect must not blink the share price to "—".
  const windowKey = `${asset}-${minutes}-${w.start}`;
  const spot = useSticky(pw.series.at(-1)?.price ?? live.price ?? null, windowKey);
  const beat = useSticky(
    pw.boundary ?? pw.series.find((p) => p.time >= w.start)?.price ?? null,
    windowKey,
  );
  const remainingSec = Math.max(0, (w.end - nowMs) / 1000);
  const odds = useSticky(spotShareOdds(spot, beat, minutes, remainingSec), windowKey);
  const ledger = usePaperLedger();
  const marketId = `reference-${asset}-${w.start}-${minutes}`;
  const vol = paperVolumeFor(marketId, ledger.trades);
  const title = `${copy.title} - ${durationLabel(minutes)}`;
  const search = { d: minutes };
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
        </div>
        <span
          className="ud-live tp-crypto-live"
          title="Time left in this window (hours:minutes:seconds, or minutes:seconds)"
          aria-label={`Time left in this window: ${formatCountdown(w.end - nowMs)}`}
        >
          Ends in {formatCountdown(w.end - nowMs)}
        </span>
      </div>
      {large && <CoinGeckoChart asset={asset} window={w} summary dense />}

      <div className="tp-crypto-actions">
        <Link
          to="/up-down/$asset"
          params={{ asset: slugOf(asset) }}
          search={{ ...search, side: "up" }}
          className="ios-press flex min-h-14 items-center justify-center rounded-2xl text-base font-bold text-white ud-outcome-up"
        >
          Up {upCents}
        </Link>
        <Link
          to="/up-down/$asset"
          params={{ asset: slugOf(asset) }}
          search={{ ...search, side: "down" }}
          className="ios-press flex min-h-14 items-center justify-center rounded-2xl text-base font-bold text-white ud-outcome-down"
        >
          Down {downCents}
        </Link>
      </div>
      <div className="tp-crypto-footer">
        <span>Vol {formatLiq(vol)}</span>
        {settlement.tier === "paper_only" ? null : (
          <span>{settlement.tier === "unavailable" ? "Charts only" : "Live"}</span>
        )}
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
      <section className="mt-5" role="status" aria-label="Loading Up/Down windows">
        <div className="mb-4 flex items-center justify-between">
          <div className="tp-skel" style={{ width: 190, height: 24 }} />
          <div className="tp-skel" style={{ width: 96, height: 40, borderRadius: 999 }} />
        </div>
        <div className="tp-skel mb-3" style={{ height: 52, borderRadius: 999 }} />
        <div className="ud-home-grid grid gap-4 sm:grid-cols-2">
          {CARDS.slice(0, 2).map(({ asset }) => (
            <HomeCardSkeleton key={asset} />
          ))}
        </div>
      </section>
    );
  return (
    <section className={detailed ? "" : "mt-5"}>
      <PaperSettleRobot />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">
          {fixedMinutes ? `Live · ${durationLabel(fixedMinutes)}` : "Trending Up & Down"}
        </h2>
      </div>
      {!fixedMinutes && (
        <>
          <div
            className="mb-3 flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1"
            role="group"
            aria-label="Market category"
          >
            {(["All Crypto", "BTC", "ETH", "SOL", "BNB"] as const).map((label) => (
              <span
                key={label}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold inline-flex items-center ${
                  label === "All Crypto"
                    ? "bg-[#e8edf3] text-[#0f161a]"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
            {(["Politics", "Sports"] as const).map((label) => (
              <span
                key={label}
                className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold inline-flex items-center gap-1.5 text-muted-foreground/70"
                title={`${label} markets launch soon`}
              >
                {label}
                <em className="not-italic rounded-full border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Soon
                </em>
              </span>
            ))}
          </div>
          <div
            className="ud-home-durations tp-duration-segmented mb-3 flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1"
            role="group"
            aria-label="Window length"
          >
            {DISPLAY_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={minutes === d}
                onClick={() => setMinutes(d)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${minutes === d ? "bg-[#e8edf3] text-[#0f161a]" : "text-muted-foreground"}`}
              >
                {durationLabel(d)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="ud-home-grid grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ asset, large }) => (
          <AssetCard key={asset} asset={asset} minutes={minutes} nowMs={nowMs} large={large} />
        ))}
      </div>
    </section>
  );
}
