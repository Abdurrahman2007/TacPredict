import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import "@/styles/market-discovery.css";

const categories = ["Crypto", "Football", "Cricket"] as const;

/** Decorative discovery globe, running only when scrolled into view. Never a startup overlay. */
export function MarketDiscovery() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(motion.matches);
    sync();
    motion.addEventListener("change", sync);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.15 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      motion.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!visible || reduced) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % categories.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [visible, reduced]);
  const category = categories[index]!;
  return (
    <section
      ref={ref}
      className="market-discovery"
      data-visible={visible}
      aria-labelledby="discover-heading"
    >
      <h2 id="discover-heading">Explore Markets</h2>
      <div className="discovery-scene">
        <div className="discovery-globe" aria-hidden="true">
          <svg viewBox="0 0 720 360" fill="none" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="discovery-glow">
                <stop stopColor="#b8c5ec" stopOpacity=".55" />
                <stop offset=".53" stopColor="#087aa5" stopOpacity=".48" />
                <stop offset="1" stopColor="#0f161a" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="360" cy="215" rx="355" ry="200" fill="url(#discovery-glow)" />
            <g className="discovery-grid" stroke="currentColor" strokeWidth=".7">
              {[70, 120, 175, 230, 285].map((y) => (
                <path key={y} d={`M0 ${y} Q360 ${y - 75} 720 ${y + 25}`} />
              ))}
              {[-285, -190, -95, 0, 95, 190, 285].map((x) => (
                <ellipse
                  key={x}
                  cx={360 + x * 0.22}
                  cy="215"
                  rx={Math.max(42, 350 - Math.abs(x))}
                  ry="205"
                  transform={`rotate(${x / 18} 360 215)`}
                />
              ))}
            </g>
          </svg>
        </div>
        <div className="discovery-copy">
          <h3>
            Discover <span key={category}>{category}</span>
          </h3>
          {category === "Crypto" ? (
            <Link to="/up-down" className="discovery-action">
              View live prices <ArrowUpRight size={17} />
            </Link>
          ) : (
            <Link to="/markets" search={{ category }} className="discovery-action">
              View markets <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
      </div>
      <div className="discovery-notes">
        <article>
          <h3>Follow the market</h3>
          <p>Live crypto prices, charts and time windows.</p>
        </article>
        <article>
          <h3>Back what you know</h3>
          <p>Explore Football and Cricket predictions.</p>
        </article>
        <article>
          <h3>Your portfolio</h3>
          <p>Your positions and history, in one place.</p>
        </article>
      </div>
    </section>
  );
}
