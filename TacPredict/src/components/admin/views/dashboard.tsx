import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Users,
  Activity,
  Wallet,
  Layers3,
  CircleDollarSign,
  Clock3,
} from "lucide-react";
import {
  adminMarketCountsOptions,
  adminTreasuryOptions,
} from "@/lib/protocol/admin-dashboard.functions";
import { adminUsersQueryOptions } from "@/lib/protocol/admin-users.functions";
import { countFromDetail, adminMoney } from "@/lib/protocol/admin-dashboard.mjs";
import { matchesUserSearch } from "@/lib/protocol/admin-users.mjs";
import { shortHash } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import { Badge, Card, Loaded, PageHeader, Tile } from "../admin-ui";
export function DashboardView() {
  const main = useAdminSnapshot("Dashboard"),
    volume = useAdminSnapshot("Analytics"),
    accounts = useAdminSnapshot("Users"),
    recent = useQuery(adminUsersQueryOptions),
    counts = useQuery(adminMarketCountsOptions),
    treasury = useQuery(adminTreasuryOptions),
    live = useLiveChain();
  const [search, setSearch] = useState("");
  const byId = Object.fromEntries((main.data?.rows ?? []).map((r) => [r.id, r]));
  const metrics = [
    {
      label: "Total users",
      value: countFromDetail(accounts.data?.rows.find((r) => r.id === "users")?.detail),
      icon: Users,
    },
    {
      label: "Total volume · USDC",
      value: main.isError ? null : adminMoney(byId["volume"]?.usdcAtoms),
      icon: CircleDollarSign,
    },
    {
      label: "24h volume · USDC",
      value: volume.isError
        ? null
        : adminMoney(volume.data?.rows.find((r) => r.id === "volume24")?.usdcAtoms),
      icon: Clock3,
    },
    { label: "Active markets", value: counts.data?.active, icon: Activity },
    { label: "Open markets", value: counts.data?.open, icon: Layers3 },
    { label: "Treasury · USDC", value: adminMoney(treasury.data?.balanceAtomic), icon: Wallet },
  ];
  return (
    <div className="adm-stack">
      <PageHeader
        title="Overview"
        actions={
          <Link
            className="adm-btn adm-btn-primary"
            to="/admin/$section"
            params={{ section: "markets" }}
            search={{ view: "create" }}
          >
            <Plus size={16} /> Create market
          </Link>
        }
      />
      <div className="adm-health-strip">
        <span className="adm-inline">
          <span className="adm-network-dot" />
          Base Mainnet
        </span>
        <Badge tone={live.data?.tradingPaused === false ? "ok" : "warn"}>
          {live.data?.tradingPaused === false
            ? "Unpaused"
            : live.data?.tradingPaused === true
              ? "Paused"
              : "Checking"}
        </Badge>
        <span className="adm-muted">Exchange · indexed data</span>
        <button
          className="adm-link"
          onClick={() =>
            void Promise.all([
              main.refetch(),
              volume.refetch(),
              counts.refetch(),
              accounts.refetch(),
              recent.refetch(),
              treasury.refetch(),
              live.refetch(),
            ])
          }
        >
          Refresh
        </button>
      </div>
      <div className="adm-kpi-grid">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div className="adm-kpi" key={label}>
            <span className="adm-kpi-icon">
              <Icon size={17} />
            </span>
            <Tile label={label} value={value ?? "Unavailable"} />
          </div>
        ))}
      </div>
      {treasury.data?.address ? (
        <div className="adm-caption">
          Treasury <span className="adm-mono">{shortHash(treasury.data.address)}</span>
        </div>
      ) : (
        <div className="adm-caption">Treasury not configured. Active = Open + Upcoming.</div>
      )}
      <div className="adm-dashboard-grid">
        <Card
          title="Users"
          actions={
            <Link
              className="adm-link adm-inline"
              to="/admin/$section"
              params={{ section: "users" }}
              search={{ view: "users" }}
            >
              View all <ArrowUpRight size={14} />
            </Link>
          }
        >
          <input
            className="adm-input"
            type="search"
            aria-label="Search recent users"
            placeholder="Search users or wallet"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Loaded query={recent} label="users">
            {(d) => (
              <div className="adm-recent-list">
                {d.truncated && <p className="adm-caption">Newest 1,000 accounts</p>}
                {d.users
                  .filter((u) => matchesUserSearch(u, search))
                  .slice(0, 5)
                  .map((u) => (
                    <Link
                      key={u.id}
                      className="adm-recent-row"
                      to="/admin/$section"
                      params={{ section: "users" }}
                      search={{ view: "users" }}
                    >
                      <span className="adm-user-glyph">
                        <Users size={17} />
                      </span>
                      <span className="adm-row-copy">
                        <b>{u.email ?? shortHash(u.wallets[0] ?? u.id)}</b>
                        <small>{u.wallets[0] ? shortHash(u.wallets[0]) : "No linked wallet"}</small>
                      </span>
                      <Badge tone={u.suspended ? "bad" : "ok"}>
                        {u.suspended ? "Suspended" : "Active"}
                      </Badge>
                    </Link>
                  ))}
                {!d.users.filter((u) => matchesUserSearch(u, search)).length && (
                  <p className="adm-empty-short">No users found</p>
                )}
              </div>
            )}
          </Loaded>
        </Card>
        <Card
          title="Markets"
          actions={
            <Link
              className="adm-link adm-inline"
              to="/admin/$section"
              params={{ section: "markets" }}
              search={{ view: "all" }}
            >
              View all <ArrowUpRight size={14} />
            </Link>
          }
        >
          <Loaded query={counts} label="market counts">
            {(d) => (
              <>
                <div className="adm-market-total">
                  <strong>{d.total ?? "—"}</strong>
                  <span className="adm-muted">Total markets</span>
                </div>
                <div className="adm-split-counts">
                  <Link
                    to="/admin/$section"
                    params={{ section: "markets" }}
                    search={{ view: "live" }}
                  >
                    <Badge tone="ok">Open</Badge>
                    <strong>{d.open ?? "—"}</strong>
                  </Link>
                  <Link
                    to="/admin/$section"
                    params={{ section: "markets" }}
                    search={{ view: "closed" }}
                  >
                    <Badge tone="mute">Closed</Badge>
                    <strong>{d.closed ?? "—"}</strong>
                  </Link>
                </div>
                <Link
                  className="adm-btn"
                  to="/admin/$section"
                  params={{ section: "pool" }}
                  search={{ view: "status" }}
                >
                  Up/Down Pool <ArrowUpRight size={14} />
                </Link>
              </>
            )}
          </Loaded>
        </Card>
      </div>
    </div>
  );
}
