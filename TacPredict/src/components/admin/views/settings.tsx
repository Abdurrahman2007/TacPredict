import { formatTimestamp } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import { Badge, Card, Loaded, Notice, PageHeader, Unavailable } from "../admin-ui";

const CATEGORIES = ["Crypto", "Sports", "News", "Technology", "Business", "Culture", "Other"];

export function SettingsView({ view }: { view: string }) {
  switch (view) {
    case "admins":
      return <AdminsView />;
    case "categories":
      return <CategoriesView />;
    case "providers":
      return <ProvidersView />;
    case "audit":
      return <AuditView />;
    default:
      return <SystemView />;
  }
}

function AdminsView() {
  const query = useAdminSnapshot("Settings");
  return (
    <div className="adm-stack">
      <PageHeader title="Admins & roles" subtitle="Who can open this workspace and what they may do." />
      <Loaded query={query} label="permission boundary">
        {(snapshot) => {
          const row = snapshot.rows.find((r) => r.id === "security");
          return row ? <Notice>{row.detail}</Notice> : null;
        }}
      </Loaded>
      <Unavailable
        title="Role management is not enabled"
        needs="Separate role definitions (owner, operator, resolver, support), an audited grant workflow and per-page enforcement."
      >
        Today access needs an assigned database admin role plus a verified authenticator code.
        Roles are granted directly in Supabase by an owner. Every administrator has the same
        read access here; contract actions still require on-chain role holders.
      </Unavailable>
    </div>
  );
}

function CategoriesView() {
  return (
    <div className="adm-stack">
      <PageHeader title="Categories" subtitle="Categories accepted when preparing market terms." />
      <Card title="Current categories">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CATEGORIES.map((c) => (
            <Badge key={c} tone="brand">
              {c}
            </Badge>
          ))}
        </div>
      </Card>
      <Notice>
        This list is fixed in the application and the database check. Editing categories needs a
        code and migration change, so it is read-only here.
      </Notice>
    </div>
  );
}

function ProvidersView() {
  return (
    <div className="adm-stack">
      <PageHeader title="Providers" subtitle="External services the application depends on." />
      <Card flush>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Used for</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 650 }}>Base RPC</td>
                <td>Live chain reads, indexing and wallet transactions</td>
                <td>Server environment variable</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 650 }}>Supabase</td>
                <td>Authentication, roles and indexed protocol data</td>
                <td>Supabase project settings</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 650 }}>CoinGecko</td>
                <td>Crypto price context on market cards</td>
                <td>Server environment variable</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 650 }}>Polymarket</td>
                <td>Discovery of candidate markets and reference odds</td>
                <td>AI market importer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Notice>
        Provider keys are never shown or editable in the browser. They live only in server
        configuration.
      </Notice>
    </div>
  );
}

function SystemView() {
  const live = useLiveChain();
  const dashboard = useAdminSnapshot("Dashboard");
  return (
    <div className="adm-stack">
      <PageHeader
        title="System"
        subtitle="Live status of the chain connection and the indexer."
        actions={
          <button
            type="button"
            className="adm-btn"
            disabled={live.isFetching}
            onClick={() => void live.refetch()}
          >
            {live.isFetching ? "Reading Base…" : "Refresh from Base"}
          </button>
        }
      />
      <Loaded query={live} label="chain status">
        {(data) => (
          <Card title="Base Mainnet">
            <dl className="adm-kv">
              <dt>Network</dt>
              <dd>Base Mainnet (chain {data.chainId})</dd>
              <dt>Head block</dt>
              <dd>{data.blockNumber ?? "Unavailable"}</dd>
              <dt>Trading</dt>
              <dd>
                {data.tradingPaused === null ? (
                  "Unavailable"
                ) : data.tradingPaused ? (
                  <Badge tone="warn">Paused on-chain</Badge>
                ) : (
                  <Badge tone="ok">Not paused</Badge>
                )}
              </dd>
              <dt>RPC source</dt>
              <dd>{data.rpcSource === "protocol" ? "Configured provider" : "Public endpoint (rate-limited)"}</dd>
              <dt>Observed</dt>
              <dd>{formatTimestamp(data.observedAt) ?? data.observedAt}</dd>
            </dl>
          </Card>
        )}
      </Loaded>
      <Loaded query={dashboard} label="indexer status">
        {(snapshot) => {
          const job = snapshot.rows.find((r) => r.id === "last-job");
          return (
            <Card title="Indexer job">
              <dl className="adm-kv">
                <dt>Latest status</dt>
                <dd>{job?.detail ?? "Unavailable"}</dd>
                <dt>Finished</dt>
                <dd>{formatTimestamp(job?.observedAt) ?? "Unavailable"}</dd>
              </dl>
            </Card>
          );
        }}
      </Loaded>
    </div>
  );
}

function AuditView() {
  const query = useAdminSnapshot("Audit");
  return (
    <div className="adm-stack">
      <PageHeader title="Audit logs" subtitle="Most recent 50 recorded administrator actions." />
      <Loaded query={query} label="audit log">
        {(snapshot) => (
          <Card flush>
            {snapshot.rows.length === 0 ? (
              <div className="adm-card-body">
                <p className="adm-muted" style={{ margin: 0 }}>
                  No audit entries have been recorded.
                </p>
              </div>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rows.map((r) => (
                      <tr key={r.id}>
                        <td>{formatTimestamp(r.observedAt) ?? "Unavailable"}</td>
                        <td style={{ fontWeight: 650 }}>{r.label}</td>
                        <td className="adm-mono" style={{ overflowWrap: "anywhere" }}>
                          {r.detail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </Loaded>
    </div>
  );
}
