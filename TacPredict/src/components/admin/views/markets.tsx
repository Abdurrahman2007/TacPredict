import { Fragment, useMemo, useState } from "react";
import {
  atomicToDecimal,
  countMarketsByStatus,
  formatTimestamp,
  parseMarketRow,
  shortHash,
  type AdminRow,
  type ParsedMarket,
} from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot } from "../admin-data";
import { Badge, Card, Loaded, PageHeader, statusTone, Tile } from "../admin-ui";
import { CreateMarket } from "./create-market";

type OnchainMarket = Extract<ParsedMarket, { kind: "market" }>;
type PreparedMarket = Extract<ParsedMarket, { kind: "terms" }>;

const VIEWS: Record<string, { title: string; subtitle: string; statuses: string[] | null }> = {
  all: {
    title: "All markets",
    subtitle: "Every market on Base, newest first.",
    statuses: null,
  },
  live: {
    title: "Live markets",
    subtitle: "Open for trading now.",
    statuses: ["OPEN"],
  },
  upcoming: {
    title: "Upcoming markets",
    subtitle: "Created, not open yet.",
    statuses: ["DRAFT", "UPCOMING"],
  },
  closed: {
    title: "Closed markets",
    subtitle: "Trading ended, waiting for a resolution.",
    statuses: ["CLOSED"],
  },
  resolving: {
    title: "Resolving markets",
    subtitle: "Outcome proposed, challenge window running.",
    statuses: ["RESOLVING"],
  },
  resolved: {
    title: "Resolved markets",
    subtitle: "Finished, voided or cancelled.",
    statuses: ["RESOLVED", "SETTLED", "VOID", "CANCELLED"],
  },
};

function usdc(atomic: string | null) {
  const text = atomicToDecimal(atomic);
  return text === null ? "Unavailable" : `${text} USDC`;
}

export function MarketsView({ view }: { view: string }) {
  if (view === "create") return <CreateMarket />;
  const config = VIEWS[view] ?? VIEWS["all"]!;
  return <MarketList key={view} config={config} showSummary={!VIEWS[view] || view === "all"} />;
}

function MarketList({
  config,
  showSummary,
}: {
  config: { title: string; subtitle: string; statuses: string[] | null };
  showSummary: boolean;
}) {
  const query = useAdminSnapshot("Markets");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="adm-stack">
      <PageHeader title={config.title} subtitle={config.subtitle} />
      <Loaded query={query} label="markets">
        {(snapshot) => (
          <MarketTable
            snapshot={snapshot.rows}
            config={config}
            showSummary={showSummary}
            search={search}
            setSearch={setSearch}
            open={open}
            setOpen={setOpen}
          />
        )}
      </Loaded>
    </div>
  );
}

function MarketTable({
  snapshot,
  config,
  showSummary,
  search,
  setSearch,
  open,
  setOpen,
}: {
  snapshot: AdminRow[];
  config: { statuses: string[] | null };
  showSummary: boolean;
  search: string;
  setSearch: (value: string) => void;
  open: string | null;
  setOpen: (value: string | null) => void;
}) {
  const parsed = useMemo(() => snapshot.map(parseMarketRow), [snapshot]);
  const markets = useMemo(
    () => parsed.filter((m): m is OnchainMarket => m.kind === "market"),
    [parsed],
  );
  const terms = useMemo(
    () => parsed.filter((m): m is PreparedMarket => m.kind === "terms"),
    [parsed],
  );
  const counts = useMemo(() => countMarketsByStatus(markets), [markets]);
  const needle = search.trim().toLowerCase();
  const visible = markets.filter((m) => {
    if (config.statuses && !(m.status && config.statuses.includes(m.status))) return false;
    if (!needle) return true;
    return [m.code, m.title, m.onchainId, m.questionId, m.conditionId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  return (
    <>
      {showSummary ? (
        <div className="adm-grid-tiles">
          <Tile label="Markets" value={markets.length} />
          <Tile label="Open" value={counts["OPEN"] ?? 0} />
          <Tile
            label="Closed or resolving"
            value={(counts["CLOSED"] ?? 0) + (counts["RESOLVING"] ?? 0)}
          />
          <Tile
            label="Resolved"
            value={(counts["RESOLVED"] ?? 0) + (counts["SETTLED"] ?? 0)}
          />
        </div>
      ) : null}

      <Card flush>
        <div className="adm-card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <input
            className="adm-input"
            style={{ maxWidth: 320 }}
            type="search"
            placeholder="Search code, title or ID"
            aria-label="Search markets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {visible.length === 0 ? (
          <div className="adm-card-body">
            <p className="adm-muted" style={{ margin: 0 }}>
              {markets.length === 0
                ? "No markets yet. They appear here once created on Base."
                : "Nothing here."}
            </p>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Status</th>
                  <th>Closes</th>
                  <th className="num">Liquidity</th>
                  <th aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const expanded = open === m.id;
                  return (
                    <Fragment key={m.id}>
                      <tr className={expanded ? "adm-row-open" : undefined}>
                        <td>
                          <div style={{ fontWeight: 650 }}>{m.title}</div>
                          <div className="adm-mono adm-muted">{m.code}</div>
                        </td>
                        <td>
                          <Badge tone={statusTone(m.status)}>{m.status ?? "Unknown"}</Badge>
                        </td>
                        <td>{formatTimestamp(m.closeAt) ?? "Unavailable"}</td>
                        <td className="num">{usdc(m.liquidityAtomic)}</td>
                        <td>
                          <button
                            type="button"
                            className="adm-link"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : m.id)}
                          >
                            {expanded ? "Hide" : "IDs"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="adm-row-open">
                          <td colSpan={5}>
                            <dl className="adm-kv">
                              <dt>On-chain market ID</dt>
                              <dd className="adm-mono">{m.onchainId ?? "Unavailable"}</dd>
                              <dt>Question ID</dt>
                              <dd className="adm-mono">{m.questionId ?? "Unavailable"}</dd>
                              <dt>Condition ID</dt>
                              <dd className="adm-mono">{m.conditionId ?? "Unavailable"}</dd>
                              <dt>Indexed at</dt>
                              <dd>{formatTimestamp(m.createdAt) ?? "Unavailable"}</dd>
                            </dl>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showSummary && terms.length > 0 ? (
        <Card title="Prepared, not published yet">
          <p className="adm-muted" style={{ marginTop: 0 }}>
            Terms are saved. Publish them from Create market with your wallet.
          </p>
          <div className="adm-table-wrap" style={{ marginTop: 12 }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Hash</th>
                  <th>Prepared</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 650 }}>{t.title}</td>
                    <td className="adm-mono" title={t.metadataHash}>
                      {shortHash(t.metadataHash, 10, 8)}
                    </td>
                    <td>{formatTimestamp(t.createdAt) ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
