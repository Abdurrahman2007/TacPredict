import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Market } from "@/domain/markets/types";
import { cents } from "@/lib/protocol/display.mjs";
export function MobileOutcomeDock({
  market,
  selected,
  onSelect,
}: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [ready, setReady] = useState(false),
    [navHeight, setNavHeight] = useState(80);
  useEffect(() => {
    setReady(true);
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const update = () => setNavHeight(nav?.getBoundingClientRect().height ?? 80);
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (nav) ro?.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  if (!ready || !market.outcomes.length) return null;
  return createPortal(
    <div
      className="pd-dock fixed inset-x-0 z-40 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
      aria-label="Quick outcome selection"
      style={{ bottom: navHeight }}
    >
      {market.outcomes.slice(0, 2).map((item, index) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selected === item.id}
          onClick={() => onSelect(item.id)}
          className={`ios-press min-h-12 min-w-0 flex-1 rounded-full border px-3 text-sm font-semibold ${selected === item.id ? "border-white/25 text-white shadow-lg" : "border-white/10 text-white/85"}`}
          style={{
            background: /^(yes|up)$/i.test(item.label)
              ? "#197c53"
              : /^(no|down)$/i.test(item.label)
                ? "#a24353"
                : index === 0
                  ? "#526680"
                  : "#49555f",
          }}
        >
          {item.label} {cents(item)}
        </button>
      ))}
    </div>,
    document.body,
  );
}
