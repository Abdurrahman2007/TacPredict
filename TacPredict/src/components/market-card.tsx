import { Link } from "@tanstack/react-router";
import { Clock3 } from "lucide-react";
import { atomicDecimal } from "@/lib/protocol/types";
import { memo } from "react";
import type { Market } from "@/domain/markets/types";
import { MarketIcon } from "./market-icon";
import { OutcomeRow } from "./outcome-row";
export const MarketCard = memo(function MarketCard({ market }: { market: Market }) {
  return (
    <article className="market-list-item min-w-0 group rounded-[24px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{market.category}</span>
        <span className="flex items-center gap-1">
          <Clock3 className="size-3.5 shrink-0" />
          {market.closesAt}
        </span>
      </div>
      <Link
        to="/markets/$marketId"
        params={{ marketId: market.id }}
        className="flex min-w-0 items-start gap-3"
      >
        <MarketIcon market={market} className="size-10 shrink-0" />
        <h3 className="line-clamp-2 min-w-0 text-lg font-semibold leading-snug">{market.title}</h3>
      </Link>
      <div className="mt-5 space-y-3">
        {market.outcomes.slice(0, 2).map((outcome, index) => (
          <Link
            key={outcome.id}
            to="/markets/$marketId"
            params={{ marketId: market.id }}
            search={{ outcome: outcome.id }}
            className="ios-press flex min-h-16 items-center gap-3 rounded-xl px-1"
          >
            <OutcomeRow outcome={outcome} index={index} />
          </Link>
        ))}
      </div>
      <footer className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {market.outcomes.length > 2
            ? `${market.outcomes.length} outcomes`
            : `${market.native ? atomicDecimal(market.native.openInterestAtomic) + " USDC" : "—"} OI`}
        </span>
        <span className="tabular-nums">{market.volume} Vol</span>
      </footer>
    </article>
  );
});
