import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  RefreshCw,
  Search,
  ArrowDown,
  ArrowUp,
  Share2,
  Wallet,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import { NativePortfolio } from "@/components/native-portfolio";
import { useLoginDialog } from "@/components/login-dialog";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { useOwnProtocolOrders } from "@/lib/protocol/portfolio-orders";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { money, selectedWalletSummary } from "@/lib/protocol/portfolio-view.mjs";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { useQuery } from "@tanstack/react-query";
import portfolioCss from "@/styles/portfolio-reference.css?url";
export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Portfolio — TacPredict" }],
    links: [{ rel: "stylesheet", href: portfolioCss }],
  }),
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
    login = useLoginDialog();
  const [sortOpen, setSortOpen] = useState(false);
  const [range, setRange] = useState<keyof typeof periods>("1D"),
    [tab, setTab] = useState("Positions"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("value"),
    [descending, setDescending] = useState(true),
    [activeOnly, setActiveOnly] = useState(false),
    [notice, setNotice] = useState("");
  const [category, setCategory] = useState("All"),
    [state, setState] = useState("All"),
    [since, setSince] = useState("");
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const walletKnown = Boolean(
    wallet.address && wallet.chainId === 8453 && wallet.usdc !== null && !wallet.error,
  );
  const summary = selectedWalletSummary(
    q.data?.positions ?? [],
    wallet.address,
    q.data?.verifiedWallets ?? [],
    Boolean(auth.ready && auth.user && !q.isPending && !q.isError),
  );
  const show = (value: bigint | null) => money(value);
  // Position value is last-trade marked, not an executable quote. Wallet USDC is never added.
  const total = summary.markedAtomic;
  const cash = walletKnown ? wallet.usdc : null;
  const claimable = summary.claimableAtomic;
  const noHistory = Boolean(
    summary.verified && q.data?.activity?.length === 0 && summary.positions.length === 0,
  );
  const pnl = noHistory ? 0n : null;
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
    <div className="tp-portfolio tp-portfolio-enter">
      <div className="tp-portfolio-heading">
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
      <section className="tp-balances" aria-label="Portfolio balances">
        <div className="tp-b-left">
          <p className="tp-label">Position value</p>
          <div className="tp-big">
            <span className={total === null ? "tp-unavailable" : ""}>{show(total)}</span>
          </div>
        </div>
        <div className="tp-b-right">
          <p className="tp-label">Wallet USDC</p>
          <p className={`tp-big tp-med ${cash === null ? "tp-unavailable" : ""}`}>{show(cash)}</p>
          {claimable !== null && claimable > 0n ? (
            <span className="tp-status">Claimable {show(claimable)}</span>
          ) : null}
        </div>
      </section>
      <div className="tp-account-context" role="status">
        <span>
          {wallet.address
            ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
            : "Connect a wallet to view your portfolio"}
        </span>
        <span>
          {wallet.address
            ? wallet.chainId === 8453
              ? "Base Mainnet"
              : "Unsupported network · switch to Base"
            : "Base Mainnet · native USDC"}
        </span>
        <details>
          <summary>How values are calculated</summary>
          <p>
            Position value uses finalized holdings at the last indexed trade, not a guaranteed sale
            price. Wallet USDC is separate; claimable is not added twice. Profit/loss requires
            verified cost basis and is unavailable when that history is missing.
          </p>
        </details>
      </div>
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
          <strong className={pnl === null ? "tp-unavailable" : ""}>{show(pnl)}</strong>
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
            All-time <b>{show(pnl)}</b>
          </span>
        </div>
        <PortfolioPerformanceChart key={range} empty={noHistory} period={periods[range]} />
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
            <Popover open={sortOpen} onOpenChange={setSortOpen}>
              <PopoverTrigger asChild>
                <button className="tp-select" aria-label="Sort positions">
                  {sort === "value" ? "Current value" : sort === "shares" ? "Shares" : "Recent"}
                  <ChevronDown aria-hidden="true" size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="tp-sort-menu w-44 p-1" align="end">
                <div role="listbox" aria-label="Position sort order">
                  {(
                    [
                      ["value", "Current value"],
                      ["shares", "Shares"],
                      ["recent", "Recent"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      role="option"
                      aria-selected={sort === value}
                      className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-sm hover:bg-secondary"
                      onClick={() => {
                        setSort(value);
                        setSortOpen(false);
                      }}
                    >
                      {label}
                      {sort === value && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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
      {tab === "Positions" && (
        <div className="tp-detail-filters">
          <label>
            Category
            <select
              aria-label="Filter position category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["All", "Crypto", "Football", "Cricket"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Filter position status"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              {["All", "Open", "Closed"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Updated since (UTC)
            <input
              aria-label="Positions updated since UTC"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
          {(category !== "All" || state !== "All" || since) && (
            <button
              className="tp-select"
              onClick={() => {
                setCategory("All");
                setState("All");
                setSince("");
              }}
            >
              Clear filters
            </button>
          )}
          {category !== "All" && (feed.isError || Boolean(feed.data?.error)) && (
            <p role="alert">
              Market classification unavailable. Retry market data before using category filters.
            </p>
          )}
        </div>
      )}
      <div className="tp-results">
        <NativePortfolio
          tab={tab === "History" ? "Activity" : tab}
          search={search}
          sort={sort}
          descending={descending}
          activeOnly={activeOnly}
          category={category}
          state={state}
          since={since}
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
    </div>
  );
}
