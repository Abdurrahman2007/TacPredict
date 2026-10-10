import { NativePortfolio } from "@/components/native-portfolio";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { atomicDecimal } from "@/lib/protocol/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  Copy,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wallet,
  ArrowDownLeft,
  LockKeyhole,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { BASE_NETWORK, formatUsdc, shortAddress } from "@/lib/onchain/base";
import { LockedRewardCard } from "@/components/locked-reward-card";
import { ConnectWallet } from "@/components/connect-wallet";
import { AccountCard } from "@/components/account-card";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Portfolio — TacPredict" },
      {
        name: "description",
        content:
          "Your real Base USDC wallet, finalized positions and separate locked reward credit.",
      },
    ],
  }),
  component: PortfolioPage,
});
function PortfolioPage() {
  const wallet = useBaseWallet(),
    native = useNativePortfolio();
  const positions = native.data?.positions.filter((p) => p.chainId === 8453) ?? [];
  const known = Boolean(native.data?.walletLinked) && !native.isError;
  const claimable = known
    ? positions.reduce((n, p) => n + BigInt(p.claimableAtomic), 0n).toString()
    : null;
  const value =
    known && positions.every((p) => p.valueAtomic !== null)
      ? positions.reduce((n, p) => n + BigInt(p.valueAtomic!), 0n).toString()
      : null;
  const [tab, setTab] = useState("Positions"),
    [copied, setCopied] = useState(false),
    [notice, setNotice] = useState("");
  const connected = Boolean(wallet.address),
    onBase = wallet.chainId === BASE_NETWORK.id;
  async function copy() {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setNotice("Wallet address copied.");
    } catch {
      setNotice("Could not copy the address. Open the explorer to view it.");
    }
  }
  return (
    <div className="finance-page animate-enter" data-testid="portfolio-page">
      <header className="finance-page-header">
        <div>
          <p className="finance-eyebrow">YOUR USDC. YOUR POSITIONS.</p>
          <h1 className="page-title">Portfolio</h1>
        </div>
        <span className="finance-badge">
          <span className="size-1.5 rounded-full bg-[#527dff]" />
          Base · USDC
        </span>
      </header>
      <div className="finance-columns">
        <div className="min-w-0 space-y-5">
          <section className="finance-card finance-wallet-hero" aria-label="USDC wallet balance">
            <div className="flex justify-between items-center gap-3">
              <span className="finance-icon">
                <Wallet size={22} />
              </span>
              <button
                className="finance-icon-button"
                disabled={!connected || wallet.busy}
                onClick={() => void wallet.refresh()}
                aria-label="Refresh USDC balance"
              >
                <RefreshCw size={17} className={wallet.busy ? "motion-safe:animate-spin" : ""} />
              </button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Wallet balance</p>
            <p className="finance-balance mt-2" data-testid="wallet-balance">
              {connected && onBase && wallet.usdc !== null ? formatUsdc(wallet.usdc) : "—"}{" "}
              <span>USDC</span>
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {!connected
                ? "Connect a wallet to read your native Base USDC."
                : !onBase
                  ? "Switch to Base to read native USDC."
                  : wallet.error
                    ? "Balance unavailable. Retry the chain read."
                    : wallet.usdc === null
                      ? "Reading your wallet balance…"
                      : "USDC held in your wallet · read directly from Base."}
            </p>
            {!connected ? (
              <div className="mt-5">
                <ConnectWallet className="min-h-11 rounded-full" />
              </div>
            ) : !onBase ? (
              <button
                className="finance-pill finance-pill-primary mt-5"
                disabled={wallet.busy}
                onClick={() => void wallet.switchToBase()}
              >
                Switch to Base <ArrowRightIcon />
              </button>
            ) : null}
            {connected && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-background/30 p-3">
                <span className="font-mono text-xs">{shortAddress(wallet.address!)}</span>
                <div className="flex gap-1">
                  <button
                    className="finance-icon-button"
                    onClick={() => void copy()}
                    aria-label="Copy wallet address"
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button
                    className="finance-icon-button"
                    onClick={wallet.disconnect}
                    aria-label="Disconnect locally"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="finance-transfer" disabled>
                <ArrowDownLeft size={19} />
                <span>Deposit</span>
                <LockKeyhole size={13} />
              </button>
              <button className="finance-transfer" disabled>
                <ArrowUpRight size={19} />
                <span>Withdraw</span>
                <LockKeyhole size={13} />
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              Protocol funding and withdrawals are launch-pending. No funds move from this page.
            </p>
            <div className="mt-5 border-t border-white/10 pt-4 flex flex-wrap justify-between items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck size={13} />
                Self-custody
              </span>
              {wallet.address && (
                <a
                  className="inline-flex min-h-11 items-center gap-1 text-xs text-primary"
                  href={`${BASE_NETWORK.explorer}/address/${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on BaseScan
                  <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </section>
          <section className="grid grid-cols-2 gap-3" aria-label="Protocol summary">
            {[
              {
                title: "Position value",
                value: value,
                help: "Last settled trade · not cost basis",
              },
              { title: "Claimable USDC", value: claimable, help: "Finalized redemption amount" },
            ].map((s) => (
              <div className="finance-card !p-4 sm:!p-5" key={s.title}>
                <p className="text-xs text-muted-foreground">{s.title}</p>
                <p className="mt-3 break-all text-2xl font-semibold tabular-nums">
                  {s.value === null ? "—" : atomicDecimal(s.value)}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  {known ? s.help : "Verified wallet link required"}
                </p>
              </div>
            ))}
          </section>
          <section aria-label="Your market positions">
            <div className="flex items-center justify-between gap-3 border-b border-border">
              <div className="flex gap-5">
                {["Positions", "Activity"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={tab === item}
                    className={`min-h-12 ${tab === item ? "market-tab-active" : "market-tab"}`}
                    onClick={() => setTab(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <span className="finance-badge !px-2 !py-1">
                <Layers size={12} />
                {known ? positions.filter((p) => BigInt(p.sharesAtomic) > 0n).length : "—"}
              </span>
            </div>
            <NativePortfolio tab={tab} />
          </section>
        </div>
        <aside className="min-w-0 space-y-4">
          <LockedRewardCard />
          <section className="finance-card">
            <span className="finance-badge">
              <LockKeyhole size={12} />
              Launch pending
            </span>
            <h2 className="mt-4 text-base font-semibold">A real wallet. A careful launch.</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Wallet balances come from Base. Native prediction markets require a verified
              deployment before new funding or trading opens.
            </p>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Existing finalized winnings remain redeemable if new trading is paused. Claim
              availability is checked separately.
            </p>
            <Link to="/markets" className="finance-pill mt-5">
              Explore markets
              <ArrowUpRight size={15} />
            </Link>
          </section>
          <AccountCard />
        </aside>
      </div>
      {wallet.error && (
        <p role="alert" className="finance-inline-alert mt-4">
          {wallet.error}
        </p>
      )}
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={15} />;
}
