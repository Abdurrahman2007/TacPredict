import { Link } from "@tanstack/react-router";
import { Bitcoin, ChevronRight } from "lucide-react";
import { useState } from "react";
import { MarketSparkline } from "@/components/market-sparkline";
import { useSpotTicker } from "@/lib/use-spot-ticker";
import type { CryptoMarketSnapshot } from "@/lib/market-data.functions";
import type { PolymarketFeed } from "@/lib/polymarket.functions";
function CoinIcon({ asset }: { asset: string }) {
  if (asset === "bitcoin") return <Bitcoin className="size-6" />;
  if (asset === "ethereum")
    return (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <path d="m12 2 7 10-7 4-7-4Zm0 16 7-4-7 8-7-8Z" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="m5 4 16 0-3 4H2Zm-3 6h16l3 4H5Zm3 6h16l-3 4H2Z" fill="currentColor" />
    </svg>
  );
}
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
  const [windowMinutes, setWindowMinutes] = useState(15);
  const { ticks, live } = useSpotTicker();
  const assets = [
    { key: "bitcoin" as const, name: "Bitcoin", color: "bg-bitcoin" },
    { key: "ethereum" as const, name: "Ethereum", color: "bg-ethereum" },
    { key: "solana" as const, name: "Solana", color: "bg-solana" },
  ].filter((a) => liveMarkets[a.key]);
  return (
    <section className={detailed ? "" : "mt-7"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">{detailed ? "Up / Down" : "Trending Up & Down"}</h2>
        {!detailed && (
          <Link
            to="/up-down"
            className="flex min-h-11 items-center gap-1 rounded-full border border-border px-4 text-sm text-muted-foreground"
          >
            More
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="mb-4 flex items-center gap-2" aria-label="Spot chart window">
        {[5, 15, 60].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={windowMinutes === n}
            onClick={() => setWindowMinutes(n)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${windowMinutes === n ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
          >
            {n === 60 ? "1h" : `${n}m`}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Spot chart</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {assets.map((asset, index) => {
          const market = liveMarkets[asset.key]!;
          const points = [...histories[asset.key], ...(ticks[asset.key] ?? [])].sort(
            (a, b) => a.time - b.time,
          );
          const anchor = points.at(-1)?.time ?? Date.parse(crypto.updatedAt);
          const visible = points.filter((p) => p.time >= anchor - windowMinutes * 60000);
          const fresh = live && anchor > Date.now() - 30000;
          return (
            <article
              key={asset.key}
              className={`overflow-hidden rounded-[24px] border border-border bg-card p-5 sm:p-6 ${index === 0 ? "sm:col-span-2" : ""}`}
            >
              <header className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-11 place-items-center rounded-full text-white ${asset.color}`}
                  >
                    <CoinIcon asset={asset.key} />
                  </span>
                  <Link
                    to="/markets/$marketId"
                    params={{ marketId: market.id }}
                    className="text-lg font-semibold"
                  >
                    {asset.name}
                  </Link>
                </div>
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium ${fresh ? "text-positive" : "text-muted-foreground"}`}
                >
                  <span
                    className={`size-1.5 rounded-full ${fresh ? "bg-positive" : "bg-muted-foreground"}`}
                  />
                  {fresh ? "LIVE" : "SPOT"}
                </span>
              </header>
              <MarketSparkline
                points={visible}
                assetLabel={asset.name}
                sourceLabel={crypto.source}
                compact={index !== 0}
              />
              <div className="mt-6 grid grid-cols-2 gap-3">
                {market.outcomes.slice(0, 2).map((outcome, i) => (
                  <Link
                    key={i}
                    to="/markets/$marketId"
                    params={{ marketId: market.id }}
                    className="ios-press flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-base font-semibold"
                  >
                    {i === 0 ? "Up" : "Down"}
                    <span className="text-muted-foreground">{outcome.probability}%</span>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Polymarket odds · Preview
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
