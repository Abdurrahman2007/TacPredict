import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { Market } from "@/domain/markets/types";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useLoginDialog } from "./login-dialog";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { nativeOrderbookOptions } from "@/lib/protocol/read.functions";
import { placeLimitBuy, placeLimitSell, fillOffer } from "@/lib/protocol/execution";
import { limitQuote, usdcAtomic } from "@/lib/protocol/orders";
import { BASE_NETWORK, formatUsdc } from "@/lib/onchain/base";
import { cents, sharesShort, usdcShort } from "@/lib/protocol/display.mjs";
import { VirtualAmountCard } from "./virtual/virtual-amount-card";
export function PredictionAmountCard(props: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  return props.market.virtual ? (
    <VirtualAmountCard {...props} />
  ) : (
    <NativePredictionAmountCard {...props} />
  );
}
function NativePredictionAmountCard({
  market,
  selected,
  onSelect,
}: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const wallet = useBaseWallet(),
    { user } = useProtocolUser(),
    login = useLoginDialog(),
    inputId = useId();
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const deployment = feed.data?.deployments.find((d) => d.chainId === market.native?.chainId);
  const chosen = market.outcomes.find((o) => o.id === selected) ?? market.outcomes[0];
  const outcomeIndex = Number(chosen?.id ?? 0);
  const book = useQuery({
    ...nativeOrderbookOptions(market.id, outcomeIndex),
    enabled: Boolean(market.native),
  });
  const [mode, setMode] = useState<"buy" | "sell">("buy"),
    [amount, setAmount] = useState(""),
    [limitPrice, setLimitPrice] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [ack, setAck] = useState(false);
  let quote: ReturnType<typeof limitQuote> | null = null,
    validSell = false;
  try {
    if (mode === "buy") quote = limitQuote(amount, limitPrice);
    else
      validSell =
        usdcAtomic(amount) > 0n && usdcAtomic(limitPrice) > 0n && usdcAtomic(limitPrice) < 1000000n;
  } catch {
    /* Unknown price never becomes a quote. */
  }
  const canTrade = Boolean(
    user &&
    wallet.address &&
    wallet.chainId === market.native?.chainId &&
    deployment?.tradingEnabled &&
    market.native?.status === "OPEN" &&
    Date.parse(market.native.closeAt) > Date.now(),
  );
  async function submit() {
    if (
      busy ||
      !canTrade ||
      !deployment ||
      !market.native ||
      (mode === "buy" ? !quote : !validSell || !ack)
    )
      return;
    setBusy(true);
    setNotice("");
    try {
      const result =
        mode === "buy"
          ? await placeLimitBuy(wallet, deployment, market.native, outcomeIndex, amount, limitPrice)
          : await placeLimitSell(
              wallet,
              deployment,
              market.native,
              outcomeIndex,
              amount,
              limitPrice,
            );
      setNotice(
        `Signed ${mode} order saved: ${result.orderId}. Not filled yet. Positions update only after finalized on-chain execution.`,
      );
      await book.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Order failed.");
    } finally {
      setBusy(false);
    }
  }
  const balance = wallet.usdc === null ? "Unavailable" : formatUsdc(wallet.usdc);
  return (
    <section className="pd-order" aria-label="Trade order">
      <div className="pd-order-controls">
        <div className="pd-mode" aria-label="Order direction">
          {(["buy", "sell"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setAmount("");
                setNotice("");
                setAck(false);
              }}
            >
              {m === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="pd-order-outcomes">
          {market.outcomes.map((o, i) => (
            <button
              key={o.id}
              type="button"
              data-tone={
                /^(yes|up)$/i.test(o.label)
                  ? "positive"
                  : /^(no|down)$/i.test(o.label)
                    ? "negative"
                    : "neutral"
              }
              aria-pressed={chosen?.id === o.id}
              onClick={() => {
                onSelect(o.id);
                setAck(false);
              }}
            >
              {o.label} <span>{cents(o)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pd-amount-panel">
        <div className="pd-balance">
          <span>${balance}</span>
          <small>
            {wallet.address && wallet.usdc === null
              ? wallet.error
                ? "Balance connection unavailable"
                : "Updating wallet balance…"
              : "Wallet USDC · Base"}
          </small>
        </div>
        <label htmlFor={inputId} className="pd-amount-input">
          {mode === "buy" && <span>$</span>}
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={mode === "buy" ? "Buy amount in USDC" : "Sell quantity in contracts"}
            value={amount}
            placeholder="0"
            style={{ width: `${Math.max(1, Math.min(12, amount.length || 1))}ch` }}
            onChange={(e) => {
              if (/^\d{0,10}(\.\d{0,6})?$/.test(e.target.value)) setAmount(e.target.value);
            }}
          />
        </label>
        {mode === "sell" ? (
          <p className="pd-contracts">Contracts</p>
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
        <summary>Limit price &amp; order details</summary>
        <label>
          Limit price per share (USDC)
          <input
            type="text"
            inputMode="decimal"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder="Enter a price between 0 and 1"
          />
        </label>
        {mode === "sell" && (
          <label className="pd-share-consent">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I
            understand this may request approval for the exchange to transfer my owned outcome
            shares. No short selling.
          </label>
        )}
        {quote && (
          <p>
            {sharesShort(quote.sharesAtomic.toString())} shares · Maximum winning payout{" "}
            {quote.potentialPayout} USDC. Not guaranteed.
          </p>
        )}
        <p>
          Displayed 0¢ is a no-data fallback, never a free executable quote. No market price is
          fabricated.
        </p>
      </details>
      {!wallet.address || !user ? (
        <button type="button" className="pd-submit" onClick={() => login()}>
          Connect wallet
        </button>
      ) : (
        <button
          type="button"
          className="pd-submit"
          onClick={() => void submit()}
          disabled={busy || !canTrade || (mode === "buy" ? !quote : !validSell || !ack)}
        >
          {busy
            ? "Review in wallet…"
            : !market.native
              ? "Listing pending"
              : !canTrade
                ? "Trading unavailable"
                : mode === "buy"
                  ? "Review buy order"
                  : "Review sell order"}
        </button>
      )}
      <p className="pd-order-note">
        {!market.native
          ? "Preview only. No on-chain market or executable price yet."
          : wallet.chainId !== BASE_NETWORK.id
            ? "Switch to Base before trading."
            : "USDC stays in your wallet until an on-chain trade. Review every approval."}
      </p>
      {notice && (
        <p role="status" className="pd-order-notice">
          {notice}
        </p>
      )}
      {market.native && (
        <details className="pd-order-details">
          <summary>Executable sell offers</summary>
          {book.isError ? (
            <p>Order book unavailable.</p>
          ) : !book.data?.some((o) => !o.order.isBuy) ? (
            <p>No executable offers yet.</p>
          ) : (
            book.data
              .filter((o) => !o.order.isBuy)
              .map((o) => (
                <button
                  type="button"
                  key={o.orderId}
                  disabled={!canTrade || busy}
                  onClick={() => {
                    if (!canTrade || !deployment) return;
                    setBusy(true);
                    void fillOffer(wallet, deployment, o)
                      .then((hash) =>
                        setNotice(`Trade confirmed: ${hash}. Waiting for finalized indexing.`),
                      )
                      .catch((e) => setNotice(e instanceof Error ? e.message : "Trade failed."))
                      .finally(() => setBusy(false));
                  }}
                >
                  Buy {sharesShort(o.remainingAtomic)} shares @ {usdcShort(o.order.price)}/share
                </button>
              ))
          )}
        </details>
      )}
    </section>
  );
}
