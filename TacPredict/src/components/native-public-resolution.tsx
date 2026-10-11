import { useState } from "react";
import type { NativeMarket, ProtocolDeployment } from "@/lib/protocol/types";
import { resolverTransaction } from "@/lib/protocol/operator-actions";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
export function NativePublicResolution({
  market,
  deployment,
}: {
  market: NativeMarket;
  deployment: ProtocolDeployment | undefined;
}) {
  const wallet = useBaseWallet(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [outcome, setOutcome] = useState(0),
    [voided, setVoided] = useState(false),
    [evidence, setEvidence] = useState(""),
    [ack, setAck] = useState(false);
  const ready = Boolean(deployment && wallet.address && wallet.chainId === market.chainId && ack);
  async function run(action: "dispute" | "finalize" | "timeoutVoid") {
    setBusy(true);
    setNotice("");
    try {
      const hash = await resolverTransaction(wallet, deployment!, action, {
        marketId: market.onchainId,
        outcome,
        voided,
        evidenceHash: evidence,
        observedAt: "",
      });
      setNotice("Transaction confirmed: " + hash + ". Await finalized indexing.");
      await wallet.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Resolution action failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="finance-card mt-5 !p-4">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">
        Challenge &amp; permissionless resolution
      </summary>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        The contract's challenge deadline and market timeout are authoritative. A dispute requires a
        native USDC bond and reviewed evidence. Finalization and timeout-void actions never change
        the market's locked source or rules.
      </p>
      <label className="mt-3 flex gap-2 text-xs leading-6 text-muted-foreground">
        <input
          className="mt-1.5 size-4 shrink-0"
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        I have reviewed the resolution rules, selected Base network, gas fees and possible USDC
        bond.
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="finance-pill"
          disabled={busy || !ready || market.status !== "RESOLVING"}
          onClick={() => void run("finalize")}
        >
          Finalize unchallenged proposal
        </button>
        <button
          className="finance-pill"
          disabled={
            busy ||
            !ready ||
            Date.now() < Date.parse(market.resolutionDeadline) ||
            ["RESOLVED", "VOID", "SETTLED"].includes(market.status)
          }
          onClick={() => void run("timeoutVoid")}
        >
          Void after timeout
        </button>
      </div>
      <div className="mt-5 space-y-3 border-t border-border pt-4">
        <label className="block text-xs">
          Alternative outcome
          <select
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3"
            value={outcome}
            onChange={(e) => setOutcome(Number(e.target.value))}
          >
            {market.outcomes.map((o) => (
              <option value={o.index} key={o.index}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-xs">
          <input checked={voided} type="checkbox" onChange={(e) => setVoided(e.target.checked)} />
          Dispute with a void result
        </label>
        <label className="block text-xs">
          Published evidence hash
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="0x… (32-byte hash)"
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3"
          />
        </label>
        <button
          className="finance-pill"
          disabled={
            busy || !ready || market.status !== "RESOLVING" || !/^0x[0-9a-fA-F]{64}$/.test(evidence)
          }
          onClick={() => void run("dispute")}
        >
          Review bond &amp; sign dispute
        </button>
      </div>
      {notice && (
        <p role="status" className="mt-4 break-all text-xs leading-6 text-muted-foreground">
          {notice}
        </p>
      )}
    </details>
  );
}
