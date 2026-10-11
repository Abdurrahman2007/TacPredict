import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import type { MarketPreview } from "@/lib/agent/discovery.functions";
import { previewMarket } from "./prelaunch-markets";
import { CryptoDetailChart } from "./crypto-detail-chart";
import { MobileOutcomeDock } from "./mobile-outcome-dock";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

export function PreviewMarketDetail({
  preview,
  initial,
}: {
  preview: MarketPreview;
  initial?: string | undefined;
}) {
  const market = previewMarket(preview);
  const [selected, setSelected] = useState(initial === "1" ? "1" : "0");
  const [amountOpen, setAmountOpen] = useState(false);
  useEffect(() => {
    setSelected(initial === "1" ? "1" : "0");
    setAmountOpen(
      (initial === "0" || initial === "1") && window.matchMedia("(max-width: 1023px)").matches,
    );
  }, [initial]);
  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) setAmountOpen(true);
  };
  return (
    <div className="animate-enter pb-28 lg:pb-0">
      <Link
        to="/markets"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} />
        Markets
      </Link>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <article className="min-w-0">
          <div className="mb-4 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>Crypto · Pre-launch</span>
            <span>{market.closesAt}</span>
          </div>
          <div className="flex items-start gap-3">
            <img src={market.image} alt="" className="size-11 shrink-0" />
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {market.title}
            </h1>
          </div>
          <div
            className="mt-7 grid grid-cols-2 gap-4"
            aria-label="Outcome probabilities unavailable"
          >
            {market.outcomes.map((o, i) => (
              <button
                key={o.id}
                onClick={() => select(o.id)}
                type="button"
                className={`ios-press min-h-24 rounded-2xl bg-card p-4 ${i ? "text-right" : "text-left"}`}
              >
                <span className="block text-3xl font-semibold">—</span>
                <span className="mt-1 block text-sm text-muted-foreground">{o.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-between text-xs text-muted-foreground">
            <span>Asset price · USD</span>
            <span>Not prediction odds</span>
          </div>
          <CryptoDetailChart asset={preview.asset} />
          <details className="mt-6 rounded-2xl border border-border bg-card/50 p-4">
            <summary className="cursor-pointer font-semibold">
              Description &amp; proposed rules
            </summary>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{preview.rules}</p>
            <a
              href={preview.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block py-2 text-sm text-primary"
            >
              Resolution source ↗
            </a>
          </details>
          <section className="mt-7" aria-label="Prediction statistics">
            <h2 className="text-xl font-semibold">Statistics</h2>
            {["Open interest", "Traded volume", "Liquidity", "Traders"].map((label) => (
              <div key={label} className="flex items-baseline gap-3 py-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="flex-1 border-b border-dashed border-border" />
                <span>—</span>
              </div>
            ))}
          </section>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Preview only · No on-chain market ID yet. Trading is paused.
          </p>
        </article>
        <div className="hidden min-w-0 lg:block">
          <PreviewAmount selected={selected} onSelect={setSelected} />
        </div>
      </div>
      <MobileOutcomeDock market={market} selected={selected} onSelect={select} />
      <Dialog open={amountOpen} onOpenChange={setAmountOpen}>
        <DialogContent className="login-popup grid-cols-1 w-[calc(100%_-_2rem)] max-w-sm max-h-[85dvh] overflow-y-auto overflow-x-hidden rounded-[28px] bg-card p-5">
          <DialogTitle className="sr-only">Prediction amount preview</DialogTitle>
          <DialogDescription className="sr-only">
            Select Yes or No and an amount in USDC. No funds move.
          </DialogDescription>
          <PreviewAmount selected={selected} onSelect={setSelected} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
function PreviewAmount({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [amount, setAmount] = useState("10");
  return (
    <aside
      className="min-w-0 w-full rounded-2xl lg:sticky lg:top-24 lg:border lg:border-border lg:bg-card lg:p-5"
      aria-label="Prediction preview"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Amount</h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">Preview</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {["Yes", "No"].map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={selected === String(i)}
            onClick={() => onSelect(String(i))}
            className={`ios-press min-h-10 rounded-full border text-sm font-semibold ${selected === String(i) ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}
          >
            {label} —
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-3 rounded-[18px] border border-border bg-background/60 px-4">
        <span className="sr-only">USDC amount</span>
        <input
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none"
        />
        <span className="rounded-full border border-border px-2 py-1 text-xs font-semibold">
          USDC
        </span>
      </label>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[5, 10, 25, 50].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={amount === String(n)}
            onClick={() => setAmount(String(n))}
            className={`ios-press min-h-9 rounded-xl text-xs font-semibold ${amount === String(n) ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <span>Share price</span>
        <span>—</span>
      </div>
      <button
        type="button"
        disabled
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary text-sm font-semibold text-muted-foreground"
      >
        <LockKeyhole size={14} />
        Trading not enabled
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Preview only · No funds move.
      </p>
    </aside>
  );
}
