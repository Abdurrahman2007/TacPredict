import { Bot, Clapperboard, Landmark, Newspaper, Shapes, Trophy } from "lucide-react";
import type { Market } from "@/domain/markets/types";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function MarketIcon({ market, className }: { market: Market; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const cryptoAsset = /\b(bitcoin|btc)\b/i.test(market.title)
    ? "btc"
    : /\b(ethereum|eth)\b/i.test(market.title)
      ? "eth"
      : /\b(solana|sol)\b/i.test(market.title)
        ? "sol"
        : null;
  if (market.category === "Crypto" && cryptoAsset)
    return (
      <span className={cn("market-icon overflow-hidden", className)}>
        <img
          src={`/brand/crypto/${cryptoAsset}.svg`}
          alt={`${cryptoAsset.toUpperCase()} logo`}
          className="size-full object-contain"
          width={48}
          height={48}
        />
      </span>
    );
  if (market.image?.startsWith("https://") && failed !== market.image)
    return (
      <span className={cn("market-icon overflow-hidden bg-secondary", className)}>
        <img
          src={market.image}
          alt={`${market.title} source logo`}
          className="size-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(market.image ?? null)}
        />
      </span>
    );
  if (market.category === "Sports")
    return (
      <span
        className={cn("market-icon bg-sport text-sport-foreground", className)}
        aria-label="Sports"
      >
        <Trophy />
      </span>
    );
  if (market.category === "Technology")
    return (
      <span
        className={cn("market-icon bg-tech text-tech-foreground", className)}
        aria-label="Technology"
      >
        <Bot />
      </span>
    );
  if (market.category === "News")
    return (
      <span className={cn("market-icon bg-news text-news-foreground", className)} aria-label="News">
        <Newspaper />
      </span>
    );
  if (market.category === "Culture")
    return (
      <span
        className={cn("market-icon bg-tech text-tech-foreground", className)}
        aria-label="Culture"
      >
        <Clapperboard />
      </span>
    );
  if (market.category === "Business")
    return (
      <span
        className={cn("market-icon bg-business text-business-foreground", className)}
        aria-label="Business"
      >
        <Landmark />
      </span>
    );
  return (
    <span
      className={cn("market-icon bg-category text-category-foreground", className)}
      aria-label={market.category}
    >
      <Shapes />
    </span>
  );
}
