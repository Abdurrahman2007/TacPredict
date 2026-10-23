import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil, RefreshCw, ArrowUpRight, Gift } from "lucide-react";
import { useAccount } from "./account-provider";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { rankingOptions } from "@/lib/ranking/read.functions";
import { signedMoney, unsignedMoney, type RankingPeriod } from "@/lib/ranking/core.mjs";
import { sharesShort } from "@/lib/protocol/display.mjs";
import { PixelAvatar } from "./pixel-avatar";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
const periods = { "1d": "24 hours", "7d": "7 days", "30d": "30 days", all: "All time" } as const;
export function OwnProfile({ editor }: { editor: ReactNode }) {
  const { auth, query: account } = useAccount(),
    wallet = useBaseWallet(),
    portfolio = useNativePortfolio();
  const [editing, setEditing] = useState(false),
    [period, setPeriod] = useState<RankingPeriod>("30d"),
    [tab, setTab] = useState<"positions" | "activity">("positions");
  const verified = portfolio.data?.verifiedWallets ?? [];
  const address = wallet.address
    ? verified.some((a) => a.toLowerCase() === wallet.address!.toLowerCase())
      ? wallet.address.toLowerCase()
      : null
    : (verified[0]?.toLowerCase() ?? null);
  const ranking = useQuery({
    ...rankingOptions({
      period,
      page: 0,
      ...(address ? { trader: address, wallet: address } : {}),
    }),
    enabled: Boolean(address),
  });
  const selected = ranking.data?.selected;
  const ready = Boolean(address && ranking.data?.status === "ready" && !ranking.isError);
  const failed = portfolio.isError || ranking.isError || ranking.data?.status === "unavailable";
  const positions = selected?.positions.filter((p) => !p.settled) ?? [];
  const activity = selected?.activity ?? [];
  const user = account.data!.profile;
  return (
    <>
      <header className="own-profile-identity">
        <PixelAvatar seed={auth.user!.id} size={64} />
        <div>
          <h2>
            @{user.username}
            <span>(You)</span>
          </h2>
        </div>
        <button
          className="account-menu-trigger"
          aria-label="Edit profile"
          onClick={() => setEditing(true)}
        >
          <Pencil size={19} />
        </button>
      </header>
      <div className="own-profile-period">
        <label>
          <span className="sr-only">Profile period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as RankingPeriod)}>
            {Object.entries(periods).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="own-profile-stats" aria-label="Your trading statistics">
        {[
          ["Rank", ready ? (selected?.rank ?? "—") : "—"],
          ["Volume", ready ? unsignedMoney(selected?.volumeAtomic ?? "0") : "—"],
          [
            `P&L (${period === "all" ? "all" : period})`,
            ready ? (selected ? signedMoney(selected.pnlAtomic) : "$0.00") : "—",
          ],
          ["Markets", ready ? (selected?.markets ?? 0) : "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <span
              title={
                String(label).startsWith("P&L")
                  ? "Settled P&L only, not unrealized profit"
                  : undefined
              }
            >
              {label}
            </span>
            <strong
              className={
                String(label).startsWith("P&L") && selected?.pnlAtomic
                  ? BigInt(selected.pnlAtomic) > 0n
                    ? "account-success"
                    : BigInt(selected.pnlAtomic) < 0n
                      ? "account-error"
                      : ""
                  : ""
              }
            >
              {value}
            </strong>
          </div>
        ))}
      </section>
      <p className="own-profile-source">
        Finalized Exchange activity · virtual referral credits excluded
      </p>
      <div className="own-profile-tabs" aria-label="Your profile activity">
        <button aria-pressed={tab === "positions"} onClick={() => setTab("positions")}>
          Positions
        </button>
        <button aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>
          Activity
        </button>
      </div>
      {failed ? (
        <div className="own-profile-empty" role="alert">
          <p>Trading statistics could not load.</p>
          <button
            className="account-secondary"
            onClick={() => {
              void portfolio.refetch();
              if (address) void ranking.refetch();
            }}
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      ) : !ready ? (
        <div className="own-profile-empty" role="status">
          <p>
            {portfolio.isPending || ranking.isFetching
              ? "Loading verified trading activity…"
              : wallet.address
                ? "Verify this wallet in Portfolio to view your statistics."
                : "Connect your verified wallet to view trading activity."}
          </p>
          <Link to="/profile" className="account-secondary">
            Open Portfolio
            <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : tab === "positions" && positions.length ? (
        <div className="own-profile-records">
          {positions.map((p) => (
            <Link
              key={p.marketId + "-" + p.outcome}
              to="/markets/$marketId"
              params={{ marketId: p.marketId }}
            >
              <span>
                {p.title}
                <small>Outcome {p.outcome + 1} · Open</small>
              </span>
              <b>{sharesShort(p.sharesAtomic)} shares</b>
            </Link>
          ))}
        </div>
      ) : tab === "activity" && activity.length ? (
        <div className="own-profile-records">
          {activity.map((a) => (
            <a
              key={a.id}
              href={`https://basescan.org/tx/${a.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                {a.title}
                <small>
                  {a.side} · {new Date(a.timestamp).toISOString().slice(0, 16).replace("T", " ")}{" "}
                  UTC
                </small>
              </span>
              <b>{unsignedMoney(a.amountAtomic)}</b>
            </a>
          ))}
        </div>
      ) : (
        <div className="own-profile-empty">
          <p>
            {tab === "positions"
              ? "You have no open positions."
              : "No trading activity in this period."}
            <br />
            <span>Explore what’s trending to get started.</span>
          </p>
          <Link to="/markets" className="account-primary">
            Explore Markets
            <ArrowUpRight size={15} />
          </Link>
        </div>
      )}
      <Link to="/referrals" className="account-invite-tile">
        <span className="account-feature-icon">
          <Gift size={23} />
        </span>
        <div>
          <b>Better with friends</b>
          <p>Your personal referral link & rewards</p>
        </div>
        <ArrowUpRight size={20} />
      </Link>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="account-sheet account-editor-sheet">
          <DialogTitle className="sr-only">Edit your profile</DialogTitle>
          <DialogDescription className="sr-only">
            Change your username. Usernames must be unique.
          </DialogDescription>
          {editor}
        </DialogContent>
      </Dialog>
    </>
  );
}
