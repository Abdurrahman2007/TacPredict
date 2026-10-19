import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLoginDialog } from "@/components/login-dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { BASE_NETWORK } from "@/lib/onchain/base";
import { poolPositionQueryOptions } from "@/lib/pool/pool.functions";
import type { PoolConfig, PoolRound } from "@/lib/pool/pool-types";
import { claimPoolRound, placePoolBet, refundMissedReading } from "@/lib/pool/pool-client";
import {
  canBet,
  formatUsdc,
  fromScaled,
  nextRoundStart,
  poolRules,
  poolShare,
  previewBet,
  roundPhase,
  roundStatus,
  unreportedRefundDue,
  usdcAtomic,
  type PoolAsset,
} from "@/lib/pool/pool.mjs";
import { ASSETS, durationLabel, formatCountdown, formatUsd } from "@/lib/updown/window.mjs";
import { UpDownIslandContent, type IslandContext } from "./island";
import "@/styles/prediction-detail.css";
import "@/styles/pool.css";

const EMPTY_ROUND: PoolRound = {
  up: "0",
  down: "0",
  feeBps: 0,
  state: 0,
  result: 0,
  startPrice: "0",
  endPrice: "0",
  startObservedAt: 0,
  endObservedAt: 0,
  claimOpensAt: 0,
};

type Common = {
  asset: PoolAsset;
  minutes: number;
  startMs: number;
  nowMs: number;
  config: PoolConfig;
  round: PoolRound | null;
};

