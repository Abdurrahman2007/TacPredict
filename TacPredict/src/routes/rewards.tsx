import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  CHECKIN_DAYS,
  formatCountdown,
  useDailyCheckin,
} from "@/lib/daily-checkin";
import { useLoginDialog } from "@/components/login-dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { isPriorityWallet, useWelcomeChest } from "@/lib/rewards/welcome-chest";
import { WelcomeChestBox } from "@/components/rewards/welcome-chest";
import "@/styles/rewards-checkin.css";
import "@/styles/chest-open.css";

const USDC_LOGO =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png";

export const Route = createFileRoute("/rewards")({
  head: () => ({
    meta: [{ title: "Rewards — TacPredict" }],
  }),
  component: RewardsPage,
});

const subscribe = () => () => {};

function RewardsPage() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!hydrated) {
    return (
      <div className="tp-rewards" data-testid="rewards-page" aria-busy="true">
        <header className="tp-rewards-hero">
          <div className="tp-rewards-hero-top">
            <img src={USDC_LOGO} alt="" width={22} height={22} className="tp-usdc-logo" />
            <span>Virtual USDC</span>
          </div>
          <strong className="tp-rewards-balance">…</strong>
          <span className="tp-rewards-unit">rewards balance</span>
        </header>
      </div>
    );
  }
  return <RewardsClient />;
}

function RewardsClient() {
  const login = useLoginDialog();
  const wallet = useBaseWallet();
  const chest = useWelcomeChest();
  const { ready, status, remaining, canClaim, claim, nextDay } = useDailyCheckin();
  const [opening, setOpening] = useState(false);
  const [burst, setBurst] = useState<number | null>(null);
  const isConnected = Boolean(wallet.address);
  const priority = isPriorityWallet(
    typeof window !== "undefined"
      ? (window as { ethereum?: { isCoinbaseWallet?: boolean; isFarcaster?: boolean } }).ethereum
          ?.isCoinbaseWallet
        ? "coinbaseWalletSDK"
        : (window as { ethereum?: { isFarcaster?: boolean } }).ethereum?.isFarcaster
          ? "farcaster"
          : wallet.address
            ? "coinbaseWalletSDK"
            : null
      : null,
  );
  const balance = status.data?.balance;
  const streak = status.data?.streak ?? 0;
  const claimedThrough = Math.min(streak, 7);
  const showCheckin = chest.opened && !opening && burst == null;

  function openChest() {
    if (!wallet.address) {
      login("/rewards");
      return;
    }
    if (chest.opened || opening) return;
    setOpening(true);
    window.setTimeout(() => {
      const next = chest.open(wallet.address!);
      setBurst(next.amount);
      window.setTimeout(() => {
        setOpening(false);
      }, 900);
    }, 1200);
  }

  const revealAmount = burst ?? chest.amount;

  return (
    <div className="tp-rewards" data-testid="rewards-page">
      <header className="tp-rewards-hero">
        <div className="tp-rewards-hero-top">
          <img src={USDC_LOGO} alt="" width={22} height={22} className="tp-usdc-logo" />
          <span>Virtual USDC</span>
        </div>
        <strong className="tp-rewards-balance">
          {!isConnected
            ? "0"
            : status.isPending
              ? "…"
              : (balance ?? 0).toLocaleString("en-US")}
        </strong>
        <span className="tp-rewards-unit">rewards balance</span>
      </header>

      {!chest.opened || opening || burst != null ? (
        <section className="tp-chest" aria-labelledby="chest-title">
          <h1 id="chest-title">Welcome reward</h1>
          <p>
            Open once for a random <strong>$50–$500</strong> Virtual USDC grant. Trade Up/Down with
            it — not withdrawable. Coinbase Wallet + Farcaster get priority access.
          </p>
          <WelcomeChestBox
            opening={opening}
            amount={revealAmount}
            priority={Boolean(priority)}
            onOpen={openChest}
            disabled={opening || chest.opened}
          />
          {!chest.opened ? (
            <button
              type="button"
              className="tp-checkin-btn"
              onClick={openChest}
              disabled={opening}
            >
              {!isConnected
                ? "Connect Coinbase / Farcaster"
                : opening
                  ? "Opening box…"
                  : priority
                    ? "Open priority box"
                    : "Open reward box"}
            </button>
          ) : (
            <button
              type="button"
              className="tp-checkin-btn"
              onClick={() => setBurst(null)}
            >
              Continue to daily check-in
            </button>
          )}
        </section>
      ) : null}

      {showCheckin ? (
        <>
          <section className="tp-chest-won" aria-label="Welcome grant">
            <img src={USDC_LOGO} alt="" width={36} height={36} className="tp-usdc-logo" />
            <div>
              <strong>+${chest.amount ?? 0}</strong>
              <span>One-time welcome · Virtual USDC</span>
            </div>
            <Sparkles size={18} aria-hidden />
          </section>

          <section className="tp-checkin" aria-labelledby="checkin-title">
            <div className="tp-checkin-head">
              <h1 id="checkin-title">Daily check-in</h1>
              <span>{claimedThrough}/7</span>
            </div>
            <p className="tp-checkin-note">Day 1 $20 · then +$10 each day · 7-day ladder</p>

            <ol className="tp-checkin-days">
              {CHECKIN_DAYS.map((amount, i) => {
                const day = i + 1;
                const done = day <= claimedThrough;
                const active = day === nextDay;
                return (
                  <li
                    key={day}
                    className={done ? "done" : active ? "active" : undefined}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="tp-day-num">
                      {done ? <Check size={14} strokeWidth={2.5} /> : day}
                    </span>
                    <span className="tp-day-amt">
                      <img src={USDC_LOGO} alt="" width={12} height={12} />${amount}
                    </span>
                  </li>
                );
              })}
            </ol>

            {!ready ? (
              <button type="button" className="tp-checkin-btn" disabled>
                …
              </button>
            ) : !isConnected ? (
              <button type="button" className="tp-checkin-btn" onClick={() => login("/rewards")}>
                Connect · Day 1 · $20
              </button>
            ) : canClaim ? (
              <button
                type="button"
                className="tp-checkin-btn"
                disabled={claim.isPending}
                onClick={() => claim.mutate()}
              >
                {claim.isPending
                  ? "Confirming…"
                  : `Claim · Day ${nextDay} · $${status.data?.nextReward ?? 20}`}
              </button>
            ) : (
              <button type="button" className="tp-checkin-btn cool" disabled>
                Next in {formatCountdown(remaining)}
              </button>
            )}

            {claim.isError && (
              <p className="tp-checkin-msg" role="alert">
                {claim.error instanceof Error ? claim.error.message : "Claim failed"}
              </p>
            )}
            {claim.isSuccess && claim.data?.reward != null && (
              <p className="tp-checkin-msg ok" role="status">
                +${claim.data.reward} Virtual USDC
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
