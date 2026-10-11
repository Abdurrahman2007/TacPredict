import { WalletFundingDialog } from "@/components/wallet-funding-dialog";
import { useQuery } from "@tanstack/react-query";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { NativePortfolio } from "@/components/native-portfolio";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { atomicDecimal } from "@/lib/protocol/types";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { formatUsdc, shortAddress } from "@/lib/onchain/base";
export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Portfolio — TacPredict" }] }),
  component: PortfolioPage,
});
function PortfolioPage() {
  const wallet = useBaseWallet(),
    q = useNativePortfolio();
  const auth = useProtocolUser();
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const deployment = feed.data?.deployments.find((d) => d.chainId === 8453);
  const [funding, setFunding] = useState<"deposit" | "withdraw" | null>(null);
  const [range, setRange] = useState("1D");
  const [tab, setTab] = useState("Positions"),
    [hidden, setHidden] = useState(false),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState("");
  const positions = (q.data?.positions ?? []).filter((p) => p.chainId === 8453);
  const known = Boolean(q.data?.walletLinked) && !q.isError && !q.isPending;
  const positionValue =
    known && positions.every((p) => p.valueAtomic !== null)
      ? positions.reduce((a, p) => a + BigInt(p.valueAtomic!), 0n)
      : null;
  const claimable = known ? positions.reduce((a, p) => a + BigInt(p.claimableAtomic), 0n) : null;
  const walletKnown = wallet.address && wallet.chainId === 8453 && wallet.usdc !== null;
  const display = (value: bigint | null) =>
    hidden
      ? "••••"
      : value === null
        ? auth.ready && !auth.user
          ? "0.00"
          : "—"
        : atomicDecimal(value.toString());
  return (
    <div className="mx-auto max-w-5xl animate-enter">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium text-muted-foreground">Portfolio</h1>
        <span className="finance-badge">
          <span className="size-1.5 rounded-full bg-blue-400" />
          Base · USDC
        </span>
      </div>
      <section className="mt-5 grid grid-cols-2 gap-4" aria-label="Portfolio balances">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-[32px] font-semibold tracking-tight tabular-nums sm:text-5xl">
              {hidden ? display(positionValue) : `$${display(positionValue)}`}
              <span className="ml-2 text-sm font-normal text-muted-foreground">USDC</span>
            </p>
            <button
              className="grid size-11 place-items-center text-muted-foreground"
              onClick={() => setHidden(!hidden)}
              aria-label={hidden ? "Show balances" : "Hide balances"}
            >
              {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Position value</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Wallet balance</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {hidden
              ? "••••"
              : walletKnown
                ? `$${formatUsdc(wallet.usdc)}`
                : auth.ready && !auth.user
                  ? "$0.00"
                  : "—"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">USDC</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{deployment ? deployment.tradingEnabled ? "Base wallet" : "Trading paused" : "Base wallet"}</p>
        </div>
      </section>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!wallet.address ? (
          null
        ) : (
          <button
            className="finance-pill"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(wallet.address!);
                setNotice("Wallet address copied");
              } catch {
                setNotice("Could not copy address");
              }
            }}
          >
            <Wallet size={15} />
            {shortAddress(wallet.address)}
            <Copy size={14} />
          </button>
        )}
        <button
          className="finance-pill"
          aria-label="Refresh balances"
          disabled={wallet.busy || q.isFetching}
          onClick={() => {
            void wallet.refresh();
            if (q.data) void q.refetch();
          }}
        >
          <RefreshCw size={15} />
        </button>
        {wallet.address && wallet.chainId !== 8453 && (
          <button className="finance-pill" onClick={() => void wallet.switchToBase()}>
            Switch to Base
          </button>
        )}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          disabled={!wallet.address || wallet.chainId !== 8453}
          onClick={() => setFunding("deposit")}
          className="portfolio-funding portfolio-funding-primary"
        >
          <ArrowDownToLine size={20} />
          Deposit
        </button>
        <button
          disabled={
            !wallet.address || wallet.chainId !== 8453 || wallet.usdc === null || wallet.usdc <= 0n
          }
          onClick={() => setFunding("withdraw")}
          className="portfolio-funding"
        >
          <ArrowUpFromLine size={20} />
          Withdraw
        </button>
      </div>

      <section
        className="mt-6 rounded-[24px] border border-border bg-card p-5 sm:p-7"
        aria-label="Portfolio performance"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm text-muted-foreground">Profit / Loss</h2>
          <div className="flex gap-1">
            {["1D", "1W", "1M", "1Y", "YTD", "ALL"].map((period) => (
              <button
                key={period}
                onClick={() => setRange(period)}
                aria-pressed={range === period}
                className={`min-h-9 rounded-xl px-2 text-xs font-semibold ${range === period ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="mt-3 text-3xl font-semibold">
              {hidden ? "••••" : auth.ready && !auth.user ? "$0.00" : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Claimable USDC</p>
            <p className="mt-3 text-xl font-semibold tabular-nums">{display(claimable)}</p>
          </div>
        </div>
        <div className="mt-7 grid min-h-44 place-items-center rounded-xl bg-gradient-to-t from-primary/10 to-transparent px-6 text-center text-xs leading-6 text-muted-foreground">
          No verified performance history · {range}
        </div>
      </section>
      <section className="mt-7" aria-label="Your positions">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border p-1">
          {["Positions", "Open", "History"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className={`min-h-11 rounded-xl text-sm font-semibold transition-colors ${tab === item ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>
        {tab !== "History" && (
          <label className="mt-4 flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-4">
            <Search size={17} className="text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your positions"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        <NativePortfolio tab={tab === "History" ? "Activity" : tab} search={search} />
      </section>
      <WalletFundingDialog
        kind={funding ?? "deposit"}
        open={funding !== null}
        onClose={() => setFunding(null)}
      />
      <p role="status" className="mt-3 text-xs text-muted-foreground">
        {notice || wallet.error}
      </p>
    </div>
  );
}
