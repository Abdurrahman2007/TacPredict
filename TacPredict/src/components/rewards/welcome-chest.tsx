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
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="24"
        r="16.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
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

function useCountUp(target: number | null, run: boolean, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) return;
    if (!run || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

/**
 * Premium reward box: idle float → charge (shake + glow) → flash & burst (lid flies, light
 * beam, coins and confetti) → amount counts up. Reduced-motion users get the final state.
 */
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
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!opening) {
      if (amount != null) setPhase((p) => (p === "idle" ? "done" : p));
      return;
    }
    setAnimated(true);
    setPhase("shake");
    const t1 = window.setTimeout(() => setPhase("open"), 850);
    const t2 = window.setTimeout(() => setPhase("burst"), 1000);
    const t3 = window.setTimeout(() => setPhase("reveal"), 1350);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [opening, amount]);

  useEffect(() => {
    if (amount != null && !opening) {
      const id = window.setTimeout(() => setPhase("done"), animated ? 400 : 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [amount, opening, animated]);

  const shown = useCountUp(amount, animated && (phase === "reveal" || phase === "done"));
  const confetti = Array.from({ length: 22 }, (_, i) => i);
  const coins = Array.from({ length: 9 }, (_, i) => i);
  const opened = phase === "open" || phase === "burst" || phase === "reveal" || phase === "done";

  return (
    <div
      className={`rb-stage ${priority ? "priority" : ""}`}
      data-phase={phase}
      data-opened={opened || undefined}
    >
      <span className="rb-rays" aria-hidden />
      <span className="rb-glow" aria-hidden />
      <span className="rb-flash" aria-hidden />
      <button
        type="button"
        className="rb-hit"
        onClick={onOpen}
        disabled={disabled || opening || phase === "done"}
        aria-label="Open welcome reward box"
      >
        <span className="rb-box" aria-hidden>
          <span className="rb-beam" />
          <span className="rb-lid">
            <span className="rb-ribbon-v" />
            <span className="rb-bow">
              <i />
              <i />
            </span>
          </span>
          <span className="rb-body">
            <span className="rb-ribbon-v" />
            <span className="rb-seal">
              <UsdcCoin size={40} />
            </span>
          </span>
        </span>
        <span className="rb-shadow" aria-hidden />
      </button>
      <span className="rb-burst" aria-hidden>
        {coins.map((i) => (
          <span key={`c${i}`} className="rb-coin" style={{ ["--i" as string]: i }}>
            <UsdcCoin size={26} />
          </span>
        ))}
        {confetti.map((i) => (
          <i key={i} className="rb-confetti" style={{ ["--i" as string]: i }} />
        ))}
      </span>

      <div
        className={`rb-reveal ${phase === "reveal" || phase === "done" ? "on" : ""}`}
        role="status"
        aria-live="polite"
      >
        {amount != null ? (
          <>
            <span className="rb-reveal-label">You won</span>
            <strong>+${shown.toLocaleString("en-US")}</strong>
            <span className="rb-reveal-sub">Virtual USDC credited</span>
          </>
        ) : opening ? (
          <span className="rb-reveal-label">Opening…</span>
        ) : (
          <span className="rb-tap">Tap the box to open</span>
        )}
      </div>
    </div>
  );
}
