/** OFFLINE, report-only V1 projection reconciliation. No RPC/DB/signing/repair path.
 * Supplied canonical-log coverage is an INPUT ASSERTION, not independently proven chain truth.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const MAX = (1n << 256n) - 1n,
  ZERO = "0x" + "0".repeat(40);
const EVENTS = new Set([
  "MarketCreated",
  "MarketClosed",
  "ResolutionFinalized",
  "TransferSingle",
  "TransferBatch",
  "PositionCreated",
  "CompleteSetMerged",
  "PositionRedeemed",
  "OrderFilled",
  "OrderCancelled",
  "NonceInvalidated",
  "TradeExecuted",
  "ResolutionProposed",
  "ResolutionDisputed",
  "DisputeFinalized",
  "BondWithdrawn",
  "MetadataPublished",
]);
const GLOBAL = new Set(["OrderCancelled", "NonceInvalidated", "BondWithdrawn"]);
function uint(s) {
  if (typeof s !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(s) || BigInt(s) > MAX)
    throw Error("Expected decimal atomic string");
  return BigInt(s);
}
function address(s) {
  if (typeof s !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(s)) throw Error("Invalid address");
  return s.toLowerCase();
}
function hash(s) {
  if (typeof s !== "string" || !/^0x[0-9a-f]{64}$/.test(s)) throw Error("Invalid hash");
  return s;
}
function stable(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stable).join(",") + "]";
  return (
    "{" +
    Object.keys(x)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stable(x[k]))
      .join(",") +
    "}"
  );
}
function text(s) {
  if (typeof s !== "string" || !s || s.length > 128) throw Error("Invalid identifier");
  return s;
}
function eventKey(e) {
  hash(e.txHash);
  if (!Number.isSafeInteger(e.logIndex) || e.logIndex < 0) throw Error("Invalid log index");
  return e.txHash + ":" + e.logIndex;
}
export function reconcileProjectionSnapshot(s) {
  if (
    !s ||
    s.schemaVersion !== "tacpredict-projection-reconciliation-v1" ||
    ![8453, 84532].includes(s.chainId) ||
    s.exchangeVersion !== 1
  )
    throw Error("Unsupported snapshot schema/chain/version");
  const end = uint(s.checkpoint?.blockNumber);
  hash(s.checkpoint?.blockHash);
  const start = uint(s.deploymentBlock);
  if (
    start > end ||
    s.coverage?.fromBlock !== s.deploymentBlock ||
    s.coverage?.throughBlock !== s.checkpoint.blockNumber ||
    s.coverage?.includesAllCanonicalProtocolLogs !== true ||
    s.coverage?.includesAllProjectionRows !== true
  )
    throw Error("Complete deployment-to-checkpoint coverage must be supplied");
  for (const name of [
    "canonicalEvents",
    "chainEvents",
    "markets",
    "outcomes",
    "trades",
    "claims",
    "refunds",
    "positions",
  ])
    if (!Array.isArray(s[name]) || s[name].length > 100000)
      throw Error("Required bounded snapshot arrays missing");
  const counts = {},
    details = [];
  let issueCount = 0;
  const issue = (code, key) => {
    issueCount++;
    counts[code] = (counts[code] || 0) + 1;
    if (details.length < 200)
      details.push({
        code,
        scopeHash: createHash("sha256")
          .update(String(s.chainId) + ":" + key)
          .digest("hex"),
      });
  };
  const index = (rows, key, code) => {
    const m = new Map();
    for (const row of rows) {
      const k = key(row);
      if (m.has(k)) issue(code, k);
      else m.set(k, row);
    }
    return m;
  };
  const blockHashes = new Map();
  function checkedEvent(e) {
    const key = eventKey(e),
      block = uint(e.blockNumber);
    hash(e.blockHash);
    if (block === end && e.blockHash !== s.checkpoint.blockHash)
      issue("CHECKPOINT_BLOCK_HASH_MISMATCH", key);
    const priorHash = blockHashes.get(e.blockNumber);
    if (priorHash && priorHash !== e.blockHash) issue("INCONSISTENT_BLOCK_HASH", key);
    else blockHashes.set(e.blockNumber, e.blockHash);
    address(e.contractAddress);
    if (block < start || block > end) issue("EVENT_OUTSIDE_COVERAGE", key);
    if (e.chainId !== undefined && e.chainId !== s.chainId) issue("WRONG_CHAIN_EVENT", key);
    if (!EVENTS.has(e.eventName)) issue("UNSUPPORTED_FINANCIAL_EVENT", key);
    if (!e.payload || typeof e.payload !== "object" || Array.isArray(e.payload))
      throw Error("Invalid canonical payload");
    return key;
  }
  const canonical = index(s.canonicalEvents, checkedEvent, "DUPLICATE_CANONICAL_EVENT"),
    raw = index(s.chainEvents, checkedEvent, "DUPLICATE_RAW_EVENT");
  for (const [k, e] of canonical) {
    const r = raw.get(k);
    if (!r) issue("MISSING_RAW_EVENT", k);
    else if (
      stable([e.blockNumber, e.blockHash, address(e.contractAddress), e.eventName, e.payload]) !==
      stable([r.blockNumber, r.blockHash, address(r.contractAddress), r.eventName, r.payload])
    )
      issue("CANONICAL_EVENT_MISMATCH", k);
  }
  for (const k of raw.keys()) if (!canonical.has(k)) issue("EXTRA_RAW_EVENT", k);
  const marketById = index(
    s.markets,
    (m) => {
      if (m.chainId !== s.chainId) issue("WRONG_CHAIN_MARKET", text(m.uuid));
      if (uint(m.onchainId) === 0n) throw Error("Zero market ID");
      return m.onchainId;
    },
    "DUPLICATE_MARKET_ID",
  );
  const marketByUuid = index(s.markets, (m) => text(m.uuid), "DUPLICATE_MARKET_UUID");
  const tokenMap = index(
    s.outcomes,
    (o) => {
      uint(o.tokenId);
      if (!Number.isSafeInteger(o.outcomeIndex) || o.outcomeIndex < 0 || o.outcomeIndex > 7)
        throw Error("Invalid outcome index");
      if (!marketByUuid.has(o.marketUuid)) issue("ORPHAN_OUTCOME", o.tokenId);
      return o.tokenId;
    },
    "AMBIGUOUS_OUTCOME_TOKEN",
  );
  const outcomeIndex = index(
    s.outcomes,
    (o) => o.marketUuid + ":" + o.outcomeIndex,
    "DUPLICATE_OUTCOME_INDEX",
  );
  const projections = {
    TradeExecuted: index(s.trades, eventKey, "DUPLICATE_TRADE_PROJECTION"),
    claim: index(s.claims, eventKey, "DUPLICATE_CLAIM_PROJECTION"),
    refund: index(s.refunds, eventKey, "DUPLICATE_REFUND_PROJECTION"),
  };
  const expectedSets = { TradeExecuted: new Set(), claim: new Set(), refund: new Set() },
    created = new Set(),
    oi = new Map(),
    volume = new Map(),
    balances = new Map();
  const add = (m, k, n) => m.set(k, (m.get(k) || 0n) + n);
  const ordered = [...canonical.values()].sort((a, b) => {
    const x = uint(a.blockNumber),
      y = uint(b.blockNumber);
    return x < y ? -1 : x > y ? 1 : a.logIndex - b.logIndex;
  });
  for (const e of ordered) {
    const k = eventKey(e),
      p = e.payload;
    if (!EVENTS.has(e.eventName)) continue;
    if (e.eventName === "TransferSingle" || e.eventName === "TransferBatch") {
      const from = address(p.from),
        to = address(p.to);
      if (from === to) continue;
      const ids = e.eventName === "TransferSingle" ? [p.id] : p.ids,
        values = e.eventName === "TransferSingle" ? [p.value] : p.values;
      if (!Array.isArray(ids) || !Array.isArray(values) || ids.length !== values.length)
        throw Error("Invalid transfer arrays");
      for (let i = 0; i < ids.length; i++) {
        uint(ids[i]);
        const n = uint(values[i]),
          o = tokenMap.get(ids[i]);
        if (!o) {
          issue("UNMAPPED_CANONICAL_TOKEN", k);
          continue;
        }
        for (const [who, delta] of [
          [from, -n],
          [to, n],
        ])
          if (who !== ZERO) {
            const bk = o.marketUuid + ":" + o.outcomeIndex + ":" + who;
            add(balances, bk, delta);
            if (balances.get(bk) < 0n) issue("NEGATIVE_CANONICAL_POSITION", k);
          }
      }
      continue;
    }
    if (GLOBAL.has(e.eventName)) continue;
    if (uint(p.marketId) === 0n) throw Error("Zero event market ID");
    const m = marketById.get(p.marketId);
    if (!m) {
      issue("MISSING_MARKET_PROJECTION", k);
      continue;
    }
    if (e.eventName === "MarketCreated") {
      if (created.has(p.marketId)) issue("DUPLICATE_MARKET_CREATION", k);
      created.add(p.marketId);
      for (const f of ["questionId", "conditionId", "metadataHash", "rulesHash", "sourceHash"])
        if (hash(p[f]) !== hash(m[f])) issue("MARKET_IDENTITY_MISMATCH", k);
      if (
        !Number.isInteger(p.outcomeCount) ||
        p.outcomeCount < 2 ||
        p.outcomeCount > 8 ||
        m.outcomeCount !== p.outcomeCount ||
        !Array.isArray(p.tokenIds) ||
        p.tokenIds.length !== p.outcomeCount
      )
        issue("MARKET_OUTCOME_COUNT_MISMATCH", k);
      for (let i = 0; i < p.outcomeCount; i++) {
        uint(p.tokenIds[i]);
        if (outcomeIndex.get(m.uuid + ":" + i)?.tokenId !== p.tokenIds[i])
          issue("MARKET_TOKEN_MAPPING_MISMATCH", k);
      }
    } else if (e.eventName === "PositionCreated") add(oi, m.uuid, uint(p.collateral));
    else if (e.eventName === "CompleteSetMerged" || e.eventName === "PositionRedeemed") {
      const n = uint(p.collateral);
      add(oi, m.uuid, -n);
      if (e.eventName === "PositionRedeemed") {
        if (typeof p.voided !== "boolean") throw Error("Invalid VOID flag");
        const type = p.voided ? "refund" : "claim";
        expectedSets[type].add(k);
        const r = projections[type].get(k);
        if (!r) issue("MISSING_" + type.toUpperCase() + "_PROJECTION", k);
        else if (
          r.chainId !== s.chainId ||
          r.marketUuid !== m.uuid ||
          uint(r.amountAtomic) !== n ||
          address(r.walletAddress) !== address(p.account)
        )
          issue("REDEMPTION_PROJECTION_MISMATCH", k);
      }
    } else if (e.eventName === "TradeExecuted") {
      const notional = uint(p.usdcAmount),
        shares = uint(p.shares),
        price = uint(p.price);
      if (notional === 0n || shares === 0n || price === 0n || price >= 1000000n)
        throw Error("Invalid execution amounts");
      expectedSets.TradeExecuted.add(k);
      add(volume, m.uuid, notional);
      const r = projections.TradeExecuted.get(k);
      if (!r) issue("MISSING_TRADE_PROJECTION", k);
      else if (
        r.chainId !== s.chainId ||
        r.marketUuid !== m.uuid ||
        r.outcomeIndex !== p.outcome ||
        uint(r.priceAtomic) !== price ||
        uint(r.sharesAtomic) !== shares ||
        uint(r.usdcAtomic) !== notional ||
        address(r.buyer) !== address(p.buyer) ||
        address(r.seller) !== address(p.seller) ||
        r.buyOrderId !== p.buyOrderId ||
        r.sellOrderId !== p.sellOrderId
      )
        issue("TRADE_PROJECTION_MISMATCH", k);
    }
  }
  for (const [type, rows] of Object.entries(projections))
    for (const k of rows.keys())
      if (!expectedSets[type].has(k)) issue("ORPHAN_" + type.toUpperCase() + "_PROJECTION", k);
  for (const m of s.markets) {
    if (!created.has(m.onchainId)) issue("MARKET_WITHOUT_CANONICAL_CREATION", m.uuid);
    if ((oi.get(m.uuid) || 0n) < 0n) issue("NEGATIVE_CANONICAL_COLLATERAL", m.uuid);
    if (uint(m.openInterestAtomic) !== (oi.get(m.uuid) || 0n))
      issue("COLLATERAL_PROJECTION_MISMATCH", m.uuid);
    if (uint(m.volumeAtomic) !== (volume.get(m.uuid) || 0n))
      issue("VOLUME_PROJECTION_MISMATCH", m.uuid);
  }
  const positions = index(
    s.positions,
    (p) => {
      uint(p.sharesAtomic);
      address(p.walletAddress);
      return p.marketUuid + ":" + p.outcomeIndex + ":" + address(p.walletAddress);
    },
    "DUPLICATE_POSITION",
  );
  for (const [k, n] of balances)
    if (n !== 0n && !positions.has(k)) issue("MISSING_POSITION_PROJECTION", k);
  for (const [k, p] of positions) {
    if (!marketByUuid.has(p.marketUuid) || !outcomeIndex.has(p.marketUuid + ":" + p.outcomeIndex))
      issue("ORPHAN_POSITION", k);
    if (uint(p.sharesAtomic) !== (balances.get(k) || 0n)) issue("POSITION_BALANCE_MISMATCH", k);
  }
  return {
    schemaVersion: "tacpredict-projection-reconciliation-report-v1",
    chainId: s.chainId,
    checkpoint: { blockNumber: s.checkpoint.blockNumber, blockHash: s.checkpoint.blockHash },
    mode: "OFFLINE_REPORT_ONLY",
    canonicalCoverageIndependentlyVerified: false,
    launchAuthorized: false,
    verdict: issueCount ? "DISCREPANCIES_FOUND" : "NO_DISCREPANCIES_IN_SUPPLIED_SNAPSHOT",
    issueCount,
    counts,
    details,
    detailsTruncated: issueCount > details.length,
    notCovered: [
      "independent canonical receipt/block verification",
      "Oracle bond/claim liability and contract balances",
      "FeeExchangeV2 or UpDownPool",
      "legal ownership or treasury surplus",
      "metadata source truth and wallet ownership proof",
      "later privileged projection corruption",
    ],
    repairInstructionsGenerated: false,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--snapshot" || args[2] !== "--report")
      throw Error("Usage: --snapshot local.json --report report.json");
    if ((await stat(args[1])).size > 20 * 1024 * 1024)
      throw Error("Snapshot exceeds offline bound");
    const s = JSON.parse(await readFile(args[1], "utf8"));
    const report = reconcileProjectionSnapshot(s);
    await writeFile(args[3], JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(
      JSON.stringify({
        verdict: report.verdict,
        issueCount: report.issueCount,
        launchAuthorized: false,
      }),
    );
    process.exitCode = report.issueCount ? 2 : 0;
  } catch {
    console.error(
      "Reconciliation failed closed: invalid/incomplete local snapshot; no repair performed.",
    );
    process.exitCode = 1;
  }
}
