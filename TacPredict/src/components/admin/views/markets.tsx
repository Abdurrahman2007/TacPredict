import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, ArrowUpRight, LockKeyhole, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getAdminMarketCards,
  adminMarketCountsOptions,
} from "@/lib/protocol/admin-dashboard.functions";
import { adminMoney, marketType } from "@/lib/protocol/admin-dashboard.mjs";
import { formatTimestamp } from "@/lib/protocol/admin-rows.mjs";
import { Badge, Card, Loaded, PageHeader, statusTone } from "../admin-ui";
import { CreateMarket } from "./create-market";
export function MarketsView({ view }: { view: string }) {
  return view === "create" ? (
    <CreateMarket />
  ) : (
    <MarketList
      key={view}
      initialFilter={view === "live" ? "open" : view === "closed" ? "closed" : "all"}
    />
  );
}
function MarketList({ initialFilter }: { initialFilter: "all" | "open" | "closed" }) {
  const [filter, setFilter] = useState(initialFilter),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState("");
  const counts = useQuery(adminMarketCountsOptions);
  const q = useQuery({
    queryKey: ["admin-market-cards", page, filter, search],
    queryFn: () => getAdminMarketCards({ data: { page, filter, search } }),
    retry: 0,
    staleTime: 15000,
  });
  return (
    <div className="adm-stack">
      <PageHeader
        title="Markets"
        actions={
          <Link
            className="adm-btn adm-btn-primary"
            to="/admin/$section"
            params={{ section: "markets" }}
            search={{ view: "create" }}
          >
            <Plus size={16} />
            Create market
          </Link>
        }
      />
      <div className="adm-list-toolbar">
        <div className="adm-tabs" aria-label="Market status">
          {(["all", "open", "closed"] as const).map((f) => (
            <button
              type="button"
              className="adm-tab"
              key={f}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
            >
              {f === "all" ? "All" : f === "open" ? "Open" : "Closed"}{" "}
              <span className="adm-caption">{counts.data?.[f === "all" ? "total" : f] ?? "—"}</span>
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(draft.trim());
            setPage(0);
          }}
          className="adm-search-form"
        >
          <input
            type="search"
            className="adm-input"
            aria-label="Search markets"
            placeholder="Search market title"
            maxLength={100}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="adm-btn" type="submit">
            Search
          </button>
        </form>
      </div>
      <Loaded query={q} label="markets">
        {(data) => (
          <>
            <p className="adm-caption">
              {data.total} {search ? "matching " : ""}markets · Indexed Base Exchange
            </p>
            <div className="adm-market-grid">
              {data.rows.map((m) => (
                <Card key={m.id}>
                  <div className="adm-market-card-top">
                    <Badge tone="mute">{marketType(m.category, m.subcategory)}</Badge>
                    <Badge tone={statusTone(m.status)}>
                      {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                  <h2 className="adm-market-card-title">{m.title}</h2>
                  <span className="adm-caption adm-mono">{m.market_id}</span>
                  <div className="adm-market-card-metrics">
                    <div>
                      <small>Volume · USDC</small>
                      <b>{adminMoney(m.volumeAtomic)}</b>
                    </div>
                    <div>
                      <small>Participants</small>
                      <b>{m.participants ?? "Unavailable"}</b>
                    </div>
                  </div>
                  <div className="adm-market-card-bottom">
                    <span className="adm-caption">
                      Closes {formatTimestamp(m.close_at) ?? "Unavailable"}
                    </span>
                    <Link
                      className="adm-btn"
                      to="/admin/$section"
                      params={{ section: "resolution" }}
                      search={{ view: "pending" }}
                    >
                      Manage <ArrowUpRight size={14} />
                    </Link>
                  </div>
                  <details className="adm-card-details">
                    <summary>
                      <LockKeyhole size={13} /> Locked terms
                    </summary>
                    <p className="adm-caption">
                      Published title, rules and timing are immutable. Create a new market for
                      changes.
                    </p>
                    <span className="adm-mono adm-caption">{m.metadata_hash}</span>
                  </details>
                </Card>
              ))}
            </div>
            {data.rows.length === 0 && (
              <Card>
                <p className="adm-empty-short">No markets found</p>
              </Card>
            )}
            <div className="adm-pagination">
              <button
                className="adm-btn"
                disabled={page === 0 || q.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <span>Page {page + 1}</span>
              <button
                className="adm-btn"
                disabled={(page + 1) * 12 >= data.total || q.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}
      </Loaded>
      <div className="adm-inline">
        <Link
          className="adm-btn"
          to="/admin/$section"
          params={{ section: "engine" }}
          search={{ view: "fixtures" }}
        >
          Sports drafts
        </Link>
        <Link
          className="adm-btn"
          to="/admin/$section"
          params={{ section: "pool" }}
          search={{ view: "rounds" }}
        >
          Pool rounds
        </Link>
      </div>
    </div>
  );
}
