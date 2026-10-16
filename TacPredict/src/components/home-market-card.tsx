import { Link } from "@tanstack/react-router";
import { MarketIcon } from "./market-icon";
import { OutcomeRow } from "./outcome-row";
import { usdcShort, volumeText } from "@/lib/protocol/display.mjs";
import type { Market } from "@/domain/markets/types";

export function HomeMarketCard({
  market,
  featured = false,
}: {
  market: Market;
  featured?: boolean;
}) {
  const stamp = new Date(market.endsAt ?? "");
  const close = Number.isFinite(stamp.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(stamp) + " UTC"
    : market.closesAt;
  return (
    <article className={`home-prediction-card${featured ? " home-featured-card" : ""}`}>
      <div className="home-card-meta">
        <span>{market.category}</span>
        <time dateTime={market.endsAt}>{close}</time>
      </div>
      <Link to="/markets/$marketId" params={{ marketId: market.id }} className="home-card-title">
        <MarketIcon market={market} className="size-9 shrink-0" />
        <h3>{market.title}</h3>
      </Link>
      <div className="home-card-outcomes">
        {market.outcomes.slice(0, 2).map((outcome, index) => (
          <Link
            key={outcome.id}
            to="/markets/$marketId"
            params={{ marketId: market.id }}
            search={{ outcome: outcome.id }}
            className="home-card-outcome ios-press"
          >
            <OutcomeRow outcome={outcome} index={index} />
          </Link>
        ))}
      </div>
      <footer className="home-card-footer">
        <span>
          {market.outcomes.length > 2
            ? `${market.outcomes.length} outcomes`
            : market.native
              ? `${usdcShort(market.native.openInterestAtomic)} OI`
              : "Listing pending"}
        </span>
        <span>{volumeText(market.volume)} Vol</span>
      </footer>
    </article>
  );
}
