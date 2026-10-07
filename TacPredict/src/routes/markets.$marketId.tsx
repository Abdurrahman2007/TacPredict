import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Clock3 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/connect-wallet";
import { MarketIcon } from "@/components/market-icon";
import { polymarketFeedQueryOptions } from "@/lib/polymarket.functions";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { BASE_NETWORK, formatUsdc } from "@/lib/onchain/base";

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
  const wallet = useBaseWallet();
  const [selected, setSelected] = useState(initial || "");
  const [amount, setAmount] = useState("10");
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
  const chosen = market.outcomes.find((item) => item.id === selected) ?? market.outcomes[0];
  return (
    <div className="animate-enter">
      <Link
        to="/markets"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Markets
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <article>
          <div className="flex items-start gap-4">
            <MarketIcon market={market} />
            <div className="min-w-0">
              <p className="section-kicker">
                {market.category} ·{" "}
                {market.source === "Polymarket" ? "EXTERNAL MARKET DATA" : "SAMPLE DATA"}
              </p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                {market.title}
              </h1>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" />
              {market.endsAt
                ? `Closes ${new Date(market.endsAt).toISOString().slice(0, 10)}`
                : `Ends ${market.closesAt}`}
            </span>
            <span>{market.volume} source volume</span>
          </div>
          <section className="mt-6 space-y-3" aria-label="Market outcomes">
            {market.outcomes.map((item, index) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={chosen?.id === item.id}
                onClick={() => setSelected(item.id)}
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
          <details className="mt-6 rounded-2xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold">About</summary>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {market.description}
            </p>
          </details>
          <details className="mt-3 rounded-2xl border border-border bg-card p-4">
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
        </article>
        <aside
          className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24"
          aria-label="USDC trade integration status"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Make a prediction</h2>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs text-primary">
              BASE / USDC
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {chosen?.label ?? "Choose an outcome"} · {chosen?.probability ?? "—"}% source
            probability
          </p>
          <label
            htmlFor="usdc-amount"
            className="mt-6 block text-xs font-semibold tracking-wide text-muted-foreground"
          >
            AMOUNT PREVIEW
          </label>
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background px-4">
            <input
              id="usdc-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-14 min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none"
            />
            <span className="text-sm text-muted-foreground">USDC</span>
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Wallet balance</span>
            <span className="font-medium">
              {!wallet.address
                ? "0"
                : wallet.chainId !== BASE_NETWORK.id
                  ? "Switch network"
                  : wallet.usdc === null
                    ? "Loading…"
                    : formatUsdc(wallet.usdc)}{" "}
              USDC
            </span>
          </div>
          <Button disabled className="mt-5 h-12 w-full rounded-xl">
            Trading not enabled
          </Button>
          {!wallet.address && (
            <div className="mt-3">
              <ConnectWallet className="h-12 w-full rounded-xl" />
            </div>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Preview only · No funds move.
          </p>
        </aside>
      </div>
    </div>
  );
}
