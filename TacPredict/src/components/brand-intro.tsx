import { useEffect, useState } from "react";

export function BrandIntro() {
  // Render the overlay on the server too, so Home never flashes before hydration.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Root shell stays mounted during navigation; a full reload starts a new intro.
    // No storage gate: every page load gets the same opening treatment.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setVisible(false), reducedMotion ? 900 : 2100);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div
      className="brand-intro-3d fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-background"
      aria-label="Tac Predict opening animation"
      style={{ animationDuration: "2100ms" }}
    >
      <div className="intro-stage" aria-hidden="true">
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
          Tac Predict
        </div>
      </div>
    </div>
  );
}
