import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { PredictionAmountCard } from "@/components/prediction-amount-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { cents } from "@/lib/protocol/display.mjs";
import { UpDownIslandContent, type IslandContext } from "./island";
import "@/styles/prediction-detail.css";

/** A reference-only window may open the UI, but never acquires native trading capabilities. */
export function UpDownTradeBar({
  market,
  reference,
  context,
  initialSide,
}: {
  market: Market | null;
  reference: Market;
  context: IslandContext;
  initialSide?: "up" | "down" | undefined;
}) {
  const [ready, setReady] = useState(false);
  const [navHeight, setNavHeight] = useState(80);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const view = market ?? reference;
  const initialApplied = useRef<string | undefined>(undefined);
  useEffect(() => {
    setOpen(false);
    setSelected(undefined);
  }, [view.id]);
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
  const up = view.outcomes.find((o) => /^up$/i.test(o.label)) ?? view.outcomes[0];
  const down = view.outcomes.find((o) => /^down$/i.test(o.label)) ?? view.outcomes[1];
  function choose(id: string | undefined) {
    if (id) {
      setSelected(id);
      setOpen(true);
    }
  }
  useEffect(() => {
    if (!ready || !initialSide || initialApplied.current === initialSide) return;
    initialApplied.current = initialSide;
    const outcome = initialSide === "up" ? up : down;
    if (outcome) {
      setSelected(outcome.id);
      setOpen(true);
    }
  }, [ready, initialSide, up?.id, down?.id]);
  if (!ready) return null;
  return createPortal(
    <>
      <div className="ud-bar" style={{ bottom: navHeight }} aria-label="Up or Down">
        <div className="ud-bar-inner">
          <button type="button" data-side="up" onClick={() => choose(up?.id)}>
            Up {cents(up)}
          </button>
          <button type="button" data-side="down" onClick={() => choose(down?.id)}>
            Down {cents(down)}
          </button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="pd-trade-screen ud-trade-screen translate-x-0 translate-y-0 lg:-translate-x-1/2">
          <DialogTitle className="sr-only">Trade {context.label}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose Buy or Sell and review your order. Reference prices are not executable quotes.
            {view.virtual
              ? "Virtual USDC only. Each trade requires its own transaction."
              : "No verified Virtual USDC market is available for this reference window."}
          </DialogDescription>
          <div className="pd-trade-top">
            <div className="pd-handle" />
            <div className="ud-island-inline">
              <UpDownIslandContent {...context} />
            </div>
            <DialogClose className="pd-close" aria-label="Close trade screen">
              <X size={18} />
            </DialogClose>
          </div>
          <div className="pd-trade-content">
            <PredictionAmountCard
              key={view.id}
              market={view}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>,
    document.body,
  );
}
