import { useEffect, useId, useMemo, useState } from "react";
import type { Market } from "@/domain/markets/types";
import { useLoginDialog } from "@/components/login-dialog";
import { usePaperLedger } from "@/lib/paper/ledger";
import { sharesToAtomic } from "@/lib/virtual-set/trade-plan.mjs";
import { executeOnchainTrade } from "@/lib/virtual-set/wallet-trade";
import { useOnchainWindow, useOptionalWallet, useRefreshOnchain } from "@/lib/virtual-set/use-onchain";

/** Short button text for a window that cannot take a trade yet (reason comes from the server). */
function waitLabel(reason: string | null, loading: boolean, canRetry: boolean) {
  if (loading) return "Loading…";
  if (reason === "not_open") return "Opens soon";
  if (reason === "closing" || reason === "ended") return "Closed";
  // Retry can revive a failed create/stock while the window still has time left.
  if (canRetry && (reason === "market_failed" || reason === "not_ready" || reason === "not_created" || reason === "no_market" || reason === "preparing" || !reason))
    return "Tap to retry setup";
  if (reason === "market_failed") return "Unavailable";
  if (reason === "not_ready") return "Stocking market…";
  if (reason === "not_created" || reason === "no_market" || reason === "preparing")
    return "Preparing market…";
  return "Preparing market…";
}

