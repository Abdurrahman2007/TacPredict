import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";
import "@/styles/prediction-intro.css";

/** Real token logos already shipped in /public/brand/crypto. */
const TOKENS = [
  { key: "btc", name: "Bitcoin" },
  { key: "eth", name: "Ethereum" },
  { key: "sol", name: "Solana" },
  { key: "bnb", name: "BNB" },
] as const;

/**
 * Opening scene: a market opens. A line draws toward a "price to beat", then splits into the two
 * outcomes every TacPredict round has, Up and Down, and the Up branch settles in. The line is a
 * drawing, not data: it carries no price, number or quote.
 */
export function BrandIntro() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!visible) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const timer = window.setTimeout(() => setVisible(false), reduced ? 500 : 2900);
    return () => {
      window.clearTimeout(timer);
      root.style.overflow = before;
    };
  }, [visible]);
  if (!visible) return null;
  return (
    <div
      className="prediction-intro"
      role="status"
      aria-label="Opening TacPredict"
      onClick={() => setVisible(false)}
    >
      <div className="pi-glow" aria-hidden="true" />
      <div className="pi-stage" aria-hidden="true">
        <div className="pi-brand">
          <BrandMark className="pi-mark" />
          <strong>TacPredict</strong>
        </div>
        <svg className="pi-chart" viewBox="0 0 320 170" fill="none">
          <g className="pi-grid" stroke="currentColor" strokeWidth=".6">
            <path d="M0 28H320M0 84H320M0 140H320" />
            <path d="M64 8V162M128 8V162M192 8V162M256 8V162" />
          </g>
          <path className="pi-beat" d="M0 84H320" stroke="#7d8b95" strokeWidth="1" strokeDasharray="3 6" />
          <text className="pi-beat-label" x="6" y="76">
            Price to beat
          </text>
          <path
            className="pi-line"
            pathLength={1}
            d="M0 118L28 108L52 122L84 98L110 108L140 84"
            stroke="#c9d4dc"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="pi-up"
            pathLength={1}
            d="M140 84C172 66 204 50 232 38L292 24"
            stroke="#55c878"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            className="pi-down"
            pathLength={1}
            d="M140 84C172 102 204 118 232 130L292 146"
            stroke="#ff454f"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle className="pi-now-ring" cx="140" cy="84" r="6" stroke="#c9d4dc" strokeWidth="1.2" />
          <circle className="pi-now" cx="140" cy="84" r="3.6" fill="#edf2f5" />
          <g className="pi-end pi-end-up">
            <circle cx="292" cy="24" r="11" fill="#55c878" />
            <path d="M292 29V19M287.5 23.5L292 19L296.5 23.5" stroke="#0f161a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g className="pi-end pi-end-down">
            <circle cx="292" cy="146" r="11" fill="#ff454f" />
            <path d="M292 141V151M287.5 146.5L292 151L296.5 146.5" stroke="#0f161a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
        <p className="pi-tagline">Up or Down · USDC on Base</p>
        <ul className="pi-tokens">
          {TOKENS.map((token, index) => (
            <li key={token.key} style={{ animationDelay: `${1550 + index * 130}ms` }}>
              <img src={`/brand/crypto/${token.key}.svg`} width={30} height={30} alt="" decoding="async" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
