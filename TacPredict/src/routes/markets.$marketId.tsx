import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PredictionAmountCard } from "@/components/prediction-amount-card";
import { MobileOutcomeDock } from "@/components/mobile-outcome-dock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CryptoDetailChart } from "@/components/crypto-detail-chart";
import { ProbabilityHistoryChart } from "@/components/probability-history";
import { MarketCountdown } from "@/components/market-countdown";
import { MarketDescription } from "@/components/market-description";
import { durationMinutes, marketDurationText, marketWindowLabel } from "@/lib/market-timing";
import { MarketIcon } from "@/components/market-icon";
import { polymarketFeedQueryOptions } from "@/lib/polymarket.functions";

export const Route = createFileRoute("/markets/$marketId")({
  validateSearch: (search: Record<string, unknown>): { outcome?: string } =>
    typeof search["outcome"] === "string" ? { outcome: search["outcome"] } : {},
  head: () => ({
    meta: [
      { title: "Market — TacPredict" },
      {
        name: "description",
        content:
          "Explore market outcomes and resolution rules. Base USDC trading integration is pending.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(polymarketFeedQueryOptions),
  component: MarketDetailPage,
});
function MarketDetailPage() {
  const { marketId } = Route.useParams();
  const { outcome: initial } = Route.useSearch();
  const { data: feed } = useSuspenseQuery(polymarketFeedQueryOptions);
  const [selected, setSelected] = useState(initial || "");
  const [amountOpen, setAmountOpen] = useState(false);
  const selectOutcome = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) setAmountOpen(true);
  };
  useEffect(() => {
    setSelected(initial || "");
    setAmountOpen(false);
  }, [initial, marketId]);
  const market = [...feed.markets, ...Object.values(feed.cryptoUpDown)].find(
    (item) => item?.id === marketId,
  );
  if (!market)
    return (
      <div className="py-16 text-center">
        <h1 className="page-title">Market not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This market is not in the current discovery feed.
        </p>
        <Button asChild className="mt-5">
          <Link to="/markets">Back to markets</Link>
        </Button>
      </div>
    );
  const cryptoAsset =
    market.category === "Crypto" && /up or down/i.test(market.title)
      ? /\b(bitcoin|btc)\b/i.test(market.title)
        ? "bitcoin"
        : /\b(ethereum|eth)\b/i.test(market.title)
          ? "ethereum"
          : /\b(solana|sol)\b/i.test(market.title)
            ? "solana"
            : undefined
      : undefined;
  const duration = cryptoAsset ? marketDurationText(market) : null;
  const related = feed.markets
    .filter((m) => m.id !== market.id && m.category === market.category)
    .slice(0, 4);
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  const chosen = market.outcomes.find((item) => item.id === selected) ?? market.outcomes[0];
  return (
    <div className="animate-enter pb-28 lg:pb-0">
      <Link
        to="/markets"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Markets
      </Link>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <article className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{market.category}</span>
            {cryptoAsset ? (
              <MarketCountdown market={market} snapshotTime={feed.updatedAt} />
            ) : (
              <span>{market.closesAt}</span>
            )}
          </div>
          <div className="flex items-start gap-3">
            <MarketIcon market={market} />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                {cryptoAsset
                  ? `${cryptoAsset[0]!.toUpperCase()}${cryptoAsset.slice(1)}`
                  : market.title}
              </h1>
              {duration && <p className="mt-1 text-base text-muted-foreground">{duration}</p>}
            </div>
          </div>
          {marketWindowLabel(market) && (
            <p className="mt-3 text-sm text-muted-foreground">{marketWindowLabel(market)}</p>
          )}
          {cryptoAsset ? (
            <CryptoDetailChart asset={cryptoAsset} initialMinutes={durationMinutes(market) ?? 15} />
          ) : (
            <>
              <div
                className="mt-7 flex items-center justify-between gap-3 rounded-2xl bg-card/50 p-4"
                aria-label="Current outcome probabilities"
              >
                {market.outcomes.slice(0, 2).map((o, i) => (
                  <div key={o.id} className={`min-w-0 flex-1 ${i ? "text-right" : ""}`}>
                    <p className="text-2xl font-semibold tabular-nums">{o.probability}%</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{o.label}</p>
                  </div>
                ))}
              </div>
              <ProbabilityHistoryChart key={market.id} market={market} />
            </>
          )}
          <section
            className={`mt-6 space-y-3 ${market.outcomes.length <= 2 ? "hidden lg:block" : ""}`}
            aria-label="Market outcomes"
          >
            {market.outcomes.map((item, index) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={chosen?.id === item.id}
                onClick={() => selectOutcome(item.id)}
                className={`ios-press flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border px-4 text-left ${chosen?.id === item.id ? "border-primary/50 bg-primary/10" : "border-border bg-card"}`}
              >
                <span className="text-sm font-semibold">{item.label}</span>
                <span
                  className={`text-xl font-semibold tabular-nums ${index === 0 ? "text-positive" : index === 1 ? "text-destructive" : "text-primary"}`}
                >
                  {item.probability}%
                </span>
              </button>
            ))}
          </section>
          <MarketDescription key={market.id} text={market.description} />
          <details className="mt-4 rounded-2xl border border-border/60 bg-card/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Rules</summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {market.resolutionCriteria}
            </p>
            <a
              href={market.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
            >
              Source rules
              <ArrowUpRight className="size-4" />
            </a>
          </details>
          <section className="mt-7" aria-label="Source statistics">
            <h2 className="text-xl font-semibold">Statistics</h2>
            {[
              { label: "Source volume", value: market.volume },
              ...(market.volume24h === undefined
                ? []
                : [{ label: "24h source volume", value: money(market.volume24h) }]),
              ...(market.liquidity === undefined
                ? []
                : [{ label: "Source liquidity", value: money(market.liquidity) }]),
            ].map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-3 py-3 text-sm">
                <span className="text-muted-foreground">{stat.label}</span>
                <span className="flex-1 border-b border-dashed border-border" />
                <span className="tabular-nums">{stat.value}</span>
              </div>
            ))}
          </section>
          {related.length > 0 && (
            <section className="mt-7" aria-label="Related markets">
              <h2 className="text-xl font-semibold">Related markets</h2>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                {related.map((m) => (
                  <Link
                    key={m.id}
                    to="/markets/$marketId"
                    params={{ marketId: m.id }}
                    className="ios-press w-64 shrink-0 rounded-[24px] border border-border bg-card p-5"
                  >
                    <MarketIcon market={m} />
                    <p className="mt-3 line-clamp-2 text-base font-semibold">{m.title}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {m.closesAt} · {m.volume} Vol
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="mt-7" aria-label="Market activity">
            <h2 className="text-xl font-semibold">Activity</h2>
            <p className="mt-4 text-sm text-muted-foreground">Trade activity is not available.</p>
          </section>
        </article>
        <div className="hidden min-w-0 lg:block">
          <PredictionAmountCard
            key={market.id}
            market={market}
            selected={chosen?.id}
            onSelect={setSelected}
          />
        </div>
      </div>
      <MobileOutcomeDock market={market} selected={chosen?.id} onSelect={selectOutcome} />
      <Dialog open={amountOpen} onOpenChange={setAmountOpen}>
        <DialogContent className="bottom-0 top-auto w-full max-w-md translate-y-0 grid-cols-1 gap-0 overflow-y-auto rounded-t-[28px] rounded-b-none border-b-0 bg-card p-0 shadow-2xl max-h-[calc(100dvh-80px)] sm:rounded-t-[28px] sm:rounded-b-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Amount preview</DialogTitle>
            <DialogDescription>
              Select an outcome and amount. Trading is not enabled.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <PredictionAmountCard market={market} selected={chosen?.id} onSelect={setSelected} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
