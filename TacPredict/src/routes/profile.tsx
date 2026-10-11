import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  RefreshCw,
  Search,
  ArrowDown,
  ArrowUp,
  Share2,
  Wallet,
} from "lucide-react";
import { NativePortfolio } from "@/components/native-portfolio";
import { WalletFundingDialog } from "@/components/wallet-funding-dialog";
import { useLoginDialog } from "@/components/login-dialog";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { useOwnProtocolOrders } from "@/lib/protocol/portfolio-orders";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { money } from "@/lib/protocol/portfolio-view.mjs";
import "@/styles/portfolio-reference.css";
export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Portfolio — TacPredict" }] }),
  component: PortfolioPage,
});
const periods = {
  "1D": "Past Day",
  "1W": "Past Week",
  "1M": "Past Month",
  "1Y": "Past Year",
  YTD: "Year to Date",
  ALL: "All Time",
} as const;
function PortfolioPage() {
  const wallet = useBaseWallet(),
    q = useNativePortfolio(),
    orders = useOwnProtocolOrders(),
    auth = useProtocolUser(),
    login = useLoginDialog(),
    feed = useQuery(nativeMarketFeedQueryOptions);
  const [funding, setFunding] = useState<"deposit" | "withdraw" | null>(null),
    [range, setRange] = useState<keyof typeof periods>("1D"),
    [tab, setTab] = useState("Positions"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("value"),
    [descending, setDescending] = useState(true),
    [activeOnly, setActiveOnly] = useState(false),
    [notice, setNotice] = useState("");
  const deployment = feed.data?.deployments.find((d) => d.chainId === 8453);
  const signedOut = auth.ready && !auth.user;
  const walletKnown = Boolean(
    wallet.address && wallet.chainId === 8453 && wallet.usdc !== null && !wallet.error,
  );
  const hidden = false;
  const linked = Boolean(q.data?.walletLinked) && !q.isError && !q.isPending;
  const positions = (q.data?.positions ?? []).filter((p) => p.chainId === 8453);
  const marked =
    linked && positions.every((p) => p.valueAtomic !== null)
      ? positions.reduce((sum, p) => sum + BigInt(p.valueAtomic!), 0n)
      : null;
  // Wallet + last-trade marked positions; claimable is not added twice.
  const emptyAccount =
    signedOut ||
    Boolean(
      auth.ready &&
      !wallet.address &&
      !q.isPending &&
      !q.isError &&
      q.data &&
      !q.data.walletLinked &&
      positions.length === 0,
    );
  const total = emptyAccount ? 0n : walletKnown && marked !== null ? wallet.usdc! + marked : null;
  const cash = emptyAccount ? 0n : walletKnown ? wallet.usdc : null;
  const claimable = linked
    ? positions.reduce((sum, p) => sum + BigInt(p.claimableAtomic), 0n)
    : null;
  const noHistory =
    emptyAccount || Boolean(linked && q.data?.activity?.length === 0 && positions.length === 0);
  const pnl = noHistory ? 0n : null; // Cost-basis/P&L history isn't available. Never synthesize performance.
  async function copyAddress() {
    if (!wallet.address) {
      login("/profile");
      return;
    }
    try {
      await navigator.clipboard.writeText(wallet.address);
      setNotice("Wallet address copied");
    } catch {
      setNotice("Copy unavailable");
    }
  }
  async function fundingAction(kind: "deposit" | "withdraw") {
    if (!auth.user || !wallet.address) {
      login("/profile");
      return;
    }
    if (wallet.chainId !== 8453) {
      await wallet.switchToBase();
      return;
    }
    setFunding(kind);
  }
  async function share() {
    try {
      const data = { title: "TacPredict Portfolio", url: location.origin + "/profile" };
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        setNotice("Portfolio link copied; private balances are not shared");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setNotice("Sharing unavailable");
    }
  }
  return (
    <div className="tp-portfolio">
      <section className="tp-balances" aria-label="Portfolio balances">
        <div className="tp-b-left">
          <div className="tp-label">
            <h1>Portfolio</h1>
            <button
              className="tp-icon"
              onClick={() => void copyAddress()}
              aria-label="Copy wallet address"
            >
              <Copy size={15} />
            </button>
            <button
              className="tp-icon"
              onClick={() => {
                void wallet.refresh();
                if (auth.user) {
                  void q.refetch();
                  void orders.refetch();
                }
              }}
              disabled={wallet.busy || q.isFetching || orders.isFetching}
              aria-label="Refresh portfolio"
            >
              <RefreshCw size={14} className={q.isFetching ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="tp-big">
            <span>{money(total, hidden)}</span>
          </div>
          <p className="tp-sub">
            {hidden ? "••••" : noHistory ? "$0.00 (0%) past day" : "Performance unavailable"}
          </p>
        </div>
        <div className="tp-b-right">
          <p className="tp-label">
            {deployment?.tradingEnabled ? "Wallet USDC" : "Wallet balance"}
          </p>
          <p className="tp-big tp-med">{money(cash, hidden)}</p>
          {claimable !== null && claimable > 0n ? (
            <span className="tp-status">Claimable {money(claimable, hidden)}</span>
          ) : (
            <span className="tp-status">
              {deployment
                ? deployment.tradingEnabled
                  ? "Self-custody"
                  : "Trading paused"
                : "Base Mainnet"}
            </span>
          )}
          <div>
            <span className="tp-chain">
              <i />
              USDC · Base
            </span>
          </div>
        </div>
      </section>
      <section className="tp-actions" aria-label="Wallet actions">
        <button className="tp-btn tp-primary" onClick={() => void fundingAction("deposit")}>
          <ArrowDownToLine size={18} />
          Deposit
        </button>
        <button
          className="tp-btn tp-secondary"
          disabled={Boolean(auth.user && walletKnown && wallet.usdc === 0n)}
          onClick={() => void fundingAction("withdraw")}
        >
          <ArrowUpFromLine size={18} />
          Withdraw
        </button>
      </section>
      <section className="tp-pl" aria-label="Portfolio performance">
        <div className="tp-pl-head">
          <h2>
            <span className="tp-dot" />
            Profit/Loss
          </h2>
          <div className="tp-periods">
            {Object.keys(periods).map((p) => (
              <button
                key={p}
                className={range === p ? "on" : ""}
                aria-pressed={range === p}
                onClick={() => setRange(p as keyof typeof periods)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="tp-pl-value">
          <strong>{money(pnl, hidden)}</strong>
          <button
            aria-label="Share portfolio link"
            className="tp-icon"
            onClick={() => void share()}
          >
            <Share2 size={16} />
          </button>
          <span className="tp-watermark">
            <Wallet size={13} />
            TacPredict
          </span>
        </div>
        <div className="tp-pl-sub">
          <span>{periods[range]}</span>
          <span>
            All-time <b>{money(pnl, hidden)}</b>
          </span>
        </div>
        <div
          className="tp-chart"
          aria-label={noHistory ? "No trading performance yet" : "Performance history unavailable"}
        >
          <span>{noHistory ? "" : "No verified performance history"}</span>
          <i aria-hidden="true" />
        </div>
        <div className="tp-glow" aria-hidden="true" />
      </section>
      <div className="tp-segment" aria-label="Portfolio views">
        {["Positions", "Open", "History"].map((item) => (
          <button
            key={item}
            className={tab === item ? "on" : ""}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="tp-filters">
        <label className="tp-search">
          <Search size={16} />
          <input
            type="search"
            aria-label="Search portfolio"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {tab === "Positions" && (
          <>
            <select
              className="tp-select"
              aria-label="Sort positions"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="value">Current value</option>
              <option value="shares">Shares</option>
              <option value="recent">Recent</option>
            </select>
            <button
              className="tp-sort"
              aria-label={descending ? "Sort ascending" : "Sort descending"}
              onClick={() => setDescending(!descending)}
            >
              {descending ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
            <button
              className={`tp-toggle ${activeOnly ? "on" : ""}`}
              role="switch"
              aria-checked={activeOnly}
              aria-label="Active positions only"
              onClick={() => setActiveOnly(!activeOnly)}
            >
              <i />
            </button>
          </>
        )}
      </div>
      <div className="tp-results">
        <NativePortfolio
          tab={tab === "History" ? "Activity" : tab}
          search={search}
          sort={sort}
          descending={descending}
          activeOnly={activeOnly}
        />
      </div>
      {notice && (
        <p className="tp-notice" role="status">
          {notice}
        </p>
      )}
      {wallet.error && (
        <p className="tp-notice" role="alert">
          {wallet.error}
        </p>
      )}
      <WalletFundingDialog
        kind={funding ?? "deposit"}
        open={funding !== null}
        onClose={() => setFunding(null)}
      />
    </div>
  );
}
