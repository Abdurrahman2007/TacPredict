import { Link } from "@tanstack/react-router";
import { Gift, LockKeyhole, ChevronRight } from "lucide-react";
/** No legacy real-USDC task queries or implicit campaign offer. */
export function LockedRewardCard() {
  return (
    <Link
      to="/rewards"
      className="ios-press flex items-center justify-between gap-4 rounded-[24px] border border-border bg-card p-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Gift className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Virtual USDC campaigns</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">No campaign is active</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LockKeyhole className="size-3" />
            Non-redeemable virtual units
          </p>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
