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
  usdc: "0x21b3932c2D8FC7178cC5Ea1083e98877211FD196",
  registry: "0x49D7015ABddEBA550F6138f4ccF914B417237C0D",
  oracle: "0x99bcc662cd9716Ce4bd66571f12A8B07295FcF3F",
  factory: "0x35bBCe6fc02F565bccBe0FF5290B96770D3f5903",
  positions: "0xF2973A60903b8E58098A144b07105f2A45dF6156",
  exchange: "0x716345BE42D1Ac79232721d3f4E37B9F4bBF48cB",
  settlement: "0x567C1128Be6C0c0b9b18C96459D09Cf539Fcbd59",
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
  basescanVerified: false,
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
