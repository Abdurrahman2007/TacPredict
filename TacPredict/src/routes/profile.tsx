import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Layers3,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wallet,
  ArrowDownLeft,
  Gift,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BASE_NETWORK, formatUsdc, shortAddress } from "@/lib/onchain/base";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Portfolio — TacPredict" },
      {
        name: "description",
        content: "Your Base wallet, native USDC balance and prediction portfolio.",
      },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const wallet = useBaseWallet();
  const [transfer, setTransfer] = useState<"Deposit" | "Withdraw" | null>(null);
  const [tab, setTab] = useState("Positions");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const onBase = wallet.chainId === BASE_NETWORK.id;
  const connected = Boolean(wallet.address);
  async function copy() {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setNotice("Wallet address copied.");
    } catch {
      setNotice("Could not copy the address. Use the explorer link to view it.");
    }
  }
  return (
    <div className="animate-enter mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Portfolio</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm">
          <span className="size-2 rounded-full bg-[#527dff]" />
          Base<span className="text-muted-foreground">/</span>USDC
        </div>
      </div>

      {connected && (
        <section
          className="onchain-wallet-bar mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
          aria-label="Wallet connection"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
              <Wallet className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {wallet.address ? shortAddress(wallet.address) : "Wallet not connected"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {connected
                  ? onBase
                    ? "Base mainnet · native USDC"
                    : "Connected to another network"
                  : "Connect to see your balance"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void copy()}
                  aria-label="Copy wallet address"
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={wallet.disconnect}
                  aria-label="Disconnect locally"
                >
                  <LogOut />
                </Button>
              </>
            ) : null}
          </div>
        </section>
      )}

      {connected && !onBase && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"
        >
          <p className="text-sm text-amber-200">Switch to Base to read native USDC.</p>
          <Button
            variant="outline"
            disabled={wallet.busy}
            onClick={() => void wallet.switchToBase()}
          >
            Switch to Base
          </Button>
        </div>
      )}

      <div className="mt-4 grid gap-4 ">
        <section
          className="onchain-balance-card rounded-2xl border border-border p-5 sm:p-6"
          aria-label="USDC wallet balance"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-[.12em] text-muted-foreground">
              AVAILABLE USDC
            </p>
            <Button
              variant="ghost"
              size="icon"
              disabled={!connected || wallet.busy}
              onClick={() => void wallet.refresh()}
              aria-label="Refresh USDC balance"
            >
              <RefreshCw className={wallet.busy ? "motion-safe:animate-spin" : ""} />
            </Button>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <p className="min-w-0 break-all text-4xl font-semibold tracking-tight tabular-nums">
              {!connected
                ? "0"
                : !onBase
                  ? "Switch network"
                  : wallet.usdc === null
                    ? wallet.error
                      ? "Unavailable"
                      : "Loading…"
                    : formatUsdc(wallet.usdc)}
            </p>
            <span className="text-base font-medium text-muted-foreground">USDC</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 rounded-xl"
              onClick={() => setTransfer("Deposit")}
            >
              <ArrowDownLeft />
              Deposit
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl"
              onClick={() => setTransfer("Withdraw")}
            >
              <ArrowUpRight />
              Withdraw
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Transfers unavailable</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Self-custody · read-only
            </span>
            {wallet.address && (
              <a
                href={`${BASE_NETWORK.explorer}/address/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
              >
                View wallet
                <ArrowUpRight className="size-4" />
              </a>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">USDC in markets</p>
          <p className="mt-3 text-2xl font-semibold">0</p>
          <p className="mt-2 text-xs text-muted-foreground">Preview · Not connected</p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Claimable winnings</p>
          <p className="mt-3 text-2xl font-semibold">0</p>
          <p className="mt-2 text-xs text-muted-foreground">Preview · Not connected</p>
        </section>
      </div>

      <Link
        to="/rewards"
        className="ios-press mt-4 flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5"
      >
        <span className="flex items-center gap-3">
          <Gift className="size-5 text-primary" />
          <span>
            <span className="block font-semibold">Rewards</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Virtual points · 24h rewards
            </span>
          </span>
        </span>
        <ArrowUpRight className="size-5 shrink-0" />
      </Link>
      <Dialog
        open={transfer !== null}
        onOpenChange={(open) => {
          if (!open) setTransfer(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{transfer} USDC</DialogTitle>
            <DialogDescription>Base mainnet · native USDC · preview only</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-primary/5 p-4">
            <ShieldCheck className="mb-3 size-6 text-primary" />
            <p className="font-semibold">No funds move from this screen.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Market funding and withdrawals need the audited prediction contracts and transaction
              flow. They are not configured yet. Do not send funds to an app deposit address.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Your connected wallet remains self-custodial. This app does not sign, approve, or
            transfer tokens.
          </p>
          <Button className="h-12" disabled>
            {transfer} unavailable — contracts pending
          </Button>
        </DialogContent>
      </Dialog>
      <section className="mt-7">
        <div className="flex gap-6 border-b border-border" aria-label="Portfolio views">
          {["Positions", "Activity"].map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={tab === item}
              className={tab === item ? "market-tab-active min-h-11" : "market-tab min-h-11"}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-8 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-secondary text-primary">
            <Layers3 className="size-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold">
            {tab === "Activity" ? "No activity yet" : "No positions yet"}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {connected
              ? "Position indexer pending."
              : "Connect a wallet. Trading contracts pending."}
          </p>
          {tab === "Activity" && wallet.address && (
            <a
              href={`${BASE_NETWORK.explorer}/address/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              Open Basescan
              <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </section>
      {wallet.error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/25 p-4 text-sm text-destructive"
        >
          {wallet.error}
        </p>
      )}
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
