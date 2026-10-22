import { Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { BrandMark } from "./brand-mark";
import "@/styles/site-footer.css";

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932 6.064-6.933Zm-1.29 19.49h2.039L6.488 3.24H4.3l13.31 17.403Z" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21.9 3.1 18.6 20c-.25 1.2-.9 1.5-1.9.95l-5.1-3.75-2.45 2.35c-.27.27-.5.5-1.02.5l.37-5.2 9.46-8.55c.42-.37-.1-.58-.65-.2L5.62 13.47.6 11.9c-1.1-.34-1.13-1.1.23-1.63L20.45 2.7c.92-.34 1.72.2 1.45.4Z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="tp-site-footer" aria-label="TacPredict footer">
      <Link to="/" className="footer-brand" aria-label="TacPredict home">
        <BrandMark className="size-16" />
        <strong>TacPredict</strong>
      </Link>
      <div className="footer-columns">
        <nav aria-label="Footer navigation">
          <h2>Explore</h2>
          <Link to="/">Home</Link>
          <Link to="/up-down">Up or Down</Link>
          <Link to="/markets" search={{ category: "Football" }}>
            Football
          </Link>
          <Link to="/markets" search={{ category: "Cricket" }}>
            Cricket
          </Link>
          <Link to="/profile">Portfolio</Link>
        </nav>
        <div className="footer-socials">
          <h2>Socials</h2>
          <a
            href="https://x.com/TacPredict"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TacPredict on X (opens in a new tab)"
          >
            <XIcon />
            <span>X / Twitter</span>
          </a>
          <a
            href="https://t.me/TacPredict"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TacPredict on Telegram (opens in a new tab)"
          >
            <TelegramIcon />
            <span>Telegram</span>
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <small>© {new Date().getUTCFullYear()} TacPredict</small>
        <button
          type="button"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          Back to top <ArrowUp size={15} />
        </button>
      </div>
    </footer>
  );
}
