/**
 * Where the Virtual USDC contract set lives on Base mainnet (tacpredict.fun).
 *
 * Source of truth: protocol/deployments/virtual-base-mainnet.json (a test keeps this file identical to it).
 * This set is separate from the six production contracts in verified-mainnet-contracts.ts and does not replace them.
 *
 * Read-only configuration: no key, no signer. The flags below stay false until the launch checks pass; a missing or
 * unreadable value is never shown as a zero.
 */

export const VIRTUAL_SET_CHAIN_ID = 8453;

export const VIRTUAL_SET_ADDRESSES = Object.freeze({
  usdc: "0xe595d15d0824705d26483c6FdABFa45693bb071e",
  registry: "0xCd98E90223C7E04ac7987A2fAb6a71Ba4aA6f013",
  oracle: "0x6A22091A157013eFb7bD2388A280573662Dd5b21",
  factory: "0xbf17837221F202CBFF642b8C049D6a4Cc1d031d8",
  positions: "0x4A2584bbB19fEf7df240e6d0787fd82d8175b554",
  exchange: "0xEc947763fEe77917218732A3dcffAE0e0A40409B",
  settlement: "0x27eB22dF79D5aa59759c4e15a49bA1f27147ddbF",
});

export const VIRTUAL_SET_ADMIN = "0x57828f1aa32fD6be3988F240068Df53ed94b7AeF";

/** Virtual USDC has 6 decimals, like the real one. */
export const VIRTUAL_USDC_DECIMALS = 6;

/**
 * Switches that decide what the app may do with the set. All off: the contracts are deployed and wired, but the
 * app must not offer onchain virtual trading until the keeper, indexer, quote endpoint and box granter are ready.
 */
export const VIRTUAL_SET_FLAGS = Object.freeze({
  /** The app may send onchain buy/sell/check-in transactions. */
  executionEnabled: false,
  /** Source is verified on Basescan (flip after the manual verification is done). */
  basescanVerified: true,
});

export const VIRTUAL_SET_EXPLORER = Object.freeze({
  address: (address) => `https://basescan.org/address/${address}`,
  code: (address) => `https://basescan.org/address/${address}#code`,
});

/** True when `address` is one of the seven contracts of this set (case-insensitive). */
export function isVirtualSetAddress(address) {
  if (typeof address !== "string") return false;
  const lower = address.toLowerCase();
  return Object.values(VIRTUAL_SET_ADDRESSES).some((a) => a.toLowerCase() === lower);
}

/** Why onchain virtual trading is not available yet; an empty list means every switch is on. */
export function virtualSetBlockers(flags = VIRTUAL_SET_FLAGS) {
  const blockers = [];
  if (!flags.executionEnabled) blockers.push("execution_disabled");
  if (!flags.basescanVerified) blockers.push("source_not_verified");
  return blockers;
}
