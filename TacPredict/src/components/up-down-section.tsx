import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { MarketSparkline } from "@/components/market-sparkline";
import { MarketCountdown } from "@/components/market-countdown";
import { OutcomeRow } from "@/components/outcome-row";
import { useSpotTicker } from "@/lib/use-spot-ticker";
import { durationMinutes, marketDurationLabel, marketWindowLabel } from "@/lib/market-timing";
import type { CryptoMarketSnapshot } from "@/lib/market-data.functions";
import type { PolymarketFeed } from "@/lib/polymarket.functions";
export function UpDownSection({
  crypto,
  histories,
  liveMarkets,
  detailed = false,
}: {
  crypto: CryptoMarketSnapshot;
  histories: CryptoMarketSnapshot["histories"];
  liveMarkets: PolymarketFeed["cryptoUpDown"];
  detailed?: boolean;
}) {
  const { ticks } = useSpotTicker();
  const assets = [
    { key: "bitcoin" as const, name: "Bitcoin", logo: "btc" },
    { key: "ethereum" as const, name: "Ethereum", logo: "eth" },
    { key: "solana" as const, name: "Solana", logo: "sol" },
  ].filter((a) => liveMarkets[a.key]);
  return (
    <section className={detailed ? "" : "mt-5"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">Trending Up &amp; Down</h2>
        <Link
          to="/search"
          className="flex min-h-11 items-center gap-1 rounded-full border border-border px-4 text-sm text-muted-foreground"
        >
          View more
          <ChevronRight className="size-4" />
        </Link>
      </div>
      {!assets.length && (
        <p className="py-8 text-sm text-muted-foreground">
          Crypto markets are temporarily unavailable.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset, index) => {
          const market = liveMarkets[asset.key]!,
            duration = marketDurationLabel(market),
            title = `${asset.name} Up or Down${duration ? ` · ${duration}` : ""}`;
          const observations = [...histories[asset.key], ...(ticks[asset.key] ?? [])].sort(
              (a, b) => a.time - b.time,
            ),
            end = observations.at(-1)?.time ?? Date.parse(crypto.updatedAt),
            minutes = durationMinutes(market) ?? 15;
          const points = observations.filter(
            (p) =>
              p.time >=
              Math.max(end - Math.min(minutes, 60) * 60000, Date.parse(market.startsAt ?? "") || 0),
          );
          return (
            <article
              key={asset.key}
              className={`overflow-hidden rounded-[26px] border border-border bg-card p-5 sm:p-6 ${index === 0 ? "sm:col-span-2" : ""}`}
              aria-label={`${asset.name} market card`}
            >
              <div className="flex items-center justify-between gap-3">
                <img
                  src={`/brand/crypto/${asset.logo}.svg`}
                  width={index === 0 ? 40 : 32}
                  height={index === 0 ? 40 : 32}
                  alt={`${asset.name} logo`}
                  className={`${index === 0 ? "size-10" : "size-8"} shrink-0 rounded-full`}
                />
                {index !== 0 && (
                  <Link
                    to="/markets/$marketId"
                    params={{ marketId: market.id }}
                    className="min-w-0 flex-1 text-base font-semibold"
                  >
                    {title}
                  </Link>
                )}
                <MarketCountdown market={market} snapshotTime={crypto.updatedAt} />
              </div>
              {index === 0 ? (
                <>
                  <Link
                    to="/markets/$marketId"
                    params={{ marketId: market.id }}
                    className="mt-4 block text-lg font-semibold"
                  >
                    {title}
                  </Link>
                  {marketWindowLabel(market) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {marketWindowLabel(market)}
                    </p>
                  )}
                  <div className="mt-5">
                    <MarketSparkline
                      points={points}
                      assetLabel={asset.name}
                      sourceLabel={crypto.source}
                      size="card"
                    />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {market.outcomes.slice(0, 2).map((o, i) => (
                      <Link
                        key={o.id}
                        to="/markets/$marketId"
                        params={{ marketId: market.id }}
                        search={{ outcome: o.id }}
                        className="ios-press flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary text-base font-medium"
                      >
                        {i === 0 ? "Up" : "Down"} {o.probability}%
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 space-y-3">
                    {market.outcomes.slice(0, 2).map((o, i) => (
                      <Link
                        key={o.id}
                        to="/markets/$marketId"
                        params={{ marketId: market.id }}
                        search={{ outcome: o.id }}
                        className="ios-press flex min-h-12 items-center gap-3"
                      >
                        <OutcomeRow outcome={o} index={i} />
                      </Link>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>{marketWindowLabel(market) ?? "Polymarket"}</span>
                    <span className="shrink-0">{market.volume} Vol</span>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
