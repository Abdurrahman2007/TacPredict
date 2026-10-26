import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UpDownAsset } from "@/lib/updown/window.mjs";
import type { PoolConfig, PoolRound } from "@/lib/pool/pool-types";
import type { IslandContext } from "./island";
type Common = {
  asset: UpDownAsset;
  minutes: number;
  startMs: number;
  nowMs: number;
  config: PoolConfig;
  round: PoolRound | null;
};
/** Legacy real-USDC execution controls intentionally removed. Virtual controls live in the existing amount card. */
export function PoolTradeBar(_props: Common & { context: IslandContext }) {
  return null;
}
export function PoolRoundCard(_props: Common) {
  return null;
}
export function PoolRulesCard(_props: { asset: UpDownAsset; minutes: number; feeBps: number }) {
  return null;
}
/** Shown when no bets can be placed on this round. It never shows a made-up price. */
export function PoolOffBar({ message }: { message: string }) {
  const [ready, setReady] = useState(false);
  const [navHeight, setNavHeight] = useState(80);
  useEffect(() => {
    setReady(true);
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    setNavHeight(nav?.getBoundingClientRect().height ?? 0);
  }, []);
  if (!ready) return null;
  return createPortal(
    <div className="ud-bar" style={{ bottom: navHeight }} aria-label="Betting status">
      <div className="ud-bar-inner pool-off-directions" title={message}>
        <button type="button" data-side="up" disabled aria-label={`Up — ${message}`}>
          Up
        </button>
        <button type="button" data-side="down" disabled aria-label={`Down — ${message}`}>
          Down
        </button>
        <span role="status">Trading opens soon</span>
      </div>
    </div>,
    document.body,
  );
}
