import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  advanceVirtualIndexer,
  getVirtualOperations,
  previewVirtualCampaign,
} from "@/lib/virtual/functions";
import { virtualMoney } from "@/lib/virtual/hooks";
import { PageHeader, Card, Tile, Notice } from "../admin-ui";
export function VirtualView() {
  const q = useQuery({
    queryKey: ["virtual", "admin"],
    queryFn: () => getVirtualOperations(),
    retry: 0,
  });
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function advance() {
    setBusy(true);
    try {
      const r = await advanceVirtualIndexer();
      setNotice(`Indexed through ${r.checkpoint}`);
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Indexer unavailable");
    } finally {
      setBusy(false);
    }
  }
  const [campaignJson, setCampaignJson] = useState("");
  const [campaignResult, setCampaignResult] = useState("");
  async function preview() {
    try {
      const result = await previewVirtualCampaign({
        data: { draft: JSON.parse(campaignJson), version: 1, saveDraft: false },
      });
      setCampaignResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setCampaignResult(e instanceof Error ? e.message : "Preview unavailable");
    }
  }
  const data = q.data;
  return (
    <div className="adm-stack">
      <PageHeader
        title="Virtual trading"
        actions={
          <button className="adm-btn" onClick={() => void q.refetch()}>
            Refresh
          </button>
        }
      />
      {q.isError ? (
        <Notice tone="bad">
          {q.error instanceof Error ? q.error.message : "Virtual services unavailable"}
        </Notice>
      ) : !data ? (
        <Notice>Loading…</Notice>
      ) : !data.configured ? (
        <Notice tone="warn">Not configured. No deployment, grants or trading activated.</Notice>
      ) : (
        <>
          <div className="adm-grid-tiles">
            {[
              ["Granted", data.values["granted"]],
              ["Cash", data.values["totalCash"]],
              ["Locked liquidity", data.values["lockedCollateral"]],
              ["Seed used", data.values["seeded"]],
            ].map(([label, value]) => (
              <Tile key={label} label={label!} value={`${virtualMoney(value)} Virtual USDC`} />
            ))}
          </div>
          <Notice tone={data.health.healthy ? "info" : "warn"}>
            {data.health.healthy
              ? "Accounting reconciled · indexer current"
              : data.health.alerts.join(" · ")}
            {" · "}
            {data.health.lagBlocks} blocks behind · {data.health.ageSeconds}s age
          </Notice>
          <Card title="Indexer">
            <p>
              Checkpoint {data.checkpoint} · Finalized {data.finalized} · Chain observed{" "}
              {data.observedBlock}
            </p>
            <button className="adm-btn" disabled={busy} onClick={() => void advance()}>
              {busy ? "Indexing…" : "Index next 16 blocks"}
            </button>
          </Card>
          <Notice>
            Grant campaigns require an explicit onchain allowlist and budget. No balance editing,
            automatic grants or real-token controls.
          </Notice>
        </>
      )}
      <Card title="Monthly campaigns · Draft only">
        <p>Virtual USDC only · No grants or public claims enabled</p>
        <label>
          Campaign JSON
          <textarea
            className="adm-input"
            rows={5}
            value={campaignJson}
            onChange={(e) => setCampaignJson(e.target.value)}
            aria-label="Campaign draft JSON"
          />
        </label>
        <button className="adm-btn" onClick={() => void preview()}>
          Preview allocations
        </button>
        {campaignResult && (
          <pre className="overflow-auto text-xs" role="status">
            {campaignResult}
          </pre>
        )}
      </Card>
      {notice && <Notice>{notice}</Notice>}
    </div>
  );
}
