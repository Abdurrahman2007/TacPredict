import { NativePortfolio } from "@/components/native-portfolio";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { atomicDecimal } from "@/lib/protocol/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  ShieldCheck,
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
    [hidden, setHidden] = useState(false),
    [notice, setNotice] = useState("");
  const connected = Boolean(wallet.address),
    onBase = wallet.chainId === BASE_NETWORK.id;
  const balanceLabel =
    connected && onBase && wallet.usdc !== null ? formatUsdc(wallet.usdc) : "—";

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
    <div className="portfolio-page animate-enter" data-testid="portfolio-page">
      <section className="portfolio-hero" aria-label="Portfolio overview">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Portfolio</span>
              {wallet.address ? (
                <button
                  type="button"
                  className="rounded-md p-1 hover:bg-white/5"
                  onClick={() => void copy()}
                  aria-label="Copy wallet address"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {hidden ? "••••" : balanceLabel}
                {!hidden && balanceLabel !== "—" ? (
                  <span className="ml-2 text-lg font-medium text-muted-foreground">USDC</span>
                ) : null}
              </p>
              <button
                type="button"
                className="rounded-full p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                aria-label={hidden ? "Show balance" : "Hide balance"}
                onClick={() => setHidden((v) => !v)}
              >
                {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {!connected
                ? "Connect a wallet to read native Base USDC."
                : !onBase
                  ? "Switch to Base to read native USDC."
                  : "Wallet balance · read directly from Base"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Available to trade</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {hidden ? "••••" : claimable === null ? "—" : `${atomicDecimal(claimable)} USDC`}
            </p>
            <Link
              to="/rewards"
              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#3d6bff]/15 px-3 text-xs font-medium text-[#8fb0ff]"
            >
              <LockKeyhole size={12} />
              Rewards
            </Link>
          </div>
        </div>

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
            Switch to Base <ArrowUpRight size={15} />
          </button>
        ) : null}

        {connected && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-card/40 px-3 py-2.5">
            <span className="font-mono text-xs">{shortAddress(wallet.address!)}</span>
            <div className="flex gap-1">
              <button
                className="finance-icon-button"
                disabled={wallet.busy}
                onClick={() => void wallet.refresh()}
                aria-label="Refresh USDC balance"
              >
                <RefreshCw size={15} className={wallet.busy ? "motion-safe:animate-spin" : ""} />
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
          <button type="button" className="portfolio-action portfolio-action-primary" disabled>
            <ArrowDownLeft size={18} />
            Deposit
            <LockKeyhole size={12} className="opacity-70" />
          </button>
          <button type="button" className="portfolio-action" disabled>
            <ArrowUpRight size={18} />
            Withdraw
            <LockKeyhole size={12} className="opacity-70" />
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Deposit/withdraw stay locked until protocol funding is reviewed. No funds move here.
        </p>
      </section>

      <section className="portfolio-card mt-4" aria-label="Position summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Position value</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {value === null ? "—" : `${atomicDecimal(value)} USDC`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {known ? "Last settled trade · not cost basis" : "Verified wallet link required"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Claimable</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {claimable === null ? "—" : `${atomicDecimal(claimable)} USDC`}
            </p>
          </div>
        </div>
        <div className="portfolio-spark mt-4" aria-hidden="true" />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Your market positions">
          <div className="flex items-center justify-between gap-3">
            <div className="portfolio-tabs flex gap-1 rounded-xl bg-card/60 p-1">
              {["Positions", "Activity"].map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={tab === item}
                  className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors ${tab === item ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
          <div className="mt-3">
            <NativePortfolio tab={tab} />
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <LockedRewardCard />
          <section className="finance-card">
            <span className="finance-badge">
              <ShieldCheck size={12} />
              Self-custody
            </span>
            <h2 className="mt-4 text-base font-semibold">A real wallet. A careful launch.</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Wallet balances come from Base. Native markets need a verified deployment before new
              trading opens.
            </p>
            {wallet.address ? (
              <a
                className="finance-pill mt-5"
                href={`${BASE_NETWORK.explorer}/address/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on BaseScan
                <ArrowUpRight size={15} />
              </a>
            ) : (
              <Link to="/markets" className="finance-pill mt-5">
                Explore markets
                <ArrowUpRight size={15} />
              </Link>
            )}
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
