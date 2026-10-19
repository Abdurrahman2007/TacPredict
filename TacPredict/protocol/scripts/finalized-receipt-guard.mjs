/** Pure, fail-closed validation. No RPC, database writes, wallet or signing dependencies.
 * A matching emitted event is evidence only for that event, NOT all calls in a bundle.
 */
const hash = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const address = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const data = (v) => typeof v === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(v);
const same = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const index = (v) => Number.isSafeInteger(v) && v >= 0;
function validLog(l) {
  return (
    l &&
    address(l.address) &&
    hash(l.blockHash) &&
    hash(l.transactionHash) &&
    typeof l.blockNumber === "bigint" &&
    l.blockNumber >= 0n &&
    index(l.transactionIndex) &&
    index(l.logIndex) &&
    l.removed === false &&
    data(l.data) &&
    Array.isArray(l.topics) &&
    l.topics.length >= 1 &&
    l.topics.length <= 4 &&
    l.topics.every(hash)
  );
}
export function assertCanonicalBlock(block, expectedNumber, finalizedNumber) {
  if (
    typeof expectedNumber !== "bigint" ||
    typeof finalizedNumber !== "bigint" ||
    expectedNumber < 0n ||
    expectedNumber > finalizedNumber ||
    block?.number !== expectedNumber ||
    !hash(block.hash)
  )
    throw Error("Invalid canonical finalized block");
  return true;
}
export function assertFinalizedEventReceipt(log, receipt, block, finalizedNumber) {
  if (!validLog(log)) throw Error("Invalid finalized event envelope");
  assertCanonicalBlock(block, log.blockNumber, finalizedNumber);
  if (
    !receipt ||
    receipt.status !== "success" ||
    !same(receipt.transactionHash, log.transactionHash) ||
    receipt.transactionIndex !== log.transactionIndex ||
    receipt.blockNumber !== log.blockNumber ||
    !same(receipt.blockHash, block.hash) ||
    !same(log.blockHash, block.hash) ||
    !Array.isArray(receipt.logs)
  )
    throw Error("Invalid finalized receipt envelope");
  const matches = receipt.logs.filter((l) => l.logIndex === log.logIndex);
  if (matches.length !== 1) throw Error("Missing or duplicate receipt event index");
  const l = matches[0];
  if (
    !validLog(l) ||
    l.blockNumber !== log.blockNumber ||
    l.transactionIndex !== log.transactionIndex ||
    !same(l.blockHash, log.blockHash) ||
    !same(l.transactionHash, log.transactionHash) ||
    !same(l.address, log.address) ||
    !same(l.data, log.data) ||
    l.topics.length !== log.topics.length ||
    l.topics.some((t, i) => !same(t, log.topics[i]))
  )
    throw Error("Receipt event identity/topics mismatch");
  return true;
}
