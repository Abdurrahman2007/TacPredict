import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Market } from "@/domain/markets/types";
import { PredictionAmountCard } from "@/components/prediction-amount-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cents } from "@/lib/protocol/display.mjs";

/**
 * Sticky bottom bar with the two prices. Prices and trading come from the TacPredict market for
 * this exact window; when no market exists the buttons stay off and show 0¢, never a guess.
 */
export function UpDownTradeBar({ market }: { market: Market | null }) {
  const [ready, setReady] = useState(false);
  const [navHeight, setNavHeight] = useState(80);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  useEffect(() => {
    setReady(true);
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const update = () => setNavHeight(nav?.getBoundingClientRect().height ?? 0);
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (nav) ro?.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const up = market?.outcomes.find((o) => /^up$/i.test(o.label)) ?? market?.outcomes[0];
  const down = market?.outcomes.find((o) => /^down$/i.test(o.label)) ?? market?.outcomes[1];
  const tradable = Boolean(market?.native && market.native.status === "OPEN");

  function choose(id: string | undefined) {
    if (!tradable || !id) return;
    setSelected(id);
    setOpen(true);
  }

  if (!ready) return null;
  return createPortal(
    <>
      <div className="ud-bar" style={{ bottom: navHeight }} aria-label="Up or Down">
        <div style={{ width: "100%" }}>
          <div className="ud-bar-inner">
            <button type="button" data-side="up" disabled={!tradable || !up} onClick={() => choose(up?.id)}>
              Up {cents(up)}
            </button>
            <button type="button" data-side="down" disabled={!tradable || !down} onClick={() => choose(down?.id)}>
              Down {cents(down)}
            </button>
          </div>
          {!tradable && (
            <p className="ud-bar-note">
              {market ? "Trading is not open for this window." : "No TacPredict market for this window yet."}
            </p>
          )}
        </div>
      </div>
      {market && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bottom-0 top-auto w-full max-w-md translate-y-0 grid-cols-1 gap-0 overflow-y-auto rounded-t-[28px] rounded-b-none border-b-0 bg-card p-0 shadow-2xl max-h-[calc(100dvh-80px)] sm:rounded-t-[28px] sm:rounded-b-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Place a prediction</DialogTitle>
              <DialogDescription>Choose an amount and a limit price in USDC.</DialogDescription>
            </DialogHeader>
            <div className="min-w-0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/30" />
              <PredictionAmountCard key={market.id} market={market} selected={selected} onSelect={setSelected} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>,
    document.body,
  );
}
