import { useQuery } from "@tanstack/react-query";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { nativeOrderbookOptions } from "@/lib/protocol/read.functions";
import { placeLimitBuy, fillOffer } from "@/lib/protocol/execution";
import { limitQuote } from "@/lib/protocol/orders";
import { atomicDecimal } from "@/lib/protocol/types";
import { useId, useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { BASE_NETWORK, formatUsdc } from "@/lib/onchain/base";
export function PredictionAmountCard({
  market,
  selected,
  onSelect,
}: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const wallet = useBaseWallet();
  const inputId = useId();
  const { user } = useProtocolUser();
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const deployment = feed.data?.deployments.find((d) => d.chainId === market.native?.chainId);
  const outcomeIndex = Number(selected ?? market.outcomes[0]?.id ?? 0);
  const book = useQuery({
    ...nativeOrderbookOptions(market.id, outcomeIndex),
    enabled: Boolean(market.native),
  });
  const [limitPrice, setLimitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState("10");
  let quote: ReturnType<typeof limitQuote> | null = null;
  try {
    quote = limitQuote(amount, limitPrice);
  } catch {
    /* No fabricated quote. */
  }
  const canTrade = Boolean(
    user && wallet.address && deployment?.tradingEnabled && market.native?.status === "OPEN",
  );
  async function submit() {
    if (!canTrade || !deployment || !market.native || busy) return;
    setBusy(true);
    try {
      const r = await placeLimitBuy(
        wallet,
        deployment,
        market.native,
        outcomeIndex,
        amount,
        limitPrice,
      );
      setNotice(
        `Signed limit order stored: ${r.orderId}. Not filled yet; no position is credited until on-chain settlement.`,
      );
      await book.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Order failed.");
    } finally {
      setBusy(false);
    }
  }
  const balance = !wallet.address
    ? "0"
    : wallet.chainId !== BASE_NETWORK.id
      ? "Switch network"
      : wallet.usdc === null
        ? wallet.error
          ? "Unavailable"
          : "Loading…"
        : formatUsdc(wallet.usdc);
  return (
    <aside
      className="min-w-0 h-fit rounded-[26px] border border-white/10 bg-card p-5 shadow-[0_18px_50px_-30px_rgba(0,0,0,.65)] lg:sticky lg:top-24"
      aria-label="USDC trade integration status"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Amount</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          USDC-only
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Amount outcome selection">
        {market.outcomes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            onClick={() => onSelect(item.id)}
            className={`ios-press min-h-9 min-w-0 flex-1 rounded-full border px-3 text-sm font-semibold ${selected === item.id ? "border-primary/35 bg-primary/15 text-primary" : "border-border bg-background/30 text-muted-foreground"}`}
          >
            {item.label}{" "}
            <span className="tabular-nums">
              {item.probabilityKnown === false ? "—" : `${item.probability}%`}
            </span>
          </button>
        ))}
      </div>
      <label htmlFor={inputId} className="sr-only">
        Amount preview
      </label>
      <div className="mt-3 flex min-h-16 items-center gap-3 rounded-[18px] border border-white/10 bg-background/60 px-4 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="h-14 min-w-0 flex-1 appearance-none bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ outline: "none" }}
        />
        <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold">
          USDC
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2" aria-label="Preset preview amounts">
        {[5, 10, 25, 50].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={Number(amount) === n}
            onClick={() => setAmount(String(n))}
            className={`ios-press min-h-8 rounded-xl text-xs font-semibold tabular-nums ${Number(amount) === n ? "bg-primary/15 text-primary" : "bg-secondary/60 text-muted-foreground"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Wallet balance</span>
        <span className="font-medium tabular-nums">
          {balance}
          {!wallet.address || wallet.chainId === BASE_NETWORK.id ? " USDC" : ""}
        </span>
      </div>
      <label className="mt-4 block text-xs text-muted-foreground">
        Limit price per share (USDC)
        <input
          type="text"
          inputMode="decimal"
          value={limitPrice}
          onChange={(e) => setLimitPrice(e.target.value)}
          placeholder="e.g. 0.62"
          className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-base text-foreground"
        />
      </label>
      {quote && (
        <p className="mt-3 text-xs text-muted-foreground">
          {atomicDecimal(quote.sharesAtomic.toString())} shares · Maximum winning payout{" "}
          {quote.potentialPayout} USDC. Payout is not guaranteed.
        </p>
      )}
      <button
        type="button"
        disabled={!canTrade || !quote || busy}
        onClick={() => void submit()}
        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed"
      >
        <LockKeyhole className="size-3.5" />
        {busy
          ? "Awaiting wallet…"
          : canTrade
            ? "Approve USDC & sign buy order"
            : "Trading not enabled"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {canTrade
          ? "Review exact allowance and signed terms in your wallet."
          : "Launch pending · No funds move."}
      </p>
      {notice && (
        <p role="status" className="mt-3 break-all text-xs text-muted-foreground">
          {notice}
        </p>
      )}
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Signed sell offers</h3>
        {book.isError ? (
          <p className="mt-2 text-xs text-muted-foreground">Order book unavailable.</p>
        ) : !book.data?.some((o) => !o.order.isBuy) ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No executable offers yet. Last-trade probability is not a guaranteed quote.
          </p>
        ) : (
          book.data
            .filter((o) => !o.order.isBuy)
            .map((o) => (
              <button
                key={o.orderId}
                disabled={!canTrade || busy}
                className="mt-2 min-h-11 w-full rounded-xl border border-border px-3 text-left text-xs disabled:opacity-50"
                onClick={() => {
                  if (!deployment || !canTrade) return;
                  setBusy(true);
                  void fillOffer(wallet, deployment, o)
                    .then((hash) =>
                      setNotice(`Trade confirmed: ${hash}. Waiting for finalized indexer.`),
                    )
                    .catch((e) => setNotice(e instanceof Error ? e.message : "Trade failed."))
                    .finally(() => setBusy(false));
                }}
              >
                Buy full remaining offer: {atomicDecimal(o.remainingAtomic)} shares @{" "}
                {atomicDecimal(o.order.price)} USDC/share
              </button>
            ))
        )}
      </div>
    </aside>
  );
}