/** Bar at the bottom of the page: bet while the round is open, otherwise point to the next round. */
export function PoolTradeBar({ context, ...c }: Common & { context: IslandContext }) {
  const [ready, setReady] = useState(false);
  const [navHeight, setNavHeight] = useState(80);
  const [side, setSide] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    setReady(true);
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const update = () => setNavHeight(nav?.getBoundingClientRect().height ?? 0);
    update();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (nav) ro?.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const phase = roundPhase(c.startMs, c.minutes, c.nowMs);
  const open = canBet(c.startMs, c.minutes, c.nowMs) && !c.config.paused;
  const round = c.round ?? EMPTY_ROUND;
  const feeBps = round.feeBps || c.config.feeBps;
  const multiple = (s: "up" | "down") =>
    previewBet({ up: round.up, down: round.down, feeBps, side: s, stake: 1_000_000n }).multiple;
  const next = phase === "betting" ? c.startMs : nextRoundStart(c.nowMs, c.minutes);
  if (!ready) return null;
  return createPortal(
    <>
      <div className="ud-bar" style={{ bottom: navHeight }} aria-label="Up or Down">
        {open ? (
          <div className="ud-bar-inner">
            {(["up", "down"] as const).map((s) => (
              <button type="button" key={s} data-side={s} onClick={() => setSide(s)}>
                {s === "up" ? "Up" : "Down"}
                {multiple(s) !== null ? ` ${multiple(s)!.toFixed(2)}x` : ""}
              </button>
            ))}
          </div>
        ) : (
          <div className="ud-bar-inner pool-bar-closed">
            {c.config.paused ? (
              <span>Betting is paused right now.</span>
            ) : (
              <>
                <span>
                  {phase === "live" ? "This round is live. Bets closed at the start." : "This round has ended."}
                </span>
                <Link
                  to="/up-down/$asset"
                  params={{ asset: ASSETS[c.asset].short.toLowerCase() }}
                  search={{ d: c.minutes, w: next }}
                  className="pool-bar-next"
                >
                  Bet on the next round · opens {formatCountdown(next - c.nowMs)}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <Dialog open={side !== null} onOpenChange={(o) => !o && setSide(null)}>
        <DialogContent className="pd-trade-screen ud-trade-screen translate-x-0 translate-y-0 lg:-translate-x-1/2">
          <DialogTitle className="sr-only">Bet on {context.label}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose Up or Down, enter a USDC amount and confirm in your wallet. Bets close when the round starts.
          </DialogDescription>
          <div className="pd-trade-top">
            <div className="pd-handle" />
            <div className="ud-island-inline">
              <UpDownIslandContent {...context} />
            </div>
            <DialogClose className="pd-close" aria-label="Close bet screen">
              <X size={18} />
            </DialogClose>
          </div>
          <div className="pd-trade-content">
            {side && <PoolBetPanel key={`${c.asset}-${c.minutes}-${c.startMs}`} {...c} initialSide={side} onDone={() => setSide(null)} />}
          </div>
        </DialogContent>
      </Dialog>
    </>,
    document.body,
  );
}

function PoolBetPanel({ asset, minutes, startMs, nowMs, config, round, initialSide, onDone }: Common & { initialSide: "up" | "down"; onDone: () => void }) {
  const wallet = useBaseWallet();
  const login = useLoginDialog();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [side, setSide] = useState(initialSide);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"" | "approve" | "bet">("");
  const [notice, setNotice] = useState("");
  const [hash, setHash] = useState("");
  const r = round ?? EMPTY_ROUND;
  const feeBps = r.feeBps || config.feeBps;
  const atomic = usdcAtomic(amount);
  const min = BigInt(config.minBet);
  const personalMax = BigInt(config.maxPerUser);
  const position = useQuery(poolPositionQueryOptions(asset, minutes, startMs, wallet.address));
  const held = BigInt(position.data?.up ?? "0") + BigInt(position.data?.down ?? "0");
  const room = personalMax > held ? personalMax - held : 0n;
  const open = canBet(startMs, minutes, nowMs) && !config.paused;
  const problem =
    atomic === null || atomic === 0n
      ? ""
      : atomic < min
        ? `Minimum bet is $${formatUsdc(min)}.`
        : atomic > room
          ? `Your limit for this round is $${formatUsdc(personalMax)}; you can add $${formatUsdc(room)} more.`
          : wallet.usdc !== null && atomic > wallet.usdc
            ? "That is more USDC than your wallet holds."
            : "";
  const valid = atomic !== null && atomic >= min && problem === "" && open;
  const preview = useMemo(
    () => (valid && atomic !== null ? previewBet({ up: r.up, down: r.down, feeBps, side, stake: atomic }) : null),
    [valid, atomic, r.up, r.down, feeBps, side],
  );
  const share = poolShare(r.up, r.down);
  async function submit() {
    if (!valid || atomic === null || !config.address || busy) return;
    setNotice("");
    setHash("");
    try {
      const tx = await placePoolBet(wallet, config.address as `0x${string}`, { asset, minutes, startMs }, side, atomic, (step) => setBusy(step));
      setHash(tx);
      setNotice("Bet confirmed on Base.");
      setAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pool-round"] }),
        queryClient.invalidateQueries({ queryKey: ["pool-position"] }),
        queryClient.invalidateQueries({ queryKey: ["pool-recent"] }),
        wallet.refresh(),
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The bet could not be placed.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="pool-bet" aria-label="Place a bet">
      <div className="pd-outcomes">
        {(["up", "down"] as const).map((s) => (
          <button type="button" key={s} data-tone={s === "up" ? "positive" : "negative"} aria-pressed={side === s} onClick={() => setSide(s)}>
            {s === "up" ? "Up" : "Down"}{" "}
            <span>${formatUsdc(s === "up" ? r.up : r.down)} in pool</span>
          </button>
        ))}
      </div>
      <div className="pd-amount-panel">
        <div className="pd-balance">
          <span>${wallet.usdc === null ? "0.00" : formatUsdc(wallet.usdc)}</span>
          <small>{wallet.address ? "Wallet USDC · Base" : "Connect a wallet to bet"}</small>
        </div>
        <label htmlFor={inputId} className="pd-amount-input">
          <span>$</span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Bet amount in USDC"
            value={amount}
            placeholder="0"
            style={{ width: `${Math.max(1, Math.min(12, amount.length || 1))}ch` }}
            onChange={(e) => /^\d{0,7}(\.\d{0,6})?$/.test(e.target.value) && setAmount(e.target.value)}
          />
        </label>
        <div className="pd-presets">
          {[1, 5, 10, 25].map((n) => (
            <button type="button" key={n} onClick={() => setAmount(String(n))}>
              ${n}
            </button>
          ))}
        </div>
      </div>
      {problem && <p role="alert" className="pool-problem">{problem}</p>}
      <dl className="pool-preview">
        <div>
          <dt>If {side === "up" ? "Up" : "Down"} wins you get</dt>
          <dd>{preview ? `$${formatUsdc(preview.payout)}` : "—"}</dd>
        </div>
        <div>
          <dt>Profit</dt>
          <dd>{preview && preview.opposed ? `+$${formatUsdc(preview.profit)}` : preview ? "Nobody on the other side yet" : "—"}</dd>
        </div>
      </dl>
      <p className="pool-note">
        The payout is your stake plus your share of the other side, after a {feeBps / 100}% fee taken from the losing side only. It changes as people bet until the round starts
        {share ? ` (pool now ${share.up.toFixed(0)}% Up / ${share.down.toFixed(0)}% Down)` : ""}. If nobody bets the other side, or the prices are equal, you are refunded in full.
      </p>
      {!wallet.address ? (
        <button type="button" className="pd-submit" onClick={() => login()}>
          Connect wallet
        </button>
      ) : wallet.chainId !== BASE_NETWORK.id ? (
        <button type="button" className="pd-submit" onClick={() => void wallet.switchToBase()}>
          Switch to Base
        </button>
      ) : (
        <button type="button" className="pd-submit" onClick={() => void submit()} disabled={!valid || busy !== ""}>
          {busy === "approve"
            ? "Approve USDC in your wallet…"
            : busy === "bet"
              ? "Confirm the bet in your wallet…"
              : !open
                ? "Bets are closed"
                : valid
                  ? `Bet $${amount} on ${side === "up" ? "Up" : "Down"}`
                  : "Enter an amount"}
        </button>
      )}
      <p className="pool-note">
        USDC stays in your wallet until you confirm. You approve only the exact amount of each bet.
      </p>
      {notice && (
        <p role="status" className="pool-notice">
          {notice}{" "}
          {hash && (
            <a href={`${BASE_NETWORK.explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
              View ↗
            </a>
          )}
        </p>
      )}
      {hash && (
        <button type="button" className="pool-done" onClick={onDone}>
          Done
        </button>
      )}
    </section>
  );
}

/** Pools, result, prices and the user's own position for one round. */
export function PoolRoundCard({ asset, minutes, startMs, nowMs, config, round }: Common) {
  const wallet = useBaseWallet();
  const queryClient = useQueryClient();
  const position = useQuery(poolPositionQueryOptions(asset, minutes, startMs, wallet.address));
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const r = round ?? EMPTY_ROUND;
  const nowSec = Math.floor(nowMs / 1000);
  const status = roundStatus(r, nowSec);
  const share = poolShare(r.up, r.down);
  const startSec = Math.floor(startMs / 1000);
  const missed = unreportedRefundDue(r, startSec, minutes, nowSec);
  const p = position.data;
  const mine = p ? BigInt(p.up) + BigInt(p.down) : 0n;
  const ref = { asset, minutes, startMs };
  async function run(label: string, job: () => Promise<string>, done: string) {
    if (!config.address || busy) return;
    setBusy(label);
    setNotice("");
    try {
      await job();
      setNotice(done);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pool-round"] }),
        queryClient.invalidateQueries({ queryKey: ["pool-position"] }),
        queryClient.invalidateQueries({ queryKey: ["pool-recent"] }),
        wallet.refresh(),
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The transaction could not be sent.");
    } finally {
      setBusy("");
    }
  }
  const price = (v: string) => (BigInt(v) > 0n ? formatUsd(fromScaled(v), asset) : null);
  return (
    <>
      <section className="ud-card pool-card" aria-label="Round pool">
        <h2>Round pool</h2>
        <div className="pool-split" role="img" aria-label={share ? `${share.up}% Up, ${share.down}% Down` : "No bets yet"}>
          <span className="pool-split-up" style={{ width: `${share ? share.up : 50}%` }} />
          <span className="pool-split-down" style={{ width: `${share ? share.down : 50}%` }} />
        </div>
        <div className="ud-row">
          <span className="ud-up">Up</span>
          <i />
          <b className="tabular-nums">${formatUsdc(r.up)}</b>
        </div>
        <div className="ud-row">
          <span className="ud-down">Down</span>
          <i />
          <b className="tabular-nums">${formatUsdc(r.down)}</b>
        </div>
        <div className="ud-row">
          <span>Status</span>
          <i />
          <span>{status.label}</span>
        </div>
        <div className="ud-row">
          <span>Price to beat · CoinGecko</span>
          <i />
          <span className="tabular-nums">{price(r.startPrice) ?? (roundPhase(startMs, minutes, nowMs) === "betting" ? "Set at the start" : "Waiting for the reading")}</span>
        </div>
        {price(r.endPrice) && (
          <div className="ud-row">
            <span>End price · CoinGecko</span>
            <i />
            <span className="tabular-nums">{price(r.endPrice)}</span>
          </div>
        )}
        <div className="ud-row">
          <span>Fee</span>
          <i />
          <span>{(r.feeBps || config.feeBps) / 100}% of the losing side</span>
        </div>
        {missed && (
          <div className="pool-action">
            <p>The price reading did not arrive in time, so every stake in this round can be refunded.</p>
            <button type="button" className="pool-btn" disabled={Boolean(busy) || !wallet.address} onClick={() => void run("refund", () => refundMissedReading(wallet, config.address as `0x${string}`, ref), "Refund started. Claim your stake below.")}>
              {busy === "refund" ? "Confirm in wallet…" : "Start the refund"}
            </button>
          </div>
        )}
      </section>
      <section className="ud-card pool-card" aria-label="Your position">
        <h2>Your position</h2>
        {!wallet.address ? (
          <p className="ud-muted">Connect your wallet to see your bets in this round.</p>
        ) : mine === 0n ? (
          <p className="ud-muted">You have no bet in this round.</p>
        ) : (
          <>
            {BigInt(p?.up ?? "0") > 0n && (
              <div className="ud-row">
                <span className="ud-up">Up</span>
                <i />
                <b className="tabular-nums">${formatUsdc(p!.up)}</b>
              </div>
            )}
            {BigInt(p?.down ?? "0") > 0n && (
              <div className="ud-row">
                <span className="ud-down">Down</span>
                <i />
                <b className="tabular-nums">${formatUsdc(p!.down)}</b>
              </div>
            )}
            {p?.claimed ? (
              <p className="ud-muted">Paid out.</p>
            ) : p && status.kind === "open" ? (
              <p className="ud-muted">Waiting for the round to finish.</p>
            ) : p && BigInt(p.payout) > 0n ? (
              <div className="pool-action">
                <p>
                  {p.refund ? "Refund" : "You won"} <b>${formatUsdc(p.payout)}</b>
                  {p.ready ? "" : " · opens shortly"}
                </p>
                <button type="button" className="pool-btn" disabled={!p.ready || Boolean(busy)} onClick={() => void run("claim", () => claimPoolRound(wallet, config.address as `0x${string}`, ref), p.refund ? "Refund paid to your wallet." : "Winnings paid to your wallet.")}>
                  {busy === "claim" ? "Confirm in wallet…" : p.refund ? "Claim refund" : "Claim winnings"}
                </button>
              </div>
            ) : (
              <p className="ud-muted">This position did not win.</p>
            )}
          </>
        )}
        {notice && (
          <p role="status" className="pool-notice">
            {notice}
          </p>
        )}
      </section>
    </>
  );
}

export function PoolRulesCard({ asset, minutes, feeBps }: { asset: PoolAsset; minutes: number; feeBps: number }) {
  return (
    <section className="ud-card ud-rules" aria-label="Rules summary">
      <h2>Rules · {ASSETS[asset].name} {durationLabel(minutes)}</h2>
      <ol className="pool-rules">
        {poolRules(asset, minutes, feeBps).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </section>
  );
}

/** Shown when no bets can be placed on this round. It never shows a made-up price. */
export function PoolOffBar({ message }: { message: string }) {
  const [ready, setReady] = useState(false);
  const [navHeight, setNavHeight] = useState(80);
  useEffect(() => {
    setReady(true);
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    setNavHeight(nav?.getBoundingClientRect().height ?? 0);
  }, []);
  if (!ready) return null;
  return createPortal(
    <div className="ud-bar" style={{ bottom: navHeight }} aria-label="Betting status">
      <div className="ud-bar-inner pool-bar-closed">
        <span>{message}</span>
      </div>
    </div>,
    document.body,
  );
}
