import { AccountProvider } from "./account-provider";
import { AccountMenu } from "./account-menu";
import { Link } from "@tanstack/react-router";
import { House, Gift, Wallet, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import "@/styles/ios-polish.css";
import { LoginButton } from "./login-dialog";
import { PortfolioNavLabel } from "./portfolio-nav-label";
/** Crypto-first shell: Markets list removed from nav; Rewards replaces that slot. */
const navItems = [
  { to: "/" as const, label: "Home", icon: House, portfolio: false },
  { to: "/rewards" as const, label: "Rewards", icon: Gift, portfolio: false },
  { to: "/ranking" as const, label: "Ranking", icon: Trophy, portfolio: false },
  { to: "/profile" as const, label: "Portfolio", icon: Wallet, portfolio: true },
];
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <ShellContent>{children}</ShellContent>
    </AccountProvider>
  );
}
function ShellContent({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="app-header hd-v2 sticky top-0 z-40 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="app-header-brand hd-brand group flex min-w-0 items-center gap-2.5"
            aria-label="TacPredict home"
          >
            <span className="hd-logo">
              <i className="hd-logo-halo" aria-hidden />
              <BrandMark className="size-10" />
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="app-header-name hd-name text-[17px] font-semibold tracking-tight">
                TacPredict
              </span>
              <span className="hd-live">
                <i aria-hidden />
                Live markets
              </span>
            </span>
          </Link>
          <nav
            className="ml-6 hidden items-center gap-0.5 rounded-full border border-border/60 bg-muted/30 p-1 lg:flex"
            aria-label="Main navigation"
          >
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{
                  className:
                    "rounded-full bg-background px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm shadow-black/20",
                }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="app-header-actions ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3">
            <LoginButton />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-12 md:pt-6">
        {children}
      </main>
      <footer className="tp-site-footer ft-v2" aria-label="Site information">
        <i className="ft-line" aria-hidden />
        <div className="ft-brand">
          <span className="ft-logo">
            <i className="ft-ring" aria-hidden />
            <i className="ft-ring ft-ring-2" aria-hidden />
            <BrandMark className="size-12" />
          </span>
          <strong>TacPredict</strong>
          <p>Predict crypto Up or Down in minutes.</p>
        </div>
        <nav className="ft-links" aria-label="Footer">
          <Link to="/">Home</Link>
          <Link to="/rewards">Rewards</Link>
          <Link to="/ranking">Ranking</Link>
          <Link to="/terms">Terms</Link>
          <a href="mailto:support@tacpredict.fun">Support</a>
        </nav>
        <p className="ft-base">
          <span className="ft-dot" aria-hidden />
          Built on Base · Virtual USDC · Not withdrawable
        </p>
        <p className="ft-copy">© {new Date().getUTCFullYear()} TacPredict</p>
      </footer>
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
                <span>{item.portfolio ? <PortfolioNavLabel /> : item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
