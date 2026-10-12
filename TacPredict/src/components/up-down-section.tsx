import { useQuery } from "@tanstack/react-query";
import { marketPreviewsQueryOptions } from "@/lib/agent/discovery.functions";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { MarketSparkline } from "@/components/market-sparkline";
import { MarketCountdown } from "@/components/market-countdown";
import { MarketWindowLabel } from "@/components/market-window-label";
import { OutcomeRow } from "@/components/outcome-row";
import { sourcePriceWindow } from "@/lib/price-window";
import { durationMinutes, marketDurationLabel } from "@/lib/market-timing";
import type { CryptoMarketSnapshot } from "@/lib/market-data.functions";
import type { NativeFeed } from "@/lib/protocol/market-feed.functions";
export function UpDownSection({
  crypto,
  histories,
  liveMarkets,
  detailed = false,
  snapshotTime,
}: {
  crypto?: CryptoMarketSnapshot | undefined;
  histories?: CryptoMarketSnapshot["histories"] | undefined;
  liveMarkets: NativeFeed["cryptoUpDown"];
  detailed?: boolean;
  snapshotTime?: string;
}) {
  const { data: previews } = useQuery(marketPreviewsQueryOptions);
  const assets = [
    { key: "bitcoin" as const, name: "Bitcoin", logo: "btc" },
    { key: "ethereum" as const, name: "Ethereum", logo: "eth" },
    { key: "solana" as const, name: "Solana", logo: "sol" },
  ];
  return (
    <section className={detailed ? "" : "mt-5"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">
          {Object.values(liveMarkets).some(Boolean) ? "Trending Up & Down" : "Crypto Predictions"}
        </h2>
        <Link
          to="/search"
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs text-muted-foreground"
        >
          View more
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset, index) => {
          const market = liveMarkets[asset.key];
          const preview = previews?.find((p) => p.asset === asset.key);
          const title = market
            ? `${asset.name} Up or Down - ${marketDurationLabel(market) ?? "USDC market"}`
            : (preview?.title ?? asset.name);
          const observations = [...(histories?.[asset.key] ?? [])].sort((a, b) => a.time - b.time);
          const end =
            observations.at(-1)?.time ??
            Date.parse(crypto?.updatedAt ?? snapshotTime ?? "1970-01-01T00:00:00Z");
          const minutes = market ? (durationMinutes(market) ?? 15) : 15;
          const points = sourcePriceWindow(
            observations,
            Math.max(end - Math.min(minutes, 60) * 60000, Date.parse(market?.startsAt ?? "") || 0),
          );
          return (
            <article
              key={asset.key}
              className={`overflow-hidden rounded-[26px] border border-border bg-card p-5 sm:p-6 ${index === 0 ? "sm:col-span-2" : ""}`}
              aria-label={`${asset.name} market card`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={`/brand/crypto/${asset.logo}.svg`}
                  alt={`${asset.name} logo`}
                  className="size-10 shrink-0 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold">
                    {market ? (
                      <Link to="/markets/$marketId" params={{ marketId: market.id }}>
                        {title}
                      </Link>
                    ) : preview ? (
                      <Link to="/markets/$marketId" params={{ marketId: preview.id }}>
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </h3>
                </div>
                {market ? (
                  <MarketCountdown
                    market={market}
                    snapshotTime={snapshotTime ?? market.startsAt ?? "1970-01-01T00:00:00Z"}
                  />
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {preview ? "Preview" : "Reference"}
                  </span>
                )}
              </div>
              {market && (
                <MarketWindowLabel market={market} className="mt-3 text-sm text-muted-foreground" />
              )}
              {index === 0 ? (
                <div className="mt-5">
                  <MarketSparkline
                    points={points}
                    assetLabel={asset.name}
                    sourceLabel={crypto?.source ?? "CoinGecko"}
                    size="card"
                  />
                </div>
              ) : (
                <div className="mt-5 flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Spot price</span>
                  <span className="font-semibold tabular-nums text-[#4a9bff]">
                    {crypto
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(crypto[asset.key].price)
                      : "Unavailable"}
                  </span>
                </div>
              )}
              {crypto?.stale && (
                <p className="mt-2 text-xs text-muted-foreground">Price refresh delayed</p>
              )}
              {market ? (
                <div className={index === 0 ? "mt-5 grid grid-cols-2 gap-3" : "mt-4 space-y-3"}>
                  {market.outcomes.slice(0, 2).map((o, i) => (
                    <Link
                      key={o.id}
                      to="/markets/$marketId"
                      params={{ marketId: market.id }}
                      search={{ outcome: o.id }}
                      className={
                        index === 0
                          ? "ios-press flex min-h-12 items-center justify-center rounded-full bg-secondary font-medium"
                          : "ios-press flex min-h-12 items-center gap-3"
                      }
                    >
                      {index === 0 ? (
                        `${o.label} ${o.probabilityKnown === false ? "—" : `${o.probability}%`}`
                      ) : (
                        <OutcomeRow outcome={o} index={i} />
                      )}
                    </Link>
                  ))}
                </div>
              ) : preview ? (
                <>
                  <div className={index === 0 ? "mt-5 grid grid-cols-2 gap-3" : "mt-5 space-y-3"}>
                    {["Yes", "No"].map((label, i) => (
                      <Link
                        key={label}
                        to="/markets/$marketId"
                        params={{ marketId: preview.id }}
                        search={{ outcome: String(i) }}
                        aria-label={`Predict ${label}: ${preview.title}`}
                        className={
                          index === 0
                            ? "ios-press flex min-h-12 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
                            : "ios-press flex min-h-12 items-center gap-3"
                        }
                      >
                        {index === 0 ? (
                          `${label} —`
                        ) : (
                          <OutcomeRow
                            outcome={{
                              id: String(i),
                              label,
                              probability: 0,
                              probabilityKnown: false,
                            }}
                            index={i}
                          />
                        )}
                      </Link>
                    ))}
                  </div>
                  <div className="mt-5 flex justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground">
                    <span>— OI</span>
                    <span>— Vol</span>
                  </div>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
