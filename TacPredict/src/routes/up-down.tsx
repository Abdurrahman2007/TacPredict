import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { UpDownSection } from "@/components/up-down-section";
import { cryptoMarketQueryOptions } from "@/lib/market-data.functions";
import { polymarketFeedQueryOptions } from "@/lib/polymarket.functions";
export const Route = createFileRoute("/up-down")({
  head: () => ({ meta: [{ title: "Up/Down — TacPredict" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(polymarketFeedQueryOptions),
  component: UpDownPage,
});
function UpDownPage() {
  const { data: feed } = useSuspenseQuery(polymarketFeedQueryOptions);
  const { data: crypto, isError } = useQuery(cryptoMarketQueryOptions);
  const hasMarkets = Object.values(feed.cryptoUpDown).some(Boolean);
  return (
    <div className="animate-enter mx-auto max-w-5xl">
      <h1 className="sr-only">Up/Down</h1>
      {feed.error && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {feed.error}
        </p>
      )}
      {hasMarkets && crypto ? (
        <UpDownSection
          detailed
          crypto={crypto}
          histories={crypto.histories}
          liveMarkets={feed.cryptoUpDown}
        />
      ) : (
        <section className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
          <h2 className="text-lg font-semibold">
            {hasMarkets && !isError
              ? "Loading spot-price context…"
              : "No verified Up/Down data to show"}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">Source temporarily unavailable.</p>
          <Link
            to="/markets"
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-primary"
          >
            Explore markets <ArrowUpRight className="size-4" />
          </Link>
        </section>
      )}
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        CoinGecko prices · Polymarket odds · Trading unavailable
      </p>
    </div>
  );
}
