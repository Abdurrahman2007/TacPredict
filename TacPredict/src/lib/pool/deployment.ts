import type { Address } from "viem";

/**
 * Where the UpDownPool contract lives on Base. It is empty until the owner deploys the contract
 * from the admin panel; the site then shows the rounds as "not live yet" instead of pretending.
 * A Worker variable UPDOWN_POOL_ADDRESS (server) or VITE_UPDOWN_POOL_ADDRESS (build) overrides this.
 */
export const UPDOWN_POOL = {
  chainId: 8453 as const,
  address: "",
};

const hex = /^0x[0-9a-fA-F]{40}$/;
export function validPoolAddress(value: string | undefined | null): Address | null {
  const text = (value ?? "").trim();
  return hex.test(text) ? (text as Address) : null;
}
export function configuredPoolAddress(): Address | null {
  const fromServer =
    typeof process !== "undefined" ? process.env?.["UPDOWN_POOL_ADDRESS"] : undefined;
  const fromBuild = (import.meta as { env?: Record<string, string | undefined> }).env?.[
    "VITE_UPDOWN_POOL_ADDRESS"
  ];
  return validPoolAddress(fromServer) ?? validPoolAddress(fromBuild) ?? validPoolAddress(UPDOWN_POOL.address);
}