function money(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** World-style paper trade sheet — Buy/Sell · Up/Down ¢ · amount · To win / PnL. */
export function PaperAmountCard({
  market,
  selected,
  onSelect,
  tradingAllowed = true,
  settlementNote,
}: {
  market: Market;
  selected?: string | undefined;
  onSelect: (id: string) => void;
  /** False when asset/window is unavailable for paper trading. */
  tradingAllowed?: boolean;
  settlementNote?: string;
}) {
  const ledger = usePaperLedger();
  const wallet = useOptionalWallet();
  const openLogin = useLoginDialog();
  const onchain = useOnchainWindow(market.id);
  const refreshChain = useRefreshOnchain();
  // On-chain mode: the 5 and 15 minute windows trade real Virtual USDC on Base from the user's own wallet.
  const chainMode = onchain.enabled;
  const chainBlocked = chainMode && !onchain.supported;
  const needsWallet = chainMode && onchain.supported && !wallet?.address;
  const waiting = chainMode && onchain.supported && !onchain.ready;
  const windowLoading = chainMode && onchain.supported && Boolean(onchain.loading);
  const [busy, setBusy] = useState(false);
  const [prepStuck, setPrepStuck] = useState(false);
  const id = useId();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");

  // After a few seconds of preparing, let the user tap to nudge setup instead of a dead button.
  useEffect(() => {
    if (!waiting) {
      setPrepStuck(false);
      return;
    }
    const timer = window.setTimeout(() => setPrepStuck(true), 6_000);
    return () => window.clearTimeout(timer);
  }, [waiting, market.id]);

  // Kick create/stock as soon as the sheet opens — don't wait for the user to discover retry.
  useEffect(() => {
    if (!chainMode || !onchain.supported || onchain.ready) return;
    const reason = onchain.reason;
    if (reason === "not_open" || reason === "closing" || reason === "ended" || reason === "market_failed")
      return;
    let cancelled = false;
    void (async () => {
      try {
        await onchain.prepare();
      } catch {
        /* poll + retry button still cover this */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when the window id changes; prepare itself updates readiness via refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot per market window
  }, [chainMode, onchain.supported, market.id]);
  const outcome = market.outcomes.find((o) => o.id === selected) ?? market.outcomes[0];
  const priceCents = outcome && outcome.probabilityKnown !== false ? outcome.probability : null;
  const expired =
    Boolean(market.endsAt) && Number.isFinite(Date.parse(market.endsAt!))
      ? Date.now() >= Date.parse(market.endsAt!)
      : false;
  const usdc = Number(amount);
  // Preview follows the typed amount and the live share price only — no example amount.
  const shares = priceCents && usdc > 0 ? usdc / (priceCents / 100) : 0;
  const toWin = shares > 0 ? shares : 0;
  const profit = shares > 0 ? toWin - usdc : 0;
  const profitPct = shares > 0 && usdc > 0 ? (profit / usdc) * 100 : 0;
  const openHere = useMemo(
    () => ledger.positions.filter((p) => p.marketId === market.id),
    [ledger.positions, market.id],
  );
  const sideOnOutcome = (label: string) => (/^up$/i.test(label) ? "Up" : "Down");

  function liveCentsFor(side: "Up" | "Down") {
    return (
      market.outcomes.find((o) => (side === "Up" ? /^up$/i.test(o.label) : /^down$/i.test(o.label)))
        ?.probability ?? null
    );
  }

  async function submitChainBuy(side: "Up" | "Down") {
    if (!wallet?.address) {
      openLogin();
      return;
    }
    if (!wallet.provider) {
      setNotice("Wallet is not ready — reconnect it and try again");
      return;
    }
    setBusy(true);
    setNotice("");
    const res = await executeOnchainTrade({
      provider: wallet.provider,
      address: wallet.address,
      chainId: wallet.chainId,
      switchToBase: wallet.switchToBase,
      key: market.id,
      outcome: side === "Up" ? 0 : 1,
      side: "buy",
      amount: usdc.toFixed(2),
      shownCents: priceCents,
      onStatus: setNotice,
    });
    if (res.ok) {
      setNotice(`Bought ${res.shares.toFixed(2)} ${side} at ${res.priceCents}¢ · to win $${res.shares.toFixed(2)}`);
      setAmount("");
      setMode("sell");
      await refreshChain();
    } else {
      setNotice(res.message);
    }
    setBusy(false);
  }

  async function submitChainSell(positionId: string, liveCents: number) {
    const position = ledger.positions.find((p) => p.id === positionId);
    const atomic = position ? sharesToAtomic(position.shares) : null;
    if (!position || atomic === null) {
      setNotice("Position not found");
      return;
    }
    if (!wallet?.address) {
      openLogin();
      return;
    }
    if (!wallet.provider) {
      setNotice("Wallet is not ready — reconnect it and try again");
      return;
    }
    setBusy(true);
    setNotice("");
    const res = await executeOnchainTrade({
      provider: wallet.provider,
      address: wallet.address,
      chainId: wallet.chainId,
      switchToBase: wallet.switchToBase,
      key: market.id,
      outcome: position.side === "Up" ? 0 : 1,
      side: "sell",
      sharesAtomic: atomic,
      shownCents: liveCents,
      onStatus: setNotice,
    });
    if (res.ok) {
      const pnl = res.usdc - position.shares * position.avgCost;
      setNotice(`Sold at ${res.priceCents}¢ · PnL ${money(pnl)}`);
      await refreshChain();
    } else {
      setNotice(res.message);
    }
    setBusy(false);
  }

  async function submitBuy() {
    if (!tradingAllowed) {
      setNotice(settlementNote ?? "Trading unavailable for this market");
      return;
    }
    if (chainBlocked) {
      setNotice("This window length is coming soon on chain — try 5 or 15 min");
      return;
    }
    if (needsWallet) {
      openLogin();
      return;
    }
    if (expired) {
      setNotice("Market expired — trading closed");
      return;
    }
    if (waiting) {
      setBusy(true);
      setNotice("Setting up market on Base…");
      try {
        const prepared = await onchain.prepare();
        if (!prepared?.ready) {
          setNotice(
            prepared?.reason === "closing" || prepared?.reason === "ended"
              ? "This window just closed — open the next one"
              : "Market still setting up — try again in a few seconds",
          );
          setBusy(false);
          return;
        }
      } catch {
        setNotice("Could not prepare this window — try again");
        setBusy(false);
        return;
      }
      setBusy(false);
      setNotice("");
    }
    if (!outcome || priceCents == null || !(usdc > 0)) {
      setNotice("Pick a side and amount");
      return;
    }
    const side = sideOnOutcome(outcome.label);
    if (chainMode) {
      await submitChainBuy(side);
      return;
    }
    const res = ledger.buy({
      marketId: market.id,
      title: market.title,
      side,
      usdc,
      priceCents,
    });
    if (res.ok) {
      setNotice(`Bought ${shares.toFixed(2)} ${side} · to win $${toWin.toFixed(2)}`);
      setAmount("");
      setMode("sell");
    } else {
      setNotice(res.message);
    }
  }

  function submitSell(positionId: string, liveCents: number) {
    if (!tradingAllowed) {
      setNotice(settlementNote ?? "Trading unavailable for this market");
      return;
    }
    if (chainMode) {
      void submitChainSell(positionId, liveCents);
      return;
    }
    const res = ledger.sell(positionId, liveCents);
    if (res.ok) {
      setNotice(`Sold · PnL ${money(res.pnl)}`);
    } else {
      setNotice(res.message);
    }
  }

  return (
    <section className="pd-order" aria-label={chainMode ? "Virtual USDC trade on Base" : "Paper Virtual USDC trade"}>
      <div className="pd-order-controls">
        <div className="pd-mode" aria-label="Order direction">
          {(["buy", "sell"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setAmount("");
                setNotice("");
              }}
            >
              {m === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="pd-order-outcomes">
          {market.outcomes.map((o) => (
            <button
              type="button"
              key={o.id}
              data-tone={
                /^(yes|up)$/i.test(o.label)
                  ? "positive"
                  : /^(no|down)$/i.test(o.label)
                    ? "negative"
                    : "neutral"
              }
              title="Share price in Virtual USDC cents"
              aria-pressed={selected === o.id || (!selected && o.id === outcome?.id)}
              onClick={() => onSelect(o.id)}
            >
              {o.label}{" "}
              <span>{o.probabilityKnown === false ? "—" : `${o.probability.toFixed(0)}¢`}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "buy" ? (
        <>
          <div className="pd-amount-panel">
            <div className="pd-balance">
              <span>${ledger.balance.toFixed(2)}</span>
              <small>
                {chainMode ? "Virtual USDC · on-chain · non-redeemable" : "Virtual USDC · paper · non-redeemable"}
              </small>
            </div>
            <label htmlFor={id} className="pd-amount-input">
              <span>$</span>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label="Buy amount in Virtual USDC"
                value={amount}
                placeholder="0"
                disabled={!tradingAllowed || expired || chainBlocked || busy}
                style={{ width: `${Math.max(1, Math.min(12, amount.length || 1))}ch` }}
                onChange={(e) => {
                  if (/^\d{0,10}(\.\d{0,2})?$/.test(e.target.value)) setAmount(e.target.value);
                }}
              />
            </label>
            <div className="pd-presets">
              {[5, 50, 100].map((n) => (
                <button
                  type="button"
                  key={n}
                  disabled={!tradingAllowed || expired || chainBlocked || busy}
                  onClick={() => setAmount(String(n))}
                >
                  ${n}
                </button>
              ))}
              <button
                type="button"
                disabled={!tradingAllowed || expired || chainBlocked || busy || !(ledger.balance > 0)}
                onClick={() => setAmount(String(Math.floor(ledger.balance * 100) / 100))}
              >
                Max
              </button>
            </div>
          </div>
          <dl
            className="tp-paper-pnl tp-paper-pnl-v2"
            aria-label="Order preview"
            aria-live="polite"
          >
            <div>
              <dt>Avg price</dt>
              <dd>{priceCents != null ? `${Math.round(priceCents)}¢` : "—"}</dd>
            </div>
            <div>
              <dt>Shares</dt>
              <dd>{shares > 0 ? shares.toFixed(2) : "—"}</dd>
            </div>
            <div>
              <dt>To win</dt>
              <dd className={shares > 0 ? "tp-pnl-pos" : undefined}>
                {shares > 0 ? `$${toWin.toFixed(2)}` : "—"}
              </dd>
            </div>
            <div>
              <dt>Profit if win</dt>
              <dd className={shares > 0 ? "tp-pnl-pos" : undefined}>
                {shares > 0 ? (
                  <>
                    {money(profit)} <small>+{profitPct.toFixed(0)}%</small>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="pd-submit"
            disabled={
              busy ||
              !tradingAllowed ||
              chainBlocked ||
              expired ||
              (needsWallet
                ? false
                : waiting
                  ? false
                  : !(usdc > 0) ||
                    usdc > ledger.balance ||
                    priceCents == null ||
                    priceCents <= 0)
            }
            onClick={() => void submitBuy()}
          >
            {busy
              ? notice.startsWith("Setting up")
                ? "Setting up…"
                : "Confirm in wallet…"
              : !tradingAllowed
                ? "Unavailable"
                : chainBlocked
                  ? "Coming soon"
                  : expired
                    ? "Expired"
                    : waiting
                      ? waitLabel(onchain.reason, windowLoading, prepStuck)
                      : needsWallet
                        ? "Connect wallet"
                        : usdc > ledger.balance
                          ? "Insufficient balance"
                          : outcome
                            ? `Buy ${outcome.label}${usdc > 0 ? ` · $${usdc.toFixed(2)}` : ""}`
                            : "Trade"}
          </button>
          <p className="pd-order-note">
            {chainMode && waiting
              ? onchain.reason === "market_failed"
                ? "This window could not open on Base — wait for the next 5 or 15 min window, or tap retry."
                : onchain.reason === "not_open"
                  ? "Window opens at the start time — Buy unlocks automatically."
                  : prepStuck
                    ? "Still setting up — tap the button to retry. Wallet confirm opens once the market is ready."
                    : "Setting up this window on Base — Buy unlocks when inventory is ready."
              : chainMode
                ? "Base trade · gas sponsored when your wallet supports it · Virtual USDC only — no withdraw."
                : (settlementNote ??
                  "Share prices track live spot vs open. Virtual USDC only — no withdraw.")}
          </p>
        </>
      ) : (
        <div className="pd-amount-panel">
          <div className="pd-balance">
            <span>${ledger.balance.toFixed(2)}</span>
            <small>Open positions · realized {money(ledger.realizedPnl)}</small>
          </div>
          {openHere.length === 0 ? (
            <>
              <div className="pd-amount-input" aria-hidden="true">
                <span>0</span>
              </div>
              <p className="pd-contracts">Contracts</p>
            </>
          ) : (
            <ul className="tp-paper-pos">
              {openHere.map((p) => {
                const live = liveCentsFor(p.side);
                const mark = live != null ? p.shares * (live / 100) : null;
                const cost = p.shares * p.avgCost;
                const uPnL = mark != null ? mark - cost : null;
                return (
                  <li key={p.id}>
                    <span>
                      <strong>
                        {p.side} · {p.shares.toFixed(2)}
                      </strong>
                      <small>
                        avg {(p.avgCost * 100).toFixed(0)}¢
                        {live != null ? ` · now ${Math.round(live)}¢` : ""}
                        {uPnL != null ? (
                          <>
                            {" · "}
                            <span className={uPnL >= 0 ? "tp-pnl-pos" : "tp-pnl-neg"}>
                              PnL {money(uPnL)}
                            </span>
                          </>
                        ) : null}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="pd-submit"
                      style={{ width: "auto", minHeight: 40, margin: 0, padding: "0 16px" }}
                      disabled={
                        busy ||
                        (chainMode && (!onchain.supported || waiting || !wallet?.provider))
                      }
                      onClick={() => {
                        const cents =
                          live ??
                          Math.max(1, Math.min(99, Math.round(p.avgCost * 100)));
                        submitSell(p.id, cents);
                      }}
                    >
                      Sell{" "}
                      {Math.round(live ?? Math.max(1, Math.min(99, p.avgCost * 100)))}¢
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {notice ? (
        <p role="status" className="pd-order-notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
