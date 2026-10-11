import { Link, useRouterState } from "@tanstack/react-router";
import { Gift, House, LineChart, Search, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { BrandIntro } from "./brand-intro";
import { LoginButton } from "./login-dialog";

const bottomNav = [
  { to: "/" as const, label: "Home", icon: House },
  { to: "/search" as const, label: "Search", icon: Search },
  { to: "/markets" as const, label: "Markets", icon: LineChart },
  { to: "/profile" as const, label: "Portfolio", icon: Wallet },
];

const desktopNav = [
  { to: "/" as const, label: "Home" },
  { to: "/markets" as const, label: "Markets" },
  { to: "/search" as const, label: "Search" },
  { to: "/profile" as const, label: "Portfolio" },
];

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="size-8" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">TacPredict Admin</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Operations · not the public app
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/"
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Public site
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:py-8">{children}</main>
    </div>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BrandIntro />
      <header className="site-header sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6">
          <Link
            to="/"
            className="site-header-brand group flex min-w-0 items-center gap-2.5"
            aria-label="TacPredict home"
          >
            <BrandMark className="size-9 transition-transform duration-300 group-hover:scale-105 sm:size-10" />
            <span className="truncate text-base font-semibold tracking-tight sm:text-lg">
              TacPredict
            </span>
          </Link>

          <nav
            className="ml-4 hidden items-center gap-0.5 md:flex"
            aria-label="Main navigation"
          >
            {desktopNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="site-nav-link rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground"
                activeProps={{ className: "site-nav-link-active" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/rewards"
              aria-label="Rewards"
              className="site-header-icon group relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              activeProps={{ className: "text-primary bg-primary/10" }}
            >
              <Gift className="size-[1.15rem] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-6" />
              <span className="sr-only">Rewards</span>
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full border border-border/80 px-2.5 py-1 text-[11px] text-muted-foreground lg:inline-flex">
              <span className="size-1.5 animate-pulse rounded-full bg-[#527dff]" />
              Base
            </span>
            <LoginButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12 md:pt-7">
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
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-glass px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {bottomNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group ios-press flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors"
                activeProps={{ className: "text-primary [&_.nav-icon]:bg-primary/15" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                <span className="nav-icon grid h-8 w-11 place-items-center rounded-xl transition-transform duration-200 group-active:scale-95">
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin) return <AdminShell>{children}</AdminShell>;
  return <PublicShell>{children}</PublicShell>;
}
