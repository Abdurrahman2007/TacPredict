import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, LockKeyhole } from "lucide-react";
import type { NativeMarket, ProtocolDeployment } from "@/lib/protocol/types";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { nativeOrderbookOptions } from "@/lib/protocol/read.functions";
import {
  fundCompleteSet,
  placeLimitSell,
  cancelSignedOrder,
  revokeShareApproval,
} from "@/lib/protocol/execution";
export function NativeMakerTools({
  market,
  deployment,
}: {
  market: NativeMarket;
  deployment: ProtocolDeployment | undefined;
}) {
  const wallet = useBaseWallet(),
    cache = useQueryClient();
  const [amount, setAmount] = useState("5"),
    [price, setPrice] = useState("0.50"),
    [outcome, setOutcome] = useState(0),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const book = useQuery(nativeOrderbookOptions(market.marketId, outcome));
  const own =
    book.data?.filter((o) => o.order.maker.toLowerCase() === wallet.address?.toLowerCase()) ?? [];
  const canSign = Boolean(
      deployment && wallet.address && wallet.provider && wallet.chainId === market.chainId,
    ),
    canRisk = canSign && deployment!.tradingEnabled;
  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await work();
      setNotice(
        `Submitted successfully: ${typeof result === "string" ? result : JSON.stringify(result)}. Balances and reward progress update only after finalized indexing.`,
      );
      await wallet.refresh();
      await cache.invalidateQueries({ queryKey: ["native-book"] });
      await cache.invalidateQueries({ queryKey: ["native-portfolio"] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 finance-card !p-4">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
        <Layers size={16} />
        USDC funding &amp; share management
      </summary>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        Funding mints a complete set: one share of every outcome per USDC. It is not a directional
        prediction. Merge an owned complete set to recover USDC before resolution; winning or void
        shares use Claim afterward.
      </p>
      {!deployment && (
        <p className="finance-inline-alert mt-3">
          <LockKeyhole className="mr-1 inline" size={12} />
          Verified Base deployment required. No signing or funding is available yet.
        </p>
      )}
      <div className="mt-4 space-y-3">
        <label className="block text-xs text-muted-foreground">
          USDC / share quantity
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="finance-pill"
            disabled={busy || !canRisk}
            onClick={() => void run(() => fundCompleteSet(wallet, deployment!, market, amount))}
          >
            Fund complete set
          </button>
          <button
            className="finance-pill"
            disabled={busy || !canSign || ["RESOLVED", "VOID"].includes(market.status)}
            onClick={() =>
              void run(() => fundCompleteSet(wallet, deployment!, market, amount, true))
            }
          >
            Merge &amp; recover
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted-foreground">
            Outcome
            <select
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
              value={outcome}
              onChange={(e) => setOutcome(Number(e.target.value))}
            >
              {market.outcomes.map((o) => (
                <option key={o.index} value={o.index}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Sell price per share (USDC)
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground"
            />
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-1.5 size-4 shrink-0"
          />
          I understand that selling may require approval for the verified Exchange to transfer all
          my outcome-share tokens. Only a filled order sells shares.
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="finance-pill finance-pill-primary"
            disabled={busy || !canRisk || !ack}
            onClick={() =>
              void run(() => placeLimitSell(wallet, deployment!, market, outcome, amount, price))
            }
          >
            Sign limit sell
          </button>
          <button
            className="finance-pill"
            disabled={busy || !canSign}
            onClick={() => void run(() => revokeShareApproval(wallet, deployment!))}
          >
            Revoke share approval
          </button>
        </div>
        {own.length > 0 && (
          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold">Your open orders for this outcome</h3>
            {own.map((o) => (
              <div
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs"
                key={o.orderId}
              >
                <span className="break-all font-mono">
                  {o.order.isBuy ? "Buy" : "Sell"} · {o.orderId.slice(0, 10)}…
                </span>
                <button
                  disabled={busy || !canSign}
                  className="finance-pill"
                  onClick={() => void run(() => cancelSignedOrder(wallet, deployment!, o))}
                >
                  Cancel onchain
                </button>
              </div>
            ))}
          </div>
        )}
        {notice && (
          <p role="status" className="mt-4 break-all text-xs leading-6 text-muted-foreground">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
