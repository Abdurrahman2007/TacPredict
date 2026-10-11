import { useCallback, useEffect, useState } from "react";
const introKey = "tacpredict-brand-intro-3d-pixels-v4";
export function BrandIntro() {
  const [visible, setVisible] = useState(false);
  const finish = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(introKey, "1");
    } catch {
      /* Optional intro. */
    }
  }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem(introKey)) return;
    } catch {
      return;
    }
    setVisible(true);
    const timer = setTimeout(finish, 2100);
    return () => clearTimeout(timer);
  }, [finish]);
  if (!visible) return null;
  return (
    <div
      className="brand-intro-3d fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-[#0b1018]"
      aria-label="TacPredict opening animation"
    >
      <div className="intro-ambient" aria-hidden="true" />
      <div className="intro-stage" aria-hidden="true">
        <div className="intro-floor" />
        <div className="pixel-logo" aria-hidden="true">
          {Array.from({ length: 64 }, (_, i) => {
            const x = i % 8,
              y = Math.floor(i / 8);
            return (
              <span
                key={i}
                className="pixel-logo-tile"
                style={
                  {
                    left: `${x * 12.5}%`,
                    top: `${y * 12.5}%`,
                    backgroundPosition: `${(x * 100) / 7}% ${(y * 100) / 7}%`,
                    "--px": `${(x - 3.5) * 24}px`,
                    "--py": `${(y - 3.5) * 24}px`,
                    "--turn": `${(i % 2 ? 1 : -1) * 60}deg`,
                    "--delay": `${(x + y) * 24}ms`,
                  } as import("react").CSSProperties
                }
              />
            );
          })}
        </div>
        <div className="intro-wordmark">
          TacPredict<span>Predict what’s next.</span>
        </div>
      </div>
      <button
        type="button"
        onClick={finish}
        className="absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] min-h-11 rounded-full border border-white/10 bg-white/5 px-5 text-sm text-white/70 transition hover:bg-white/10"
      >
        Skip
      </button>
    </div>
  );
}
