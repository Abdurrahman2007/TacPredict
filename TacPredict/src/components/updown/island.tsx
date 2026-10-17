import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ASSETS, formatUsd, type UpDownAsset } from "@/lib/updown/window.mjs";

/**
 * Compact floating header that slides in when the main price block scrolls out of view, in the
 * spirit of the iPhone "dynamic island". Tapping it brings you back to the top.
 */
export function UpDownIsland({
  show,
  asset,
  label,
  stateText,
  live,
  price,
  deltaText,
  direction,
}: {
  show: boolean;
  asset: UpDownAsset;
  label: string;
  stateText: string;
  live: boolean;
  price: number | null;
  deltaText: string | null;
  direction: "up" | "down" | "flat" | null;
}) {
  const [top, setTop] = useState(64);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const header = document.querySelector(".app-header");
    const update = () => setTop(Math.round(header?.getBoundingClientRect().bottom ?? 56) + 8);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        })
      }
    >
      <img src={`/brand/crypto/${ASSETS[asset].logo}.svg`} alt="" />
      <b>{label}</b>
      <span className={live ? "ud-live" : "ud-muted"}>{stateText}</span>
      <span>{formatUsd(price, asset)}</span>
      {deltaText && (
        <span className={direction === "up" ? "ud-up" : direction === "down" ? "ud-down" : "ud-muted"}>
          {direction === "up" ? "↗" : direction === "down" ? "↘" : ""} {deltaText}
        </span>
      )}
    </button>,
    document.body,
  );
}

