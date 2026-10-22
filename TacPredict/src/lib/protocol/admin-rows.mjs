/**
 * Pure helpers that turn the generic admin snapshot rows
 * ({ id, label, detail, usdcAtoms, observedAt }) into typed table rows.
 * Nothing here invents data: a missing field stays `null` and the UI shows it as unavailable.
 */

/** Value of the first line that starts with `key + " "`, or null. */
export function detailField(detail, key) {
  if (typeof detail !== "string") return null;
  const prefix = key + " ";
  for (const line of detail.split("\n")) {
    if (line.startsWith(prefix)) {
      const value = line.slice(prefix.length).trim();
      return value.length ? value : null;
    }
  }
  return null;
}

/** "12345678" atomic units -> "12.35" (default 2 places, truncated, never rounded up). */
export function atomicToDecimal(value, decimals = 6, places = 2) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!/^\d+$/.test(text)) return null;
  const unit = 10n ** BigInt(decimals);
  const n = BigInt(text);
  const whole = (n / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (places <= 0) return whole;
  const fraction = (n % unit).toString().padStart(decimals, "0").slice(0, places);
  return `${whole}.${fraction}`;
}

/** Atomic USDC price on the 1_000_000 scale -> cents, e.g. "620000" -> "62.00¢". */
export function priceToCents(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/^\d+$/.test(text)) return null;
  const n = BigInt(text);
  const cents = n / 10000n;
  const rest = ((n % 10000n) / 100n).toString().padStart(2, "0");
  return `${cents}.${rest}¢`;
}

export function shortHash(value, head = 6, tail = 4) {
  if (typeof value !== "string" || value.length <= head + tail + 1) return value ?? null;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const MARKET_STATUSES = [
  "DRAFT",
  "UPCOMING",
  "OPEN",
  "CLOSED",
  "RESOLVING",
  "RESOLVED",
  "SETTLED",
  "VOID",
  "CANCELLED",
];
export { MARKET_STATUSES };

/** Markets snapshot row -> { kind: "market" | "terms", ... } */
export function parseMarketRow(row) {
  if (String(row.id).startsWith("terms-")) {
    const title = String(row.label).replace(/^Prepared terms · /, "");
    return {
      kind: "terms",
      id: row.id,
      title,
      metadataHash: String(row.id).slice("terms-".length),
      createdAt: row.observedAt ?? null,
    };
  }
  const label = String(row.label);
  const split = label.indexOf(" · ");
  return {
    kind: "market",
    id: row.id,
    code: split === -1 ? label : label.slice(0, split),
    title: split === -1 ? label : label.slice(split + 3),
    status: detailField(row.detail, "Status"),
    onchainId: detailField(row.detail, "On-chain ID"),
    questionId: detailField(row.detail, "Question"),
    conditionId: detailField(row.detail, "Condition"),
    closeAt: detailField(row.detail, "Close"),
    liquidityAtomic: row.usdcAtoms ?? null,
    createdAt: row.observedAt ?? null,
  };
}

export function parseTradeRow(row) {
  const label = String(row.label);
  return {
    id: row.id,
    market: label.replace(/^Finalized trade · /, ""),
    outcomeIndex: detailField(row.detail, "Outcome"),
    sharesAtomic: detailField(row.detail, "Shares (atomic)"),
    priceAtomic: detailField(row.detail, "Price (atomic USDC)"),
    txHash: detailField(row.detail, "TX"),
    usdcAtomic: row.usdcAtoms ?? null,
    timestamp: row.observedAt ?? null,
  };
}

export function parseResolutionRow(row) {
  const label = String(row.label);
  const split = label.indexOf(" · ");
  return {
    id: row.id,
    market: split === -1 ? label : label.slice(0, split),
    status: split === -1 ? null : label.slice(split + 3),
    proposedOutcome: detailField(row.detail, "Outcome"),
    challengeDeadline: detailField(row.detail, "Challenge deadline"),
    evidenceHash: detailField(row.detail, "Evidence"),
    sourceHash: detailField(row.detail, "Source"),
    proposedAt: row.observedAt ?? null,
  };
}

const CONTRACT_KEYS = ["Registry", "Factory", "Positions", "Exchange", "Oracle", "Settlement"];

/** Blockchain snapshot -> { checkpoint, deployment } (each null when the row is absent). */
export function parseBlockchainRows(rows) {
  const checkpointRow = rows.find((r) => r.id === "checkpoint");
  const deploymentRow = rows.find((r) => r.id === "deployment");
  let checkpoint = null;
  if (checkpointRow) {
    const first = String(checkpointRow.detail).split("\n")[0]?.trim() ?? "";
    checkpoint = {
      block: /^\d+$/.test(first) ? first : null,
      blockHash: detailField(checkpointRow.detail, "Canonical hash"),
      updatedAt: checkpointRow.observedAt ?? null,
    };
  }
  let deployment = null;
  if (deploymentRow) {
    const contracts = [];
    for (const key of CONTRACT_KEYS) {
      const address = detailField(deploymentRow.detail, key);
      if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) contracts.push({ name: key, address });
    }
    const flag = /Database trading enabled: (true|false)/.exec(String(deploymentRow.detail));
    deployment = {
      contracts,
      databaseTradingEnabled: flag ? flag[1] === "true" : null,
      recordedAt: deploymentRow.observedAt ?? null,
    };
  }
  return { checkpoint, deployment };
}

export function countMarketsByStatus(markets) {
  const counts = Object.fromEntries(MARKET_STATUSES.map((s) => [s, 0]));
  for (const m of markets)
    if (m.kind === "market" && m.status && m.status in counts) counts[m.status] += 1;
  return counts;
}

/** Block lag between the live chain head and the indexed checkpoint; null if either is unknown. */
export function blockLag(head, checkpoint) {
  if (!/^\d+$/.test(String(head ?? "")) || !/^\d+$/.test(String(checkpoint ?? ""))) return null;
  const lag = BigInt(head) - BigInt(checkpoint);
  return lag < 0n ? 0n : lag;
}

export function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n % 86400 === 0) return `${n / 86400} day${n === 86400 ? "" : "s"}`;
  if (n % 3600 === 0) return `${n / 3600} hours`;
  if (n % 60 === 0) return `${n / 60} minutes`;
  return `${n} seconds`;
}

/** Postgres/ISO timestamp -> "2026-10-12 08:21 UTC" when the offset is zero, otherwise the raw text. */
export function formatTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]00(?::?00)?)?$/.exec(text);
  if (!match) return text;
  return match[3] ? `${match[1]} ${match[2]} UTC` : `${match[1]} ${match[2]}`;
}

export function createdMarketCount(nextId) {
  if (!/^\d+$/.test(String(nextId ?? "")) || BigInt(nextId) < 1n) return null;
  return (BigInt(nextId) - 1n).toString();
}
