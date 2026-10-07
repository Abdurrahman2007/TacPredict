import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { MarketSparkline } from "@/components/market-sparkline";
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const multiplier = (p: number) => (p > 0 ? `${(100 / p).toFixed(2)}x` : "—");

export function UpDownSection({
  crypto,
  histories,
  liveMarkets,
  detailed = false,
}: {
  detailed?: boolean;
  crypto: {
    bitcoin: { price: number; change24h: number };
    ethereum: { price: number; change24h: number };
    solana: { price: number; change24h: number };
  };
  histories: import("@/lib/market-data.functions").CryptoMarketSnapshot["histories"];
  liveMarkets: import("@/lib/polymarket.functions").PolymarketFeed["cryptoUpDown"];
}) {
  const assets = [
    {
      key: "bitcoin" as const,
      name: "Bitcoin",
      symbol: "BTC",
      icon: "₿",
      iconClass: "bg-bitcoin",
      price: crypto.bitcoin.price,
    },
    {
      key: "ethereum" as const,
      name: "Ethereum",
      symbol: "ETH",
      icon: "Ξ",
      iconClass: "bg-ethereum",
      price: crypto.ethereum.price,
    },
    {
      key: "solana" as const,
      name: "Solana",
      symbol: "SOL",
      icon: "◎",
      iconClass: "bg-solana",
      price: crypto.solana.price,
    },
  ].filter((asset) => liveMarkets[asset.key]);
  const bitcoin = assets[0];
  if (!bitcoin) return null;
  const bitcoinMarket = liveMarkets[bitcoin.key];
  if (!bitcoinMarket) return null;
  const bitcoinUp = bitcoinMarket.outcomes[0]?.probability ?? 0;
  const bitcoinDown = bitcoinMarket.outcomes[1]?.probability ?? 0;
  return (
    <section className="mt-7">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="section-title truncate">Trending Up &amp; Down</h2>
        {!detailed && (
          <Link
            to="/up-down"
            className="inline-flex shrink-0 items-center rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            View More <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      <Link
        to="/markets/$marketId"
        params={{ marketId: bitcoinMarket.id }}
        className="ios-press mt-3 block overflow-hidden rounded-lg border border-border bg-card p-5 shadow-card sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full text-xl font-black text-foreground ${bitcoin.iconClass}`}
            >
              {bitcoin.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold">
                {bitcoin.name} Up or Down
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                Source odds ·{" "}
                {crypto[bitcoin.key].price > 0
                  ? usd.format(crypto[bitcoin.key].price)
                  : "Spot price unavailable"}
              </span>
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-positive">
            <span className="size-1.5 rounded-full bg-positive" /> LIVE
          </span>
        </div>
        <div className="mt-5">
          <MarketSparkline points={histories[bitcoin.key]} assetLabel={bitcoin.name} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <span className="rounded-md border border-positive/20 bg-positive-soft p-3.5 text-positive">
            <span className="flex items-center justify-between text-sm font-extrabold">
              <span>Up</span>
              <span>{bitcoinUp}%</span>
            </span>
            <span className="mt-2 block text-xs font-bold tabular-nums opacity-80">
              {multiplier(bitcoinUp)} implied odds
            </span>
          </span>
          <span className="rounded-md border border-destructive/20 bg-destructive/10 p-3.5 text-destructive">
            <span className="flex items-center justify-between text-sm font-extrabold">
              <span>Down</span>
              <span>{bitcoinDown}%</span>
            </span>
            <span className="mt-2 block text-xs font-bold tabular-nums opacity-80">
              {multiplier(bitcoinDown)} implied odds
            </span>
          </span>
        </div>
      </Link>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {assets
          .filter((asset) => asset.key !== "bitcoin")
          .map((asset) => {
            const market = liveMarkets[asset.key];
            if (!market) return null;
            const upProb = market.outcomes[0]?.probability ?? 0;
            const downProb = market.outcomes[1]?.probability ?? 0;
            return (
              <Link
                key={asset.symbol}
                to="/markets/$marketId"
                params={{ marketId: market.id }}
                className="ios-press block rounded-lg border border-border bg-card p-5 shadow-card"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-full text-base font-black text-foreground ${asset.iconClass}`}
                    >
                      {asset.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.95rem] font-bold">
                        {asset.name} Up or Down
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                        {asset.price > 0 ? usd.format(asset.price) : "Spot price unavailable"} ·
                        Polymarket odds
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-positive">
                    <span className="size-1.5 rounded-full bg-positive" /> LIVE
                  </span>
                </div>
                <div className="mt-4">
                  <MarketSparkline points={histories[asset.key]} assetLabel={asset.name} compact />
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Up</span>
                      <progress
                        className="outcome-progress outcome-progress-positive mt-1"
                        value={upProb}
                        max={100}
                        aria-label={`Up ${upProb}%`}
                      />
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
                      {multiplier(upProb)}
                    </span>
                    <span className="shrink-0 rounded-full bg-positive-soft px-3 py-1.5 text-sm font-bold tabular-nums text-positive">
                      {upProb}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">Down</span>
                      <progress
                        className="outcome-progress outcome-progress-negative mt-1"
                        value={downProb}
                        max={100}
                        aria-label={`Down ${downProb}%`}
                      />
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
                      {multiplier(downProb)}
                    </span>
                    <span className="shrink-0 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-bold tabular-nums text-destructive">
                      {downProb}%
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
      </div>
    </section>
  );
}
