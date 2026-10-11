import { useCallback, useEffect, useState } from "react";
const introKey = "tacpredict-brand-intro-3d-v4";
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
    const timer = setTimeout(finish, 3600);
    return () => clearTimeout(timer);
  }, [finish]);
  if (!visible) return null;
  return (
    <div
      className="brand-intro-3d fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-[#070b12]"
      aria-label="TacPredict opening animation"
      aria-live="polite"
    >
      <div className="intro-ambient" aria-hidden="true" />
      <div className="intro-ring" aria-hidden="true" />
      <div className="intro-stage" aria-hidden="true">
        <div className="intro-floor" />
        <div className="intro-camera">
          <div className="intro-logo-model">
            {Array.from({ length: 28 }, (_, i) => (
              <div
                key={i}
                className="intro-logo-depth"
                style={{ transform: `translateZ(${(i - 28) * 1.15}px)` }}
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
    </div>
  );
}
