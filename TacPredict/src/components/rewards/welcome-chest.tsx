import { useEffect, useState } from "react";

type Phase = "idle" | "shake" | "open" | "burst" | "reveal" | "done";

/**
 * Local USDC-style coin: blue disc, white ring, white $.
 * No external image dependency, so it can never render as a broken image.
 */
export function UsdcCoin({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Virtual USDC"
      style={{ display: "block", flexShrink: 0 }}
    >
      <circle cx="24" cy="24" r="22" fill="#2775ca" />
      <circle cx="24" cy="24" r="22" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="16.5" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
      <text
        x="24"
        y="32.5"
        textAnchor="middle"
        fontSize="26"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        $
      </text>
    </svg>
  );
}

/** High-quality welcome box: shake → lid open → coin burst → amount reveal. Reduced-motion users get the final state without animation (see chest-open.css). */
export function WelcomeChestBox({
  opening,
  amount,
  priority,
  onOpen,
  disabled,
}: {
  opening: boolean;
  amount: number | null;
  priority: boolean;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!opening) {
      if (amount != null) setPhase("done");
      return;
    }
    setPhase("shake");
    const t1 = window.setTimeout(() => setPhase("open"), 520);
    const t2 = window.setTimeout(() => setPhase("burst"), 760);
    const t3 = window.setTimeout(() => setPhase("reveal"), 1250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [opening, amount]);

  useEffect(() => {
    if (amount != null && !opening) setPhase("done");
  }, [amount, opening]);

  const particles = Array.from({ length: 14 }, (_, i) => i);

  return (
    <div className={`tp-chest-stage ${priority ? "priority" : ""}`} data-phase={phase}>
      <button
        type="button"
        className="tp-chest-hit"
        onClick={onOpen}
        disabled={disabled || opening || phase === "done"}
        aria-label="Open welcome reward box"
      >
        <span className="tp-chest-aura" aria-hidden />
        <span className="tp-chest-sparkles" aria-hidden>
          {particles.map((i) => (
            <i key={i} style={{ ["--i" as string]: i }} />
          ))}
        </span>
        <span className="tp-chest-3d" aria-hidden>
          <span className="tp-chest-lid">
            <span className="tp-chest-lid-face" />
            <span className="tp-chest-latch" />
          </span>
          <span className="tp-chest-body">
            <span className="tp-chest-rim" />
            <span className="tp-chest-band" />
            <span className="tp-chest-seal">
              <UsdcCoin size={56} />
            </span>
          </span>
          <span className="tp-chest-coins">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="tp-chest-coin"
                style={{ ["--c" as string]: i }}
              >
                <UsdcCoin size={36} />
              </span>
            ))}
          </span>
        </span>
        <span className="tp-chest-floor-glow" aria-hidden />
      </button>

      <div
        className={`tp-chest-reveal ${phase === "reveal" || phase === "done" ? "on" : ""}`}
        role="status"
        aria-live="polite"
      >
        {amount != null ? (
          <>
            <UsdcCoin size={32} />
            <strong>+${amount}</strong>
            <span>Virtual USDC credited</span>
          </>
        ) : opening ? (
          <span className="tp-chest-opening-label">Opening…</span>
        ) : null}
      </div>
    </div>
  );
}
