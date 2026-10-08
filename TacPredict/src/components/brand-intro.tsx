import { useCallback, useEffect, useState } from "react";
const introKey = "tacpredict-brand-intro-3d-v3";
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
    const timer = setTimeout(finish, 3200);
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
        <div className="intro-camera">
          <div className="intro-logo-model">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="intro-logo-depth"
                style={{ transform: `translateZ(${i - 20}px)` }}
              />
            ))}
            <div className="intro-logo-face">
              <img src="/brand/tacpredict.svg" width="512" height="512" alt="" />
              <span className="intro-logo-shine" />
            </div>
          </div>
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
