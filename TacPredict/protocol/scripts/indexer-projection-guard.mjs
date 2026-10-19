/** Review-only until merged/released. No signing; uses the indexer's existing privileged DB adapter.
 * Application preflight is NOT a substitute for an atomic database-side invariant.
 */
import { onchainMarketId, protocolChain } from "../../src/lib/protocol/market-identity.mjs";
const MAX = (1n << 256n) - 1n;
export const MARKET_BOUND_EVENTS = new Set([
  "MarketClosed",
  "ResolutionFinalized",
  "PositionCreated",
  "CompleteSetMerged",
  "PositionRedeemed",
  "OrderFilled",
  "TradeExecuted",
  "ResolutionProposed",
  "ResolutionDisputed",
  "DisputeFinalized",
  "MetadataPublished",
]);
const GLOBAL_EVENTS = new Set(["OrderCancelled", "NonceInvalidated", "BondWithdrawn"]);
function uint(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value) || BigInt(value) > MAX)
    throw Error("Invalid canonical event token ID");
  return value;
}
function marketRow(row, chain, id) {
  if (
    !row ||
    typeof row.id !== "string" ||
    !row.id ||
    row.chain_id !== chain ||
    onchainMarketId(row.onchain_id).toString() !== id
  )
    throw Error("Missing or mismatched market projection; halt before checkpoint");
}
async function requireMarket(db, chain, payload) {
  const id = onchainMarketId(payload.marketId).toString();
  const rows = await db(
    "protocol_markets",
    undefined,
    `?select=id,chain_id,onchain_id::text&chain_id=eq.${chain}&onchain_id=eq.${id}`,
  );
  if (!Array.isArray(rows) || rows.length !== 1)
    throw Error("Missing or ambiguous market projection; halt before checkpoint");
  marketRow(rows[0], chain, id);
}
async function requireTokens(db, chain, event, payload) {
  // The existing SQL intentionally records ERC1155 self-transfer no-ops without balance projection.
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(payload.from ?? "") ||
    !/^0x[0-9a-fA-F]{40}$/.test(payload.to ?? "")
  )
    throw Error("Invalid transfer addresses");
  if (payload.from.toLowerCase() === payload.to.toLowerCase()) return;
  let ids;
  if (event === "TransferSingle") {
    ids = [uint(payload.id)];
    uint(payload.value);
  } else {
    if (
      !Array.isArray(payload.ids) ||
      !Array.isArray(payload.values) ||
      payload.ids.length !== payload.values.length
    )
      throw Error("Invalid batch transfer arrays");
    ids = payload.ids.map(uint);
    payload.values.forEach(uint);
  }
  for (const token of new Set(ids)) {
    const rows = await db(
      "protocol_market_outcomes",
      undefined,
      `?select=market_uuid,token_id::text,protocol_markets!inner(id,chain_id,onchain_id::text)&token_id=eq.${token}&protocol_markets.chain_id=eq.${chain}`,
    );
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].token_id !== token)
      throw Error("Missing or ambiguous outcome projection; halt before checkpoint");
    const m = rows[0].protocol_markets;
    if (!m || rows[0].market_uuid !== m.id) throw Error("Outcome market projection mismatch");
    marketRow(m, chain, onchainMarketId(m.onchain_id).toString());
  }
}
export async function applyProjectedEvent(db, args) {
  const chain = protocolChain(args._chain),
    event = args._event,
    payload = args._payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw Error("Invalid event payload");
  if (event === "MarketCreated") onchainMarketId(payload.marketId);
  if (MARKET_BOUND_EVENTS.has(event)) await requireMarket(db, chain, payload);
  else if (event === "TransferSingle" || event === "TransferBatch")
    await requireTokens(db, chain, event, payload);
  else if (event !== "MarketCreated" && !GLOBAL_EVENTS.has(event))
    throw Error("Unsupported projection event");
  const applied = await db("rpc/apply_leased_protocol_event", args);
  if (typeof applied !== "boolean")
    throw Error("Invalid event acknowledgement; halt before checkpoint");
  // Creation legitimately has no pre-existing row. Verify AFTER true or duplicate-false acknowledgement.
  if (event === "MarketCreated") await requireMarket(db, chain, payload);
  return applied;
}
