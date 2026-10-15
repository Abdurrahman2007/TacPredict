import { NativeOperatorConsole } from "@/components/native-operator-console";
import {
  atomicToDecimal,
  formatDuration,
  formatTimestamp,
  parseResolutionRow,
  shortHash,
  type ParsedResolution,
} from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot, useLiveChain } from "../admin-data";
import { Badge, Card, Loaded, Notice, PageHeader, Tile, Unavailable, statusTone } from "../admin-ui";

const DISPUTE_PATTERN = /DISPUT|CHALLENG/i;

function isDisputed(r: ParsedResolution) {
  return Boolean(r.status && DISPUTE_PATTERN.test(r.status));
}

export function ResolutionView({ view }: { view: string }) {
  switch (view) {
    case "resolve":
      return <ResolveView />;
    case "disputes":
      return <ResolutionTable mode="disputes" />;
    case "evidence":
      return <ResolutionTable mode="evidence" />;
    default:
      return <ResolutionTable mode="pending" />;
  }
}

const COPY = {
  pending: {
    title: "Pending resolutions",
    subtitle: "Outcome proposals recorded by the finalized indexer, newest first.",
  },
  disputes: {
    title: "Disputes",
    subtitle: "Proposals whose indexed status shows a dispute or challenge.",
  },
  evidence: {
    title: "Evidence",
    subtitle: "Evidence and source hashes committed with each proposal.",
  },
} as const;

function ResolutionTable({ mode }: { mode: keyof typeof COPY }) {
  const query = useAdminSnapshot("Resolution");
  const copy = COPY[mode];
  return (
    <div className="adm-stack">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <Loaded query={query} label="resolutions">
        {(snapshot) => {
          const all = snapshot.rows.map(parseResolutionRow);
          const rows = mode === "disputes" ? all.filter(isDisputed) : all;
          return (
            <Card flush>
              {rows.length === 0 ? (
                <div className="adm-card-body">
                  <p className="adm-muted" style={{ margin: 0 }}>
                    {mode === "disputes"
                      ? "No disputed proposals are indexed."
                      : "No resolution proposals have been indexed yet."}
                  </p>
                </div>
              ) : (
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Status</th>
                        {mode === "evidence" ? (
                          <>
                            <th>Evidence hash</th>
                            <th>Source hash</th>
                          </>
                        ) : (
                          <>
                            <th>Proposed outcome</th>
                            <th>Challenge deadline</th>
                          </>
                        )}
                        <th>Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td className="adm-mono">{r.market}</td>
                          <td>
                            <Badge tone={statusTone(r.status)}>{r.status ?? "Unknown"}</Badge>
                          </td>
                          {mode === "evidence" ? (
                            <>
                              <td className="adm-mono" title={r.evidenceHash ?? undefined}>
                                {shortHash(r.evidenceHash, 10, 8) ?? "Unavailable"}
                              </td>
                              <td className="adm-mono" title={r.sourceHash ?? undefined}>
                                {shortHash(r.sourceHash, 10, 8) ?? "Unavailable"}
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{r.proposedOutcome ?? "Unavailable"}</td>
                              <td>{formatTimestamp(r.challengeDeadline) ?? "Unavailable"}</td>
                            </>
                          )}
                          <td>{formatTimestamp(r.proposedAt) ?? "Unavailable"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        }}
      </Loaded>
      {mode === "evidence" ? (
        <Notice>
          Only hashes are stored. The evidence document itself is held by the resolver; this panel
          does not display or host evidence files.
        </Notice>
      ) : null}
    </div>
  );
}

function ResolveView() {
  const chain = useLiveChain();
  return (
    <div className="adm-stack">
      <PageHeader
        title="Resolve"
        subtitle="Propose, dispute, finalize and void through the Oracle contract with an authorized wallet."
      />
      <Notice tone="warn">
        Every action here is a real Base transaction signed by your wallet and permitted only to
        on-chain role holders. Signing in as an administrator does not grant contract authority.
      </Notice>
      <div className="adm-grid-tiles">
        <Loaded query={chain} label="oracle settings">
          {(live) => (
            <>
              <Tile
                label="Oracle bond"
                value={live.oracleBondAtomic ? `${atomicToDecimal(live.oracleBondAtomic) ?? "Unavailable"} USDC` : "Unavailable"}
                hint="Read live from the Oracle contract"
              />
              <Tile
                label="Challenge period"
                value={
                  live.challengePeriodSeconds
                    ? (formatDuration(live.challengePeriodSeconds) ?? "Unavailable")
                    : "Unavailable"
                }
                hint="Read live from the Oracle contract"
              />
            </>
          )}
        </Loaded>
      </div>
      <Card title="Operator console">
        <NativeOperatorConsole prepared={null} outcomeCount={2} />
      </Card>
      <Unavailable
        title="Guided multi-step resolution is not enabled"
        needs="A reviewed workflow that checks evidence and challenge state before enabling each action."
      >
        The console above exposes the contract actions directly. Review the Pending, Disputes and
        Evidence pages first.
      </Unavailable>
    </div>
  );
}
