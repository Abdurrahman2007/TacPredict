import { useSyncExternalStore } from "react";

const KEY = "tac-trade-slippage-bps";
const EVENT = "tac-trade-slippage";
export const SLIPPAGE_PRESETS = [50, 100, 200] as const; // 0.5% · 1% · 2%

function read(): number {
  try {
    const raw = Number(localStorage.getItem(KEY));
    if (Number.isFinite(raw) && raw >= 10 && raw <= 1000) return Math.round(raw);
  } catch {
    /* unavailable storage */
  }
  return 100;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useTradeSlippage(): [number, (bps: number) => void] {
  const bps = useSyncExternalStore(subscribe, read, () => 100);
  return [
    bps,
    (next) => {
      const value = Math.min(1000, Math.max(10, Math.round(next)));
      try {
        localStorage.setItem(KEY, String(value));
        window.dispatchEvent(new Event(EVENT));
      } catch {
        /* unavailable storage */
      }
    },
  ];
}

export function formatSlippage(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
