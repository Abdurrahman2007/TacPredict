/** Identity validation only. Never allocates an ID or proves creation/finality. */
const UINT256_MAX = (1n << 256n) - 1n;
export function protocolChain(chainId) {
  if (chainId !== 8453 && chainId !== 84532) throw Error("Unsupported protocol chain");
  return chainId;
}
export function onchainMarketId(value) {
  if (typeof value !== "string" && typeof value !== "bigint")
    throw Error("Market ID must be a decimal string or BigInt, never Number");
  const text = String(value);
  if (!/^[1-9]\d{0,77}$/.test(text)) throw Error("Invalid canonical on-chain market ID");
  const id = BigInt(text);
  if (id > UINT256_MAX) throw Error("Market ID exceeds uint256");
  return id;
}
export function publicMarketId(chainId, value) {
  return `TACP-${protocolChain(chainId)}-${onchainMarketId(value).toString().padStart(6, "0")}`;
}
export function displayMarketId(value) {
  return `TACP-${onchainMarketId(value).toString().padStart(6, "0")}`;
}
export function parsePublicMarketId(value, expectedChain) {
  if (typeof value !== "string") throw Error("Public market ID required");
  const match = /^TACP-(8453|84532)-(\d{6,78})$/.exec(value);
  if (!match) throw Error("Invalid chain-aware market ID");
  const chainId = match[1] === "8453" ? 8453 : 84532;
  if (expectedChain !== undefined && chainId !== protocolChain(expectedChain))
    throw Error("Market network mismatch");
  const id = onchainMarketId(BigInt(match[2]));
  if (publicMarketId(chainId, id) !== value) throw Error("Noncanonical public market ID");
  return { chainId, onchainId: id.toString(), marketId: value };
}
export function parseLegacyMarketId(value, explicitChain) {
  protocolChain(explicitChain);
  if (typeof value !== "string" || !/^TACP-\d{6,78}$/.test(value))
    throw Error("Invalid legacy market ID");
  const id = onchainMarketId(BigInt(value.slice(5)));
  if (displayMarketId(id) !== value) throw Error("Noncanonical legacy market ID");
  return parsePublicMarketId(publicMarketId(explicitChain, id), explicitChain);
}
export function assertMarketIdentity(market, expectedChain) {
  const parsed = parsePublicMarketId(market.marketId, expectedChain);
  if (
    protocolChain(market.chainId) !== parsed.chainId ||
    onchainMarketId(market.onchainId).toString() !== parsed.onchainId
  )
    throw Error("Market DB/on-chain identity mismatch");
  return parsed;
}
export function validMarketIdentity(market) {
  try {
    assertMarketIdentity(market);
    return true;
  } catch {
    return false;
  }
}
export function validPublicMarketId(value) {
  try {
    parsePublicMarketId(value);
    return true;
  } catch {
    return false;
  }
}
