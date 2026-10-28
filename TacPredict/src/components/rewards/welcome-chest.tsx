import { useEffect, useState } from "react";

const USDC_LOGO =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png";

type Phase = "idle" | "shake" | "open" | "reveal" | "done";

/** High-quality welcome box: shake → lid open → coin burst → amount reveal. */
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
    const t2 = window.setTimeout(() => setPhase("reveal"), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
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
            <img src={USDC_LOGO} alt="" width={42} height={42} className="tp-chest-seal" />
          </span>
          <span className="tp-chest-coins">
            {[0, 1, 2, 3, 4].map((i) => (
              <img
                key={i}
                src={USDC_LOGO}
                alt=""
                width={28}
                height={28}
                className="tp-chest-coin"
                style={{ ["--c" as string]: i }}
              />
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
            <img src={USDC_LOGO} alt="" width={28} height={28} />
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
