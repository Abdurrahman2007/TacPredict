import { useEffect, useState } from "react";
export function BrandIntro() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem("tacpredict-brand-intro")) return;
    } catch {
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem("tacpredict-brand-intro", "1");
      } catch {
        /* Intro remains optional. */
      }
    }, 820);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? (
    <div
      className="brand-intro pointer-events-none fixed inset-0 z-[100] grid place-items-center"
      aria-hidden="true"
    >
      <div className="text-center">
        <img
          src="/brand/tacpredict.svg"
          alt=""
          width={120}
          height={120}
          className="brand-intro-mark mx-auto rounded-3xl"
        />
        <p className="mt-5 text-2xl font-bold tracking-tight">TacPredict</p>
        <p className="mt-2 text-xs font-medium tracking-[.25em] text-muted-foreground">
          MAKE YOUR CALL
        </p>
      </div>
    </div>
  ) : null;
}
