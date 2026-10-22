import { SiteFooter } from "./site-footer";
import { Link, useLocation } from "@tanstack/react-router";
import { House, LineChart, Wallet, Gift, Trophy, Info } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { LoginButton } from "./login-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
const navItems = [
  { to: "/" as const, label: "Home", icon: House },
  { to: "/markets" as const, label: "Markets", icon: LineChart },
  { to: "/ranking" as const, label: "Ranking", icon: Trophy },
  { to: "/profile" as const, label: "Portfolio", icon: Wallet },
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = useLocation().pathname;
  const showSource = path === "/" || path.startsWith("/markets") || path === "/up-down";
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="app-header sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[3.75rem] max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="app-header-brand flex min-w-0 items-center gap-2.5"
            aria-label="TacPredict home"
          >
            <BrandMark className="size-9" />
            <span className="app-header-name text-base font-semibold tracking-tight">
              TacPredict
            </span>
          </Link>
          <nav className="ml-8 hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "bg-primary/10 text-primary" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="app-header-actions ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex">
              <span className="size-1.5 rounded-full bg-[#527dff]" />
              Base
            </span>
            <Link
              to="/rewards"
              aria-label="Your rewards"
              className="header-reward grid size-11 place-items-center rounded-full border border-border bg-card text-primary transition-colors hover:bg-primary/10"
            >
              <Gift className="size-[19px]" />
            </Link>
            <LoginButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 md:pt-8">
        {children}
        {showSource && (
          <footer className="mt-6 flex justify-center">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Market data information"
                  className="grid size-11 place-items-center rounded-full text-muted-foreground/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Info size={15} aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="rounded-2xl text-xs leading-5">
                <p className="font-semibold">Market data</p>
                <p className="mt-2">
                  Crypto spot data provided by{" "}
                  <a
                    href="https://www.coingecko.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    CoinGecko
                  </a>
                  . These reference prices are not prediction odds.
                </p>
                <p className="mt-2 text-muted-foreground">
                  Native volume and positions come from indexed TacPredict Base transactions.
                  Preview and discovered listings are not tradeable.
                </p>
              </PopoverContent>
            </Popover>
          </footer>
        )}
        <SiteFooter />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-glass px-2 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group ios-press flex min-h-[3.75rem] flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
                activeProps={{ className: "text-primary [&_.nav-icon]:bg-primary/10" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                <span className="nav-icon grid h-8 w-11 place-items-center rounded-xl">
                  <Icon className="size-5" strokeWidth={1.8} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
