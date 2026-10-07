import { useEffect, useState } from "react";
const introKey = "tacpredict-brand-intro-video-v2";
export function BrandIntro() {
  const [visible, setVisible] = useState(false);
  function finish() {
    setVisible(false);
    try {
      sessionStorage.setItem(introKey, "1");
    } catch {
      /* Optional intro. */
    }
  }
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem(introKey)) return;
    } catch {
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem(introKey, "1");
      } catch {
        /* Optional intro. */
      }
    }, 2400);
    return () => clearTimeout(timer);
  }, []);
  return visible ? (
    <div className="fixed inset-0 z-[100] bg-background" aria-label="TacPredict opening animation">
      <video
        src="/brand/tacpredict-intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        className="h-full w-full object-contain"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={finish}
        className="absolute right-4 top-4 min-h-11 rounded-full bg-secondary/80 px-4 text-sm text-muted-foreground"
      >
        Skip
      </button>
    </div>
  ) : null;
}
