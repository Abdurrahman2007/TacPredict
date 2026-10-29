import { useId, useMemo, useState } from "react";
import type { Market } from "@/domain/markets/types";
import { usePaperLedger } from "@/lib/paper/ledger";

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
  const id = useId();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  const outcome = market.outcomes.find((o) => o.id === selected) ?? market.outcomes[0];
  const priceCents =
    outcome && outcome.probabilityKnown !== false ? outcome.probability : null;
  const expired =
    Boolean(market.endsAt) && Number.isFinite(Date.parse(market.endsAt!))
      ? Date.now() >= Date.parse(market.endsAt!)
      : false;
  const usdc = Number(amount);
  /** Preview always uses typed amount, else default $5 so To win shows before any trade. */
  const previewUsdc = usdc > 0 ? usdc : 5;
  const previewShares =
    priceCents && previewUsdc > 0 ? previewUsdc / (priceCents / 100) : 0;
  const shares = priceCents && usdc > 0 ? usdc / (priceCents / 100) : 0;
  const toWin = shares > 0 ? shares : 0;
  const previewToWin = previewShares > 0 ? previewShares : 0;
  const openHere = useMemo(
    () => ledger.positions.filter((p) => p.marketId === market.id),
    [ledger.positions, market.id],
  );
  const sideOnOutcome = (label: string) => (/^up$/i.test(label) ? "Up" : "Down");

  function liveCentsFor(side: "Up" | "Down") {
    return (
      market.outcomes.find((o) =>
        side === "Up" ? /^up$/i.test(o.label) : /^down$/i.test(o.label),
      )?.probability ?? null
    );
  }

  function submitBuy() {
    if (!tradingAllowed) {
      setNotice(settlementNote ?? "Trading unavailable for this market");
      return;
    }
    if (expired) {
      setNotice("Market expired — trading closed");
      return;
    }
    if (!outcome || priceCents == null || !(usdc > 0)) {
      setNotice("Pick a side and amount");
      return;
    }
    const side = sideOnOutcome(outcome.label);
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
    const res = ledger.sell(positionId, liveCents);
    if (res.ok) {
      setNotice(`Sold · PnL ${money(res.pnl)}`);
    } else {
      setNotice(res.message);
    }
  }

  return (
    <section className="pd-order" aria-label="Paper Virtual USDC trade">
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
              <span>
                {o.probabilityKnown === false ? "—" : `${o.probability.toFixed(0)}¢`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mode === "buy" ? (
        <>
          <div className="pd-amount-panel">
            <div className="pd-balance">
              <span>${ledger.balance.toFixed(2)}</span>
              <small>Virtual USDC · paper ledger · not an on-chain tx · non-redeemable</small>
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
                disabled={!tradingAllowed || expired}
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
                  disabled={!tradingAllowed || expired}
                  onClick={() => setAmount(String(n))}
                >
                  ${n}
                </button>
              ))}
            </div>
          </div>
          {priceCents != null && previewShares > 0 ? (
            <dl className="tp-paper-pnl" aria-label="Order preview">
              <div>
                <dt>Avg</dt>
                <dd>{Math.round(priceCents)}¢</dd>
              </div>
              <div>
                <dt>Example</dt>
                <dd>${previewUsdc.toFixed(0)}</dd>
              </div>
              <div>
                <dt>To win</dt>
                <dd className="tp-pnl-pos">${previewToWin.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Profit if win</dt>
                <dd className="tp-pnl-pos">{money(previewToWin - previewUsdc)}</dd>
              </div>
            </dl>
          ) : null}
          <button
            type="button"
            className="pd-submit"
            disabled={
              !tradingAllowed ||
              expired ||
              !(usdc > 0) ||
              priceCents == null ||
              priceCents <= 0
            }
            onClick={submitBuy}
          >
            {!tradingAllowed ? "Unavailable" : expired ? "Expired" : "Trade"}
          </button>
          <p className="pd-order-note">
            {settlementNote ??
              "Share prices track live spot vs open. Virtual USDC only — no withdraw."}
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
                      disabled={!tradingAllowed || live == null}
                      onClick={() => live != null && submitSell(p.id, live)}
                    >
                      Sell {live != null ? `${Math.round(live)}¢` : ""}
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
