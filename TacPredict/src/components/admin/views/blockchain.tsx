import {
  atomicToDecimal,
  blockLag,
  formatDuration,
  formatTimestamp,
  parseBlockchainRows,
  shortHash,
} from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import {
  AddressLink,
  Badge,
  BASESCAN,
  Card,
  Loaded,
  Notice,
  PageHeader,
  Tile,
} from "../admin-ui";

function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" className="adm-btn" disabled={busy} onClick={onClick}>
      {busy ? "Reading Base…" : "Refresh from Base"}
    </button>
  );
}

export function BlockchainView({ view }: { view: string }) {
  switch (view) {
    case "oracle":
      return <OracleView />;
    case "indexer":
      return <IndexerView />;
    default:
      return <ContractsView />;
  }
}

function ContractsView() {
  const snapshot = useAdminSnapshot("Blockchain");
  const live = useLiveChain();
  return (
    <div className="adm-stack">
      <PageHeader
        title="Contracts"
        subtitle="TacPredict contracts on Base."
        actions={<RefreshButton onClick={() => void live.refetch()} busy={live.isFetching} />}
      />
      <Loaded query={snapshot} label="deployment">
        {(data) => {
          const { deployment } = parseBlockchainRows(data.rows);
          if (!deployment)
            return (
              <Notice tone="warn">No verified deployment is recorded yet.</Notice>
            );
          return (
            <>
              <div className="adm-grid-tiles">
                <Tile label="Network" value="Base Mainnet" hint="Chain 8453" />
                <Tile
                  label="Trading pause (live)"
                  value={
                    live.isPending ? (
                      "Reading…"
                    ) : live.isError || live.data?.tradingPaused == null ? (
                      "Unavailable"
                    ) : live.data.tradingPaused ? (
                      <Badge tone="warn">Paused</Badge>
                    ) : (
                      <Badge tone="ok">Not paused</Badge>
                    )
                  }
                  hint="Live from Base"
                />
                <Tile
                  label="Trading flag (database)"
                  value={
                    deployment.databaseTradingEnabled === null
                      ? "Unavailable"
                      : deployment.databaseTradingEnabled
                        ? "Enabled"
                        : "Disabled"
                  }
                  hint="Saved setting"
                />
                <Tile
                  label="Markets created (live)"
                  value={live.data?.nextMarketId ?? (live.isPending ? "Reading…" : "Unavailable")}
                  hint="Live from Base"
                />
              </div>
              <Card flush>
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Address</th>
                        <th>Explorer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deployment.contracts.map((c) => (
                        <tr key={c.name}>
                          <td style={{ fontWeight: 650 }}>{c.name}</td>
                          <td>
                            <AddressLink address={c.address} />
                          </td>
                          <td>
                            <a
                              className="adm-link"
                              href={`${BASESCAN}/address/${c.address}#code`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Verified source
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          );
        }}
      </Loaded>
    </div>
  );
}

function OracleView() {
  const live = useLiveChain();
  const snapshot = useAdminSnapshot("Blockchain");
  return (
    <div className="adm-stack">
      <PageHeader
        title="Oracle"
        subtitle="Resolution settings, read from the contract."
        actions={<RefreshButton onClick={() => void live.refetch()} busy={live.isFetching} />}
      />
      <Loaded query={live} label="oracle settings">
        {(data) => {
          const bond = data.oracleBondAtomic ? atomicToDecimal(data.oracleBondAtomic) : null;
          const challenge = data.challengePeriodSeconds
            ? formatDuration(data.challengePeriodSeconds)
            : null;
          return (
            <div className="adm-grid-tiles">
              <Tile
                label="Bond per proposal"
                value={bond === null ? "Unavailable" : `${bond} USDC`}
                hint="Per proposal"
              />
              <Tile
                label="Challenge period"
                value={challenge ?? "Unavailable"}
                hint="Time to dispute"
              />
              <Tile label="Observed" value={formatTimestamp(data.observedAt) ?? "Unavailable"} />
            </div>
          );
        }}
      </Loaded>
      <Loaded query={snapshot} label="oracle address">
        {(data) => {
          const oracle = parseBlockchainRows(data.rows).deployment?.contracts.find(
            (c) => c.name === "Oracle",
          );
          return oracle ? (
            <Card title="Oracle contract">
              <AddressLink address={oracle.address} />
            </Card>
          ) : null;
        }}
      </Loaded>
    </div>
  );
}

function IndexerView() {
  const snapshot = useAdminSnapshot("Blockchain");
  const dashboard = useAdminSnapshot("Dashboard");
  const live = useLiveChain();
  return (
    <div className="adm-stack">
      <PageHeader
        title="Indexer"
        subtitle="How far the indexer has read compared with Base."
        actions={<RefreshButton onClick={() => void live.refetch()} busy={live.isFetching} />}
      />
      <Loaded query={snapshot} label="indexer checkpoint">
        {(data) => {
          const { checkpoint } = parseBlockchainRows(data.rows);
          const head = live.data?.blockNumber ?? null;
          const lag = blockLag(head, checkpoint?.block ?? null);
          const job = dashboard.data?.rows.find((r) => r.id === "last-job");
          return (
            <>
              <div className="adm-grid-tiles">
                <Tile
                  label="Indexed to block"
                  value={checkpoint?.block ?? "Unavailable"}
                  hint={
                    checkpoint?.updatedAt
                      ? `Updated ${formatTimestamp(checkpoint.updatedAt) ?? checkpoint.updatedAt}`
                      : "No checkpoint yet"
                  }
                />
                <Tile
                  label="Base head (live)"
                  value={head ?? (live.isPending ? "Reading…" : "Unavailable")}
                />
                <Tile
                  label="Blocks behind"
                  value={lag === null ? "Unavailable" : lag.toString()}
                  hint="A small lag is normal"
                />
                <Tile
                  label="Latest indexer job"
                  value={job ? job.detail : dashboard.isPending ? "Reading…" : "Unavailable"}
                  hint={job?.observedAt ? (formatTimestamp(job.observedAt) ?? undefined) : undefined}
                />
              </div>
              {checkpoint?.blockHash ? (
                <Card title="Canonical block hash">
                  <span className="adm-mono" title={checkpoint.blockHash}>
                    {shortHash(checkpoint.blockHash, 14, 10)}
                  </span>
                </Card>
              ) : null}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}
