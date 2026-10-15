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
  Unavailable,
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
    case "transactions":
      return (
        <div className="adm-stack">
          <PageHeader title="Transactions" subtitle="Protocol transaction history." />
          <Unavailable
            title="Transaction history is not enabled"
            needs="An admin read function over protocol_transactions and protocol_chain_events."
          >
            Individual finalized trades are listed under Trading. A complete transaction feed is not
            shown because no admin read exists for it yet.
          </Unavailable>
        </div>
      );
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
        subtitle="Verified TacPredict deployment on Base Mainnet."
        actions={<RefreshButton onClick={() => void live.refetch()} busy={live.isFetching} />}
      />
      <Loaded query={snapshot} label="deployment">
        {(data) => {
          const { deployment } = parseBlockchainRows(data.rows);
          if (!deployment)
            return (
              <Notice tone="warn">
                No verified Base deployment is recorded in the database, so no contract addresses
                are shown.
              </Notice>
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
                  hint="Read from the Registry contract"
                />
                <Tile
                  label="Database trading flag"
                  value={
                    deployment.databaseTradingEnabled === null
                      ? "Unavailable"
                      : deployment.databaseTradingEnabled
                        ? "Enabled"
                        : "Disabled"
                  }
                  hint="Config record, not a chain read"
                />
                <Tile
                  label="Markets created (live)"
                  value={live.data?.nextMarketId ?? (live.isPending ? "Reading…" : "Unavailable")}
                  hint="Registry next market ID"
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
              <Notice>
                Addresses come from the verified deployment record. Pause state and market count are
                read live from Base when this page loads or you press Refresh.
                {deployment.recordedAt
                  ? ` Deployment recorded ${formatTimestamp(deployment.recordedAt) ?? deployment.recordedAt}.`
                  : ""}
              </Notice>
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
        subtitle="Resolution settings read directly from the Oracle contract."
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
                hint="Oracle bond()"
              />
              <Tile
                label="Challenge period"
                value={challenge ?? "Unavailable"}
                hint="Oracle challengePeriod()"
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
      <Notice>
        Bond and challenge period are protocol settings. This panel can only read them; changing
        them requires an authorized on-chain transaction.
      </Notice>
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
        subtitle="How far the finalized-event indexer has read compared with the Base chain head."
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
                      : "No checkpoint recorded"
                  }
                />
                <Tile
                  label="Base head (live)"
                  value={head ?? (live.isPending ? "Reading…" : "Unavailable")}
                />
                <Tile
                  label="Blocks behind"
                  value={lag === null ? "Unavailable" : lag.toString()}
                  hint="Finalized indexing intentionally trails the head"
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
