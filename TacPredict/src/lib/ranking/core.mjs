/** Public finalized Base activity only. No auth profiles, wallet cash balances or reward points. */
const ZERO = "0x" + "0".repeat(40);
export const isWallet = (v) =>
  typeof v === "string" && /^0x[0-9a-f]{40}$/i.test(v) && v.toLowerCase() !== ZERO;
export function atoms(v) {
  if (typeof v === "number" && !Number.isSafeInteger(v)) throw Error("Unsafe amount");
  const s = String(v);
  if (!/^\d+$/.test(s)) throw Error("Invalid amount");
  return BigInt(s);
}
export function signedMoney(v) {
  if (v === null || v === undefined) return "—";
  const n = BigInt(v),
    a = n < 0n ? -n : n,
    c = a / 10000n;
  return (
    (n < 0n ? "−" : n > 0n ? "+" : "") +
    "$" +
    (c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    (c % 100n).toString().padStart(2, "0")
  );
}
export const unsignedMoney = (v) => signedMoney(v).replace(/^\+/, "");
export const traderName = (address) => "Trader-" + address.slice(2, 6) + address.slice(-4);
export function buildRanking({
  events,
  markets,
  tradeTimes,
  settledTimes,
  now = Date.now(),
  period = "30d",
}) {
  const cutoff =
    period === "all" ? -Infinity : now - ({ "1d": 1, "7d": 7, "30d": 30 }[period] ?? 30) * 86400000;
  const byId = new Map(markets.map((m) => [String(m.onchain_id), m])),
    tokenMap = new Map(),
    ledgers = new Map(),
    traders = new Map(),
    created = new Set(),
    weights = new Map();
  const ledger = (m, w) => {
    const key = m.id + ":" + w;
    if (!ledgers.has(key))
      ledgers.set(key, { m, w, cash: 0n, balances: new Map(), unknown: false });
    return ledgers.get(key);
  };
  const trader = (w) => {
    if (!traders.has(w))
      traders.set(w, {
        wallet: w,
        volume: 0n,
        markets: new Set(),
        pnl: 0n,
        settled: 0,
        unknown: false,
        activity: [],
      });
    return traders.get(w);
  };
  // Match ERC1155 movements to exact executions/mints/burns. Unexplained transfers invalidate cost basis.
  const allowed = new Map();
  const permit = (tx, from, to, token, amount) => {
    const k = [tx, from, to, token].join(":");
    allowed.set(k, (allowed.get(k) ?? 0n) + atoms(amount));
  };
  for (const e of events) {
    const p = e.payload,
      m = byId.get(String(p.marketId));
    if (e.event_name === "MarketCreated" && m) {
      created.add(m.id);
      p.tokenIds.forEach((id, i) => tokenMap.set(String(id), { m, i }));
    }
  }
  for (const e of events) {
    const p = e.payload,
      m = byId.get(String(p.marketId));
    if (!m) continue;
    if (e.event_name === "TradeExecuted") {
      const buyer = p.buyer.toLowerCase(),
        seller = p.seller.toLowerCase();
      const token = [...tokenMap].find(
        ([, v]) => v.m.id === m.id && v.i === Number(p.outcome),
      )?.[0];
      if (token) permit(e.tx_hash, seller, buyer, token, p.shares);
    }
    if (["PositionCreated", "CompleteSetMerged", "PositionRedeemed"].includes(e.event_name)) {
      const w = p.account.toLowerCase();
      for (const [token, v] of tokenMap)
        if (v.m.id === m.id)
          allowed.set(
            [
              e.tx_hash,
              e.event_name === "PositionCreated" ? ZERO : w,
              e.event_name === "PositionCreated" ? w : ZERO,
              token,
            ].join(":"),
            null,
          );
    }
  }
  const unique = new Set();
  for (const e of events) {
    const key = e.tx_hash + ":" + e.log_index;
    if (unique.has(key)) throw Error("Duplicate finalized event");
    unique.add(key);
    const p = e.payload,
      m = byId.get(String(p.marketId));
    if (e.event_name === "TransferSingle" || e.event_name === "TransferBatch") {
      const from = p.from.toLowerCase(),
        to = p.to.toLowerCase();
      if (from === to) continue;
      const ids = e.event_name === "TransferSingle" ? [p.id] : p.ids,
        values = e.event_name === "TransferSingle" ? [p.value] : p.values;
      if (ids.length !== values.length) throw Error("Invalid transfer");
      ids.forEach((id, j) => {
        const t = tokenMap.get(String(id));
        if (!t) return;
        const q = atoms(values[j]),
          k = [e.tx_hash, from, to, String(id)].join(":"),
          a = allowed.get(k),
          explained = allowed.has(k) && (a === null || a >= q);
        if (a !== null && a !== undefined && explained) allowed.set(k, a - q);
        for (const [w, delta] of [
          [from, -q],
          [to, q],
        ])
          if (isWallet(w)) {
            const l = ledger(t.m, w);
            l.balances.set(t.i, (l.balances.get(t.i) ?? 0n) + delta);
            if (l.balances.get(t.i) < 0n) throw Error("Incomplete indexed position history");
            if (!explained) l.unknown = true;
          }
      });
      continue;
    }
    if (!m) continue;
    if (e.event_name === "ResolutionFinalized") {
      const ws = p.weights.map(atoms);
      if (!ws.length || ws.reduce((a, b) => a + b, 0n) === 0n) throw Error("Invalid settlement");
      weights.set(m.id, ws);
    }
    if (["PositionCreated", "CompleteSetMerged", "PositionRedeemed"].includes(e.event_name)) {
      const w = p.account.toLowerCase();
      if (!isWallet(w)) throw Error("Invalid public wallet");
      ledger(m, w).cash += (e.event_name === "PositionCreated" ? -1n : 1n) * atoms(p.collateral);
    }
    if (e.event_name === "TradeExecuted") {
      const buyer = p.buyer.toLowerCase(),
        seller = p.seller.toLowerCase();
      if (!isWallet(buyer) || !isWallet(seller)) throw Error("Invalid trade wallet");
      const cost = atoms(p.usdcAmount);
      ledger(m, buyer).cash -= cost;
      ledger(m, seller).cash += cost;
      const time = tradeTimes[key];
      if (!time || !Number.isFinite(Date.parse(time))) throw Error("Missing finalized trade time");
      if (buyer === seller) {
        ledger(m, buyer).unknown = true;
        continue;
      }
      for (const [w, side] of [
        [buyer, "Buy"],
        [seller, "Sell"],
      ]) {
        const t = trader(w);
        if (Date.parse(time) >= cutoff && Date.parse(time) <= now) {
          t.volume += cost;
          t.markets.add(m.id);
          t.activity.push({
            id: key,
            marketId: m.market_id,
            title: m.title,
            side,
            amountAtomic: cost.toString(),
            timestamp: time,
            txHash: e.tx_hash,
            outcome: Number(p.outcome),
          });
        }
      }
    }
  }
  for (const l of ledgers.values()) {
    const time = settledTimes[l.m.id];
    if (!time || Date.parse(time) < cutoff || Date.parse(time) > now) continue;
    const t = trader(l.w),
      ws = weights.get(l.m.id);
    t.markets.add(l.m.id);
    if (!created.has(l.m.id) || l.unknown || !ws) {
      t.unknown = true;
      continue;
    }
    const denominator = ws.reduce((a, b) => a + b, 0n);
    let numerator = 0n;
    for (const [i, balance] of l.balances) {
      if (ws[i] === undefined) throw Error("Missing outcome");
      numerator += balance * ws[i];
    }
    t.pnl += l.cash + numerator / denominator;
    t.settled++;
  }
  const positionsByWallet = new Map();
  for (const l of ledgers.values()) {
    const list = positionsByWallet.get(l.w) ?? [];
    for (const [i, b] of l.balances)
      if (b > 0n && list.length < 100)
        list.push({
          marketId: l.m.market_id,
          title: l.m.title,
          outcome: i,
          sharesAtomic: b.toString(),
          settled: Boolean(settledTimes[l.m.id]),
        });
    positionsByWallet.set(l.w, list);
  }
  const rows = [...traders.values()]
    .filter((t) => t.volume > 0n || t.settled > 0 || t.unknown)
    .map((t) => ({
      wallet: t.wallet,
      name: traderName(t.wallet),
      volumeAtomic: t.volume.toString(),
      pnlAtomic: !t.unknown && t.settled > 0 ? t.pnl.toString() : null,
      markets: t.markets.size,
      settledMarkets: t.settled,
      rank: null,
      activity: t.activity
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, 50),
      positions: positionsByWallet.get(t.wallet) ?? [],
    }));
  rows.sort((a, b) => {
    if (a.pnlAtomic === null)
      return b.pnlAtomic === null
        ? BigInt(a.volumeAtomic) > BigInt(b.volumeAtomic)
          ? -1
          : BigInt(a.volumeAtomic) < BigInt(b.volumeAtomic)
            ? 1
            : a.wallet.localeCompare(b.wallet)
        : 1;
    if (b.pnlAtomic === null) return -1;
    const x = BigInt(a.pnlAtomic),
      y = BigInt(b.pnlAtomic);
    return x > y ? -1 : x < y ? 1 : a.wallet.localeCompare(b.wallet);
  });
  let previous,
    rank = 0;
  rows.forEach((t, i) => {
    if (t.pnlAtomic !== null) {
      const shownCents = (BigInt(t.pnlAtomic) / 10000n).toString();
      if (previous !== shownCents) rank = i + 1;
      t.rank = rank;
      previous = shownCents;
    }
  });
  return rows;
}
