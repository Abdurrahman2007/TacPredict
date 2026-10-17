import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ASSETS, formatUsd, type UpDownAsset } from "@/lib/updown/window.mjs";

export type IslandContext = {
  asset: UpDownAsset;
  label: string;
  stateText: string;
  live: boolean;
  price: number | null;
  deltaText: string | null;
  direction: "up" | "down" | "flat" | null;
};
export function UpDownIslandContent({
  asset,
  label,
  stateText,
  live,
  price,
  deltaText,
  direction,
}: IslandContext) {
  return (
    <>
      <img src={`/brand/crypto/${ASSETS[asset].logo}.svg`} alt="" />
      <span className="ud-island-copy">
        <b>{label}</b>
        <span className="ud-island-values">
          <span className={live ? "ud-live" : "ud-muted"}>{stateText}</span>
          <strong>{price === null ? "$0" : formatUsd(price, asset)}</strong>
          {deltaText && (
            <span
              className={
                direction === "up" ? "ud-up" : direction === "down" ? "ud-down" : "ud-muted"
              }
            >
              {direction === "up" ? "↗" : direction === "down" ? "↘" : ""} {deltaText}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
/** Portalled so route entrance transforms cannot trap the fixed header. */
export function UpDownIsland({ show, ...context }: IslandContext & { show: boolean }) {
  const [top, setTop] = useState(80);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const header = document.querySelector(".app-header");
    const update = () => setTop(Math.round(header?.getBoundingClientRect().bottom ?? 64) + 8);
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (header) ro?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  if (!ready) return null;
  return createPortal(
    <button
      type="button"
      className="ud-island"
      data-show={show}
      style={{ top }}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      aria-label={`Back to ${context.label}`}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        })
      }
    >
      <UpDownIslandContent {...context} />
    </button>,
    document.body,
  );
}
