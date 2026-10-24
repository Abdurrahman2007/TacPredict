import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseUnits, type Address, type Hex } from "viem";
import type { Market } from "@/domain/markets/types";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useLoginDialog } from "@/components/login-dialog";
import { prepareVirtual, observeVirtual } from "@/lib/virtual/functions";
import { executeVirtualTrade, reconciledVirtualTransaction } from "@/lib/virtual/execution";
import { useVirtualAccount, virtualMoney } from "@/lib/virtual/hooks";
import { virtualQuoteKey, assertQuoteIntent } from "@/lib/virtual/guards";
import { browserPending, pendingChanged, writePending } from "@/lib/virtual/pending";
import type { TradeIntent } from "@/lib/virtual/types";
export function VirtualAmountCard({
  market,
  selected,
  onSelect,
}: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const ref = market.virtual!,
    w = useBaseWallet(),
    auth = useProtocolUser(),
    login = useLoginDialog(),
    id = useId(),
    client = useQueryClient();
  const account = useVirtualAccount(ref.deployment),
    lock = useRef(false);
  const [mode, setMode] = useState<"buy" | "sell">("buy"),
    [amount, setAmount] = useState(""),
    [price, setPrice] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [debounced, setDebounced] = useState("");
  const [submitted, setSubmitted] = useState<{ hash: Hex; intent: TradeIntent } | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState("");
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    function restore() {
      setRecoveryBlocked(false);
      if (!w.address) {
        setSubmitted(null);
        return;
      }
      try {
        const p = browserPending(ref.deployment, w.address);
        setSubmitted((old) =>
          p?.hash
            ? old?.hash === p.hash && JSON.stringify(old.intent) === JSON.stringify(p.intent)
              ? old
              : { hash: p.hash, intent: p.intent }
            : null,
        );
        if (p && !p.hash) {
          setRecoveryBlocked(true);
          setNotice(
            "Wallet submission unresolved. Check wallet activity before retrying; contact support for reconciliation.",
          );
        }
      } catch {
        setRecoveryBlocked(true);
        setNotice("Pending transaction recovery unavailable. Contact support before retrying.");
      }
    }
    restore();
    window.addEventListener("storage", restore);
    window.addEventListener(pendingChanged, restore);
    return () => {
      window.removeEventListener("storage", restore);
      window.removeEventListener(pendingChanged, restore);
    };
  }, [ref.deployment, w.address]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 350);
    return () => clearTimeout(t);
  }, [amount]);
  const outcome = Number(selected ?? market.outcomes[0]?.id ?? 0);
  let atomic = 0n;
  try {
    if (/^\d+(\.\d{0,6})?$/.test(debounced)) atomic = parseUnits(debounced, 6);
  } catch {
    /* invalid is not a quote */
  }
  const quote = useQuery({
    queryKey: virtualQuoteKey(
      ref.deployment.id,
      ref.onchainId,
      w.address ?? undefined,
      outcome,
      mode,
      atomic.toString(),
    ),
    enabled: Boolean(auth.user && w.address && ref.deployment.enabled && atomic > 0n),
    queryFn: () =>
      prepareVirtual({
        data: {
          wallet: w.address as Address,
          marketId: ref.onchainId,
          outcome,
          isBuy: mode === "buy",
          input: atomic.toString(),
        },
      }),
    staleTime: 0,
    refetchInterval: 10000,
    retry: 0,
  });
  const observation = useQuery({
    queryKey: ["virtual", ref.deployment.id, "receipt", submitted?.hash, submitted?.intent],
    enabled: Boolean(submitted),
    queryFn: () => observeVirtual({ data: submitted! }),
    refetchInterval: (q) =>
      ["pending", "reorged"].includes(q.state.data?.status ?? "pending") ? 4000 : false,
    retry: 1,
  });
  useEffect(() => {
    if (!submitted || !observation.data) return;
    const s = observation.data.status;
    if (s !== "pending") {
      try {
        reconciledVirtualTransaction(ref.deployment, submitted.intent.wallet, submitted.hash, s);
      } catch {
        setRecoveryBlocked(true);
      }
      setNotice(`${s}: ${submitted.hash}. Balances follow verified indexing.`);
      void client.invalidateQueries({ queryKey: ["virtual", ref.deployment.id, "account"] });
    }
  }, [observation.data, submitted, ref.deployment, client]);
  const minOut = quote.data ? BigInt(quote.data.output) : 0n;
  let priceError = "";
  if (price) {
    try {
      if (!/^\d+(\.\d{0,6})?$/.test(price)) throw Error();
      const bound = parseUnits(price, 6);
      if (bound <= 0n || bound > 1000000n) throw Error();
      const required =
        mode === "buy"
          ? (atomic * 1000000n + bound - 1n) / bound
          : (atomic * bound + 999999n) / 1000000n;
      if (required > minOut) priceError = "Current quote exceeds your average price limit.";
    } catch {
      priceError = "Enter an average price above 0 and at most 1.";
    }
  }
  const waiting = Boolean(
    recoveryBlocked ||
    (submitted &&
      !["confirmed", "finalized", "reverted"].includes(observation.data?.status ?? "pending")),
  );
  async function recover() {
    if (!w.address || recovering || busy) return;
    setRecovering(true);
    try {
      const p = browserPending(ref.deployment, w.address);
      if (!p || !/^0x[0-9a-fA-F]{64}$/.test(recoveryHash))
        throw Error("Enter the transaction hash from your wallet activity.");
      const hash = recoveryHash as Hex;
      const result = await observeVirtual({ data: { hash, intent: p.intent } });
      // A different/reverted/cancelled transaction cannot prove this intent executed.
      if (result.status !== "confirmed" && result.status !== "finalized")
        throw Error(
          "No canonical successful trade matching the saved intent. Recovery stays locked.",
        );
      writePending(window.localStorage, ref.deployment, { hash, intent: p.intent });
      reconciledVirtualTransaction(ref.deployment, w.address, hash, result.status);
      setRecoveryBlocked(false);
      setNotice(`Verified on-chain: ${hash}. Balances follow verified indexing.`);
      await client.invalidateQueries({ queryKey: ["virtual"] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Recovery unavailable; no trade credited.");
    } finally {
      setRecovering(false);
    }
  }
  async function submit() {
    const q = quote.data;
    if (lock.current || busy || waiting || !q || priceError || amount !== debounced) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      assertQuoteIntent(q.intent, {
        wallet: w.address as Address,
        marketId: ref.onchainId,
        outcome,
        isBuy: mode === "buy",
        input: atomic.toString(),
      });
      const result = await executeVirtualTrade(w, q, minOut, (hash) =>
        setSubmitted({ hash, intent: q.intent }),
      );
      setNotice(`Confirmed on-chain: ${result.hash}. Waiting for verified indexing.`);
      await client.invalidateQueries({ queryKey: ["virtual"] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Virtual transaction failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="pd-order" aria-label="Trade order">
      <div className="pd-order-controls">
        <div className="pd-mode" aria-label="Order direction">
          {(["buy", "sell"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy || waiting}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setAmount("");
                setNotice("");
              }}
            >
              {m === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="pd-order-outcomes">
          {market.outcomes.map((o) => (
            <button
              type="button"
              key={o.id}
              disabled={busy || waiting}
              data-tone={
                /^(yes|up)$/i.test(o.label)
                  ? "positive"
                  : /^(no|down)$/i.test(o.label)
                    ? "negative"
                    : "neutral"
              }
              aria-pressed={String(outcome) === o.id}
              onClick={() => onSelect(o.id)}
            >
              {o.label} <span>{o.probability.toFixed(1)}¢</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pd-amount-panel">
        <div className="pd-balance">
          <span>${virtualMoney(account.data?.balance)}</span>
          <small>Virtual USDC · {ref.deployment.chainId === 8453 ? "Base" : "Test network"}</small>
        </div>
        <label htmlFor={id} className="pd-amount-input">
          {mode === "buy" && <span>$</span>}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={mode === "buy" ? "Buy amount in Virtual USDC" : "Sell quantity in shares"}
            value={amount}
            placeholder="0"
            style={{ width: `${Math.max(1, Math.min(12, amount.length || 1))}ch` }}
            onChange={(e) => {
              if (/^\d{0,10}(\.\d{0,6})?$/.test(e.target.value)) setAmount(e.target.value);
            }}
          />
        </label>
        {mode === "sell" ? (
          <p className="pd-contracts">Shares</p>
        ) : (
          <div className="pd-presets">
            {[5, 50, 100].map((n) => (
              <button type="button" key={n} onClick={() => setAmount(String(n))}>
                ${n}
              </button>
            ))}
          </div>
        )}
      </div>
      <details className="pd-order-details">
        <summary>Price &amp; trade details</summary>
        <label>
          Average price limit · Virtual USDC
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Optional · exact quote is protected"
          />
        </label>
        {quote.data && (
          <p>
            {mode === "buy"
              ? `${virtualMoney(quote.data.output)} shares`
              : `${virtualMoney(quote.data.output)} Virtual USDC`}{" "}
            · Fee {virtualMoney(quote.data.fee)} · Minimum received{" "}
            {virtualMoney(minOut.toString())}. No automatic partial fills.
          </p>
        )}
        {quote.data && (
          <p>
            Estimated execution gas: {quote.data.gasUnits} units · {quote.data.executionGasEth} ETH
            at the observed gas price. Base L1 data fees are additional; confirm the full fee in
            your wallet. Estimates change.
          </p>
        )}
        {waiting && (
          <div>
            <label>
              Recover submitted trade
              <input
                value={recoveryHash}
                onChange={(e) => setRecoveryHash(e.target.value.trim())}
                placeholder="Transaction hash from wallet activity"
                maxLength={66}
              />
            </label>
            <button
              type="button"
              disabled={busy || recovering || !auth.user}
              onClick={() => void recover()}
            >
              {recovering ? "Verifying receipt…" : "Verify transaction"}
            </button>
            <p>
              A hash alone never confirms a trade. Cancelled or unknown submissions require support
              review.
            </p>
          </div>
        )}
        <p>Nontransferable virtual credits. No real-money value, withdrawals or token approvals.</p>
      </details>
      {!w.address || !auth.user ? (
        <button type="button" className="pd-submit" onClick={() => login()}>
          Connect wallet
        </button>
      ) : (
        <button
          type="button"
          className="pd-submit"
          disabled={
            busy ||
            waiting ||
            !quote.data ||
            quote.isFetching ||
            Boolean(priceError) ||
            w.chainId !== ref.deployment.chainId ||
            amount !== debounced
          }
          onClick={() => void submit()}
        >
          {busy
            ? "Review in wallet…"
            : waiting
              ? "Transaction pending…"
              : !ref.deployment.enabled
                ? "Trading unavailable"
                : mode === "buy"
                  ? "Buy shares"
                  : "Sell shares"}
        </button>
      )}
      <p className="pd-order-note">
        {w.chainId !== ref.deployment.chainId
          ? "Switch to the market network before trading."
          : "Each Buy/Sell requires its own transaction and native ETH gas."}
      </p>
      {(priceError || quote.isError || account.isError) && (
        <p role="alert" className="pd-order-notice">
          {priceError ||
            (quote.error instanceof Error
              ? quote.error.message
              : account.error instanceof Error
                ? account.error.message
                : "Data unavailable")}
        </p>
      )}
      {notice && (
        <p role="status" className="pd-order-notice">
          {notice}
        </p>
      )}
      {waiting && observation.isError && (
        <button type="button" className="pd-submit" onClick={() => void observation.refetch()}>
          Reconcile pending transaction
        </button>
      )}
    </section>
  );
}
