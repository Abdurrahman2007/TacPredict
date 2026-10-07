// Network settings: https://docs.base.org/get-started/connect-to-base
// Native USDC: https://developers.circle.com/stablecoins/usdc-contract-addresses
export const BASE_NETWORK = {
  id: 8453,
  hexId: "0x2105",
  name: "Base",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  explorer: "https://basescan.org",
} as const;
export const USDC_DECIMALS = 6;
export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}
export function balanceOfData(address: string) {
  if (!isAddress(address)) throw new Error("Invalid wallet address");
  return `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
}
export function formatUsdc(raw: bigint | null) {
  if (raw === null) return "—";
  if (raw < 0n) throw new Error("Invalid balance");
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${fraction}`;
}
export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
