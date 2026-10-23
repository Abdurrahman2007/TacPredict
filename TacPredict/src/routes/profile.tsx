import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import { useState, useSyncExternalStore } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  RefreshCw,
  Search,
  ArrowDown,
  ArrowUp,
  Share2,
  Wallet,
  Eye,
  EyeOff,
  SlidersHorizontal,
  ArrowUpRight,
  Layers3,
  CircleDollarSign,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { PortfolioPerformanceChart } from "@/components/portfolio-performance-chart";
import { NativePortfolio } from "@/components/native-portfolio";
import { useLoginDialog } from "@/components/login-dialog";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { useOwnProtocolOrders } from "@/lib/protocol/portfolio-orders";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { overviewMoney, selectedWalletSummary } from "@/lib/protocol/portfolio-view.mjs";
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
const subscribeHydration = () => () => {};
function PortfolioPage() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  return ready ? (
    <PortfolioClient />
  ) : (
    <main className="tp-portfolio" aria-busy="true" aria-label="Loading portfolio" />
  );
}
function PortfolioClient() {
  const wallet = useBaseWallet(),
    q = useNativePortfolio(),
    orders = useOwnProtocolOrders(),
    auth = useProtocolUser(),
    login = useLoginDialog();
  const [sortOpen, setSortOpen] = useState(false);
  const [hidden, setHidden] = useOverviewPrivacy();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [range, setRange] = useState<keyof typeof periods>("1D"),
    [tab, setTab] = useState("Positions"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("value"),
    [descending, setDescending] = useState(true),
    [activeOnly, setActiveOnly] = useState(false),
    [notice, setNotice] = useState("");
  const [category, setCategory] = useState("All"),
    [state, setState] = useState("All");
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
  // Zero is a disconnected preview, never a fallback for a failed live read.
  const disconnected = !wallet.address;
  const show = (value: bigint | null) => overviewMoney(value, !disconnected, hidden);
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
    <main className="tp-portfolio">
      <header className="tp-portfolio-heading">
        <div>
          <p className="tp-eyebrow">YOUR OVERVIEW</p>
          <h1>Portfolio</h1>
        </div>
        <div className="tp-heading-actions">
          <button
            className="tp-icon"
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show overview balances" : "Hide overview balances"}
            aria-pressed={hidden}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
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
            <RefreshCw size={17} className={q.isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </header>
      <section className="tp-overview-grid" aria-label="Portfolio balances">
        <div className="tp-value-card">
          <div className="tp-card-top">
            <span>
              <Layers3 size={16} />
              Position value
            </span>
            <span className="tp-network">
              <i />
              Base
            </span>
          </div>
          <div
            className="tp-hero-value"
            title="Last-trade marked holdings, not a guaranteed sale price"
          >
            {show(total)}
          </div>
          <p className="tp-hero-note">
            {disconnected
              ? "Your next chapter starts here."
              : summary.verified
                ? "Holdings at the last indexed trade"
                : "Verify your wallet to view holdings"}
          </p>
          <div className="tp-hero-bottom">
            <span className="tp-wallet-address">
              <Wallet size={14} />
              {disconnected
                ? "Wallet not connected"
                : `${wallet.address!.slice(0, 6)}…${wallet.address!.slice(-4)}`}
            </span>
            {!disconnected && (
              <button
                className="tp-icon"
                onClick={() => void copyAddress()}
                aria-label="Copy wallet address"
              >
                <Copy size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="tp-wallet-card">
          <div className="tp-card-top">
            <span>
              <CircleDollarSign size={16} />
              Wallet USDC
            </span>
            <span className="tp-currency">USDC</span>
          </div>
          <strong className="tp-cash-value">{show(cash)}</strong>
          <div className="tp-claim-row">
            <span>Claimable</span>
            <b>{show(claimable)}</b>
          </div>
          {disconnected ? (
            <button className="tp-connect" onClick={() => login("/profile")}>
              Connect wallet
              <ArrowUpRight size={16} />
            </button>
          ) : (
            <p className="tp-cash-note">
              {wallet.chainId !== 8453
                ? "Unsupported network · switch to Base"
                : wallet.error
                  ? "Balance could not load · refresh to retry"
                  : "USDC stays in your wallet"}
            </p>
          )}
        </div>
      </section>
      {!disconnected && (q.isError || wallet.error) && (
        <div className="tp-data-warning" role="alert">
          Some data could not load. Refresh to retry; missing amounts are shown as —.
        </div>
      )}
      <section className="tp-pl" aria-label="Portfolio performance">
        <div className="tp-pl-head">
          <div>
            <p className="tp-eyebrow">PERFORMANCE</p>
            <h2>Profit & loss</h2>
          </div>
          <button
            aria-label="Share portfolio link"
            className="tp-icon"
            onClick={() => void share()}
          >
            <Share2 size={17} />
          </button>
        </div>
        <div className="tp-pl-value">
          <strong>{show(pnl)}</strong>
          <span>
            {disconnected
              ? "Connect to track performance"
              : noHistory
                ? "No trades yet"
                : "Verified P&L not yet available"}
          </span>
        </div>
        <div className="tp-periods" aria-label="Performance period">
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
        <PortfolioPerformanceChart
          key={range}
          empty={noHistory}
          preview={disconnected}
          hidden={hidden}
          period={periods[range]}
        />
      </section>
      <section className="tp-holdings" aria-label="Portfolio activity">
        <div className="tp-holdings-heading">
          <h2>Your activity</h2>
          <span>{disconnected ? "Ready when you are" : "Indexed Exchange"}</span>
        </div>
        <div className="tp-segment" aria-label="Portfolio views">
          {["Positions", "Orders", "History"].map((item) => (
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
        {!disconnected && (
          <div className="tp-filters">
            <label className="tp-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Search portfolio"
                placeholder="Search your markets"
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
            {tab === "Positions" && (
              <button
                className={`tp-sort ${filtersOpen ? "on" : ""}`}
                aria-label="Show filters"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal size={17} />
              </button>
            )}
          </div>
        )}
        {!disconnected && filtersOpen && tab === "Positions" && (
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
            {(category !== "All" || state !== "All") && (
              <button
                className="tp-select"
                onClick={() => {
                  setCategory("All");
                  setState("All");
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
          {disconnected ? (
            <div className="tp-start-state">
              <div className="tp-empty-icon">
                <Wallet size={25} strokeWidth={1.5} />
              </div>
              <h3>Your portfolio, all in one place</h3>
              <p>Connect your wallet to see positions, orders and history.</p>
              <button className="tp-connect" onClick={() => login("/profile")}>
                Connect wallet
                <ArrowUpRight size={16} />
              </button>
              <Link to="/markets" className="tp-explore">
                Explore markets
                <ArrowUpRight size={14} />
              </Link>
            </div>
          ) : (
            <NativePortfolio
              tab={tab === "History" ? "Activity" : tab === "Orders" ? "Open" : tab}
              search={search}
              sort={sort}
              descending={descending}
              activeOnly={activeOnly}
              category={category}
              state={state}
              since=""
            />
          )}
        </div>
      </section>
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
    </main>
  );
}
