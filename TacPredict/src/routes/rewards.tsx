import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { Check, Gift, Sparkles, Star, Zap } from "lucide-react";
import { CHECKIN_DAYS, formatCountdown, useDailyCheckin } from "@/lib/daily-checkin";
import { useLoginDialog } from "@/components/login-dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { Link } from "@tanstack/react-router";
import {
  isPriorityWallet,
  useWelcomeChest,
  type OnchainBoxResult,
} from "@/lib/rewards/welcome-chest";
import { UsdcCoin, WelcomeChestBox } from "@/components/rewards/welcome-chest";
import { usePaperLedger } from "@/lib/paper/ledger";
import { useTacPointsBalance } from "@/lib/tac-points";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import "@/styles/rewards-checkin.css";
import "@/styles/chest-open.css";
import "@/styles/rewards-v2.css";

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
            <UsdcCoin size={22} />
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
  const paper = usePaperLedger();
  const tac = useTacPointsBalance();
  const auth = useProtocolUser();
  const access = useWalletAccess("/rewards");
  const { ready, status, remaining, canClaim, claim, nextDay } = useDailyCheckin();
  const [opening, setOpening] = useState(false);
  const [burst, setBurst] = useState<number | null>(null);
  const [chestError, setChestError] = useState("");
  const isConnected = Boolean(wallet.address);
  /** Tradeable Virtual USDC = paper ledger (welcome box + check-in credits + trades). */
  const virtualUsdc = isConnected ? paper.balance : 0;
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
  const streak = status.data?.streak ?? 0;
  const claimedThrough = Math.min(streak, 7);
  const showCheckin = chest.opened && !opening && burst == null;

  function openChest() {
    // During a restore the wallet is about to reappear: do nothing rather
    // than open the connect modal for an already-connected wallet. login()
    // itself is also gated, so this is a second, belt-and-braces guard.
    if (wallet.restoring) return;
    if (!wallet.address) {
      login("/rewards");
      return;
    }
    if (chest.opened || opening) return;
    setOpening(true);
    setChestError("");
    if (chest.onchain) {
      // The box is granted on Base by the reward wallet; the animation plays while that transaction confirms.
      // A connected wallet that is not verified yet is verified first (one signature), then the box opens.
      const address = wallet.address;
      const started = Date.now();
      void (async () => {
        let res: OnchainBoxResult;
        const verified = auth.user ? ({ ok: true } as const) : await access.run();
        if (!verified.ok) {
          res = {
            ok: false,
            message: verified.message || "Verify your wallet to open the box, then tap it again",
          };
        } else {
          res = await chest.openOnchain(address);
        }
        const wait = Math.max(0, 1200 - (Date.now() - started));
        window.setTimeout(() => {
          if (res.ok) {
            if (res.amount !== null) setBurst(res.amount);
          } else {
            setChestError(res.message);
          }
          window.setTimeout(() => setOpening(false), res.ok ? 900 : 0);
        }, wait);
      })();
      return;
    }
    window.setTimeout(() => {
      const next = chest.open(wallet.address!);
      setBurst(next.amount);
      window.setTimeout(() => {
        setOpening(false);
      }, 900);
    }, 1200);
  }

  const revealAmount = burst ?? chest.amount;

  const tacText = wallet.restoring
    ? "Connecting…"
    : isConnected && auth.ready && !auth.user
      ? "Verify wallet"
      : isConnected
        ? tac.isPending
          ? "…"
          : tac.isError
            ? "Unavailable"
            : (tac.data?.balance.toLocaleString("en-US") ?? "—")
        : "0";

  return (
    <div className="tp-rewards rw" data-testid="rewards-page">
      <header className="rw-hero">
        <i className="rw-hero-orb" aria-hidden />
        <div className="rw-hero-top">
          <UsdcCoin size={22} />
          <span>Virtual USDC balance</span>
        </div>
        <strong className="rw-balance">
          $
          {!isConnected
            ? "0"
            : virtualUsdc.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
        </strong>
        <span className="rw-unit">
          {chest.onchain
            ? "Tradeable on Base · not withdrawable"
            : "Tradeable on paper · not withdrawable"}
        </span>
        <div className="rw-hero-stats">
          <div>
            <small>Streak</small>
            <b>
              <Zap size={14} aria-hidden /> {claimedThrough}/7
            </b>
          </div>
          <div>
            <small>TAC Points</small>
            <b>
              <Star size={14} aria-hidden /> {tacText}
            </b>
          </div>
          <Link to="/up-down" search={{ d: 5 }} className="rw-trade">
            Trade
          </Link>
        </div>
      </header>

      {!chest.opened || opening || burst != null ? (
        <section className="rw-card rw-chest" aria-labelledby="chest-title">
          <span className="rw-chip">
            <Gift size={13} aria-hidden /> One-time welcome
          </span>
          <h1 id="chest-title">Mystery reward box</h1>
          <p>
            Win <strong>$50–$500</strong> Virtual USDC instantly.
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
              className="rw-btn rw-btn-glow"
              onClick={openChest}
              disabled={opening || wallet.restoring}
            >
              {wallet.restoring
                ? "Connecting…"
                : !isConnected
                  ? "Connect wallet to open"
                  : opening
                    ? "Opening…"
                    : priority
                      ? "Open priority box"
                      : "Open box"}
            </button>
          ) : (
            <button type="button" className="rw-btn" onClick={() => setBurst(null)}>
              Continue to daily check-in
            </button>
          )}
          {chestError ? (
            <p className="rw-msg" role="alert">
              {chestError}
            </p>
          ) : null}
        </section>
      ) : null}

      {showCheckin ? (
        <>
          <section className="rw-won" aria-label="Welcome grant">
            <UsdcCoin size={34} />
            <div>
              <strong>+${chest.amount ?? 0}</strong>
              <span>Welcome box opened · Virtual USDC</span>
            </div>
            <Sparkles size={18} aria-hidden />
          </section>

          <section className="rw-card rw-checkin" aria-labelledby="checkin-title">
            <div className="rw-checkin-head">
              <div>
                <h1 id="checkin-title">Daily check-in</h1>
                <p>Come back every day · rewards grow to $80</p>
              </div>
              <span className="rw-ring" style={{ ["--p" as string]: claimedThrough / 7 }}>
                <b>{claimedThrough}</b>/7
              </span>
            </div>

            <ol className="rw-days">
              {CHECKIN_DAYS.map((amount, i) => {
                const day = i + 1;
                const done = day <= claimedThrough;
                const active = day === nextDay;
                return (
                  <li
                    key={day}
                    className={`${done ? "done" : active ? "active" : ""} ${day === 7 ? "big" : ""}`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="rw-day-label">Day {day}</span>
                    <span className="rw-day-icon">
                      {done ? (
                        <Check size={18} strokeWidth={3} />
                      ) : day === 7 ? (
                        <Gift size={22} />
                      ) : (
                        <UsdcCoin size={22} />
                      )}
                    </span>
                    <span className="rw-day-amt">${amount}</span>
                  </li>
                );
              })}
            </ol>

            {!ready || wallet.restoring ? (
              <button type="button" className="rw-btn" disabled>
                {wallet.restoring ? "Connecting…" : "…"}
              </button>
            ) : !isConnected ? (
              <button
                type="button"
                className="rw-btn rw-btn-glow"
                onClick={() => login("/rewards")}
              >
                Connect · Day 1 · $20
              </button>
            ) : canClaim ? (
              <button
                type="button"
                className="rw-btn rw-btn-glow"
                disabled={claim.isPending}
                onClick={() => claim.mutate()}
              >
                {claim.isPending
                  ? "Confirming…"
                  : `Claim Day ${nextDay} · $${status.data?.nextReward ?? 20}`}
              </button>
            ) : (
              <button type="button" className="rw-btn cool" disabled>
                Next reward in {formatCountdown(remaining)}
              </button>
            )}

            {claim.isError && (
              <p className="rw-msg" role="alert">
                {claim.error instanceof Error ? claim.error.message : "Claim failed"}
              </p>
            )}
            {claim.isSuccess && claim.data?.reward != null && (
              <p className="rw-msg ok" role="status">
                +${claim.data.reward} Virtual USDC
              </p>
            )}
          </section>
        </>
      ) : null}

      <section className="rw-card rw-tac" aria-labelledby="tac-title">
        <span className="rw-tac-icon" aria-hidden>
          <Star size={20} />
        </span>
        <div>
          <h2 id="tac-title">TAC Points</h2>
          <p>
            {wallet.restoring
              ? "Connecting…"
              : isConnected && auth.ready && !auth.user
                ? "Verify your wallet to see your TAC Points."
                : isConnected
                  ? tac.isError
                    ? "TAC Points unavailable right now — no estimate is shown."
                    : `Balance: ${tacText} TAC Points`
                  : "Connect a wallet to see your TAC Points."}
          </p>
          <small>Points only · No token promised.</small>
        </div>
      </section>
    </div>
  );
}
