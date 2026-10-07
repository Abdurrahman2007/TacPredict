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
  const [amount, setAmount] = useState("10");
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
          Preview
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
            {item.label} <span className="tabular-nums">{item.probability}%</span>
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
      <button
        type="button"
        disabled
        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed"
      >
        <LockKeyhole className="size-3.5" />
        Trading not enabled
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Preview only · No funds move.
      </p>
    </aside>
  );
}
