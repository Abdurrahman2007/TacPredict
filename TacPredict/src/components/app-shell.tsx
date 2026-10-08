import { Link } from "@tanstack/react-router";
import { House, LineChart, Wallet, Gift, Search } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { BrandIntro } from "./brand-intro";
import { LoginButton } from "./login-dialog";
const navItems = [
  { to: "/" as const, label: "Home", icon: House },
  { to: "/search" as const, label: "Search", icon: Search },
  { to: "/markets" as const, label: "Markets", icon: LineChart },
  { to: "/rewards" as const, label: "Rewards", icon: Gift },
  { to: "/profile" as const, label: "Portfolio", icon: Wallet },
];
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BrandIntro />
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="TacPredict home">
            <BrandMark className="size-10" />
            <span className="text-lg font-semibold tracking-tight">TacPredict</span>
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
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex">
              <span className="size-1.5 rounded-full bg-[#527dff]" />
              Base
            </span>
            <LoginButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 md:pt-8">
        {children}
        <footer className="mt-8 text-center text-xs text-muted-foreground">
          <a
            href="https://www.coingecko.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Price data provided by CoinGecko
          </a>
        </footer>
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-glass px-2 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
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
