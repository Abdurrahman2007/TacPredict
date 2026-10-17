import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProtocolAdminDeployments } from "@/lib/protocol/admin.functions";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import {
  createOnchainMarket,
  resolverTransaction,
  type PreparedTerms,
  type ResolverAction,
} from "@/lib/protocol/operator-actions";
export function NativeOperatorConsole({
  prepared,
  outcomeCount,
  initialTimes,
}: {
  prepared: PreparedTerms | null;
  outcomeCount: number;
  initialTimes?:
    | { openAt: string; closeAt: string; resolveAfter: string; resolutionDeadline: string }
    | undefined;
}) {
  const wallet = useBaseWallet(),
    q = useQuery({
      queryKey: ["admin-verified-base-deployments"],
      queryFn: () => getProtocolAdminDeployments(),
      retry: 0,
    });
  const [chain, setChain] = useState(8453),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [ack, setAck] = useState(false);
  const [times, setTimes] = useState(
      initialTimes ?? {
        openAt: "",
        closeAt: "",
        resolveAfter: "",
        resolutionDeadline: "",
      },
    ),
    [action, setAction] = useState<ResolverAction>("checkpointClose"),
    [input, setInput] = useState({
      marketId: "",
      outcome: 0,
      voided: false,
      evidenceHash: "",
      observedAt: "",
    });
  const deployment = q.data?.find((d) => d.chainId === chain);
  const ready = Boolean(
    deployment && wallet.provider && wallet.address && wallet.chainId === chain && ack,
  );
  async function run(work: () => Promise<string>) {
    setBusy(true);
    setNotice("");
    try {
      setNotice(
        "Confirmed: " + (await work()) + ". Public state updates only after finalized indexing.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="finance-card mt-5 space-y-4">
      <h2 className="text-lg font-semibold">Base operator transactions</h2>
      <p className="text-xs leading-6 text-muted-foreground">
        Database admin access does not grant onchain roles. Transactions are simulated and signed by
        your connected operator wallet. Native USDC bonds and ETH gas may be required. Source
        verification is not a security audit.
      </p>
      <label className="block text-xs">
        Base network
        <select
          value={chain}
          onChange={(e) => {
            setChain(Number(e.target.value));
            setAck(false);
          }}
          className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3"
        >
          <option value={8453}>Base Mainnet · real USDC and gas</option>
        </select>
      </label>
      {!deployment && (
        <p role="status" className="finance-inline-alert">
          {q.isError
            ? "Verified deployment status unavailable."
            : q.isPending
              ? "Checking verified deployments…"
              : "No verified deployment for this Base network. Transactions are disabled."}
        </p>
      )}
      <label className="flex gap-2 text-xs leading-6 text-muted-foreground">
        <input
          type="checkbox"
          className="mt-1.5 size-4 shrink-0"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        I have reviewed the selected network, immutable terms and transaction costs.{" "}
        {chain === 8453
          ? "I approve signing a real-money Base Mainnet transaction."
          : "This is testnet only, not real USDC."}
      </label>
      <details className="border-t border-border pt-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Create market from prepared terms
        </summary>
        <p className="mb-3 text-xs leading-6 text-muted-foreground">
          All times are UTC. Terms cannot be changed after creation. Prepare metadata above before
          signing.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(times).map((k) => (
            <label className="block text-xs" key={k}>
              {k} (UTC)
              <input
                type="datetime-local"
                readOnly={Boolean(initialTimes)}
                value={times[k as keyof typeof times]}
                onChange={(e) => setTimes({ ...times, [k]: e.target.value })}
                className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-border bg-background p-3"
              />
            </label>
          ))}
        </div>
        <button
          className="finance-pill finance-pill-primary mt-4"
          disabled={busy || !ready || !prepared}
          onClick={() =>
            void run(() => createOnchainMarket(wallet, deployment!, prepared!, outcomeCount, times))
          }
        >
          Simulate &amp; sign Factory transaction
        </button>
      </details>
      <details className="border-t border-border pt-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Resolution, dispute and guardian actions
        </summary>
        <div className="space-y-3">
          <label className="block text-xs">
            Action
            <select
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3"
              value={action}
              onChange={(e) => setAction(e.target.value as ResolverAction)}
            >
              {[
                "checkpointClose",
                "propose",
                "dispute",
                "finalize",
                "resolveDispute",
                "timeoutVoid",
                "releaseTimeoutBonds",
                "withdrawBondCredit",
                "pause",
                "unpause",
              ].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          {["marketId", "evidenceHash", "observedAt"].map((k) => (
            <label className="block text-xs" key={k}>
              {k}
              {k === "observedAt" ? " (UTC)" : ""}
              <input
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3"
                type={k === "observedAt" ? "datetime-local" : "text"}
                value={input[k as "marketId" | "evidenceHash" | "observedAt"]}
                onChange={(e) => setInput({ ...input, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="block text-xs">
            Outcome index
            <input
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3"
              type="number"
              min={0}
              max={7}
              value={input.outcome}
              onChange={(e) => setInput({ ...input, outcome: Number(e.target.value) })}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={input.voided}
              onChange={(e) => setInput({ ...input, voided: e.target.checked })}
            />
            Void outcome
          </label>
          <p className="text-xs leading-6 text-muted-foreground">
            Evidence must use the market's predetermined source and be independently reviewable.
            Propose/dispute request native USDC bond approval. Pause affects new risk, not
            legitimate redemption.
          </p>
          <button
            className="finance-pill"
            disabled={busy || !ready}
            onClick={() => void run(() => resolverTransaction(wallet, deployment!, action, input))}
          >
            Simulate &amp; sign {action}
          </button>
        </div>
      </details>
      {notice && (
        <p role="status" className="break-all text-xs leading-6 text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}
