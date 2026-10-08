import { Link } from "@tanstack/react-router";
import { Gift, LockKeyhole, ChevronRight } from "lucide-react";
import { useRewardTasks } from "@/lib/use-reward-tasks";
export function LockedRewardCard() {
  const { user, data } = useRewardTasks();
  return (
    <Link
      to="/rewards"
      className="ios-press mt-4 flex items-center justify-between gap-4 rounded-[24px] border border-border bg-card p-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Gift className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Locked reward · 15 USDC</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {data?.eligible
              ? "Qualified credit · Withdrawals unavailable"
              : user
                ? "Complete welcome tasks to qualify"
                : "Sign in to start your welcome tasks"}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LockKeyhole className="size-3" />
            Separate from available wallet funds
          </p>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
