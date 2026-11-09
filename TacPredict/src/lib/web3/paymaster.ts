import { PRIMARY_CHAIN_ID } from "./constants";

/**
 * Public paymaster endpoint the wallet calls (EIP-5792 paymasterService).
 * Proxied by /api/paymaster so the Pimlico API key never ships in the browser bundle.
 */
export function paymasterServiceUrl(): string | null {
  const configured = import.meta.env["VITE_PAYMASTER_URL"];
  if (typeof configured === "string" && configured.startsWith("http")) return configured;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/api/paymaster`;
}

export const PAYMASTER_CHAIN_ID = PRIMARY_CHAIN_ID;
