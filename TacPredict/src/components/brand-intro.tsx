import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";
import "@/styles/prediction-intro.css";
export function BrandIntro() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const timer = window.setTimeout(
      () => {
        document.documentElement.style.overflow = before;
        setVisible(false);
      },
      reduced ? 500 : 1850,
    );
    return () => {
      window.clearTimeout(timer);
      document.documentElement.style.overflow = before;
    };
  }, []);
  if (!visible) return null;
  return (
    <div className="prediction-intro" role="status" aria-label="Opening TacPredict">
      <div className="prediction-intro-stage" aria-hidden="true">
        <svg className="prediction-intro-orbits" viewBox="0 0 280 280" fill="none">
          <circle cx="140" cy="140" r="105" stroke="currentColor" strokeWidth=".7" />
          <circle
            cx="140"
            cy="140"
            r="128"
            stroke="currentColor"
            strokeWidth=".5"
            strokeDasharray="2 12"
          />
          <path
            className="intro-signal"
            d="M18 166 H67 L98 135 L120 151 L159 112 L185 127 L222 91 H262"
            stroke="#aac1d8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle className="intro-orbit-point" cx="140" cy="35" r="3" fill="#62cf8a" />
        </svg>
        <div className="prediction-intro-logo">
          <BrandMark className="size-24" />
        </div>
        <strong>TacPredict</strong>
        <div className="prediction-intro-track">
          <span />
        </div>
      </div>
    </div>
  );
}
