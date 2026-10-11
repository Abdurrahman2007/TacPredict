import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { marketPreviewsQueryOptions, type MarketPreview } from "@/lib/agent/discovery.functions";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
export function PrelaunchMarkets({
  query = "",
  category = "All",
}: {
  query?: string;
  category?: string;
}) {
  const q = useQuery(marketPreviewsQueryOptions),
    [selected, setSelected] = useState<MarketPreview | null>(null);
  const rows = (q.data ?? []).filter(
    (p) =>
      (category === "All" || category === "Crypto") &&
      p.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  if (q.isPending)
    return (
      <div
        className="mt-6 grid gap-3 sm:grid-cols-3"
        aria-label="Loading market previews"
        aria-busy="true"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-44 rounded-3xl border border-border bg-card motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  if (!rows.length) return null;
  return (
    <section className="mt-7" aria-label="TacPredict pre-launch markets">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Next on TacPredict</h2>
        <span className="text-[11px] text-muted-foreground">Pre-launch · trading paused</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setSelected(p)}
            className="group rounded-[24px] border border-border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline-primary"
          >
            <div className="flex justify-between">
              <img
                alt=""
                src={`/brand/crypto/${p.asset === "bitcoin" ? "btc" : p.asset === "ethereum" ? "eth" : "sol"}.svg`}
                className="size-9"
              />
              <span className="finance-badge !text-[10px]">Preview</span>
            </div>
            <h3 className="mt-4 text-sm font-semibold leading-6">{p.title}</h3>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <span className="rounded-full bg-secondary py-2 text-center text-xs text-muted-foreground">
                Yes —
              </span>
              <span className="rounded-full bg-secondary py-2 text-center text-xs text-muted-foreground">
                No —
              </span>
            </div>
            <div className="mt-4 flex justify-between text-[10px] text-muted-foreground">
              <span>No on-chain trades yet</span>
              <ArrowUpRight size={14} />
            </div>
          </button>
        ))}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="w-[calc(100%_-_2rem)] max-h-[85dvh] overflow-auto rounded-3xl">
          {selected && (
            <>
              <DialogTitle className="pr-5 leading-7">{selected.title}</DialogTitle>
              <DialogDescription>
                Original TacPredict question · Base Mainnet · native USDC. Preview only, not an
                on-chain market.
              </DialogDescription>
              <p className="text-sm leading-7">{selected.rules}</p>
              <div className="rounded-xl border border-border p-4 text-xs leading-6 text-muted-foreground">
                Share price — · Volume — · On-chain ID —<br />A Factory transaction, locked approved
                terms, liquidity and a verified oracle workflow are required before trading.
              </div>
              <p className="text-xs text-muted-foreground">
                Draft reference observation: ${selected.observedPrice.toLocaleString("en-US")} ·{" "}
                {selected.observedAt}
              </p>
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary"
              >
                Proposed resolution source ↗
              </a>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole size={14} />
                Trading is not enabled
              </span>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
