export type WalletAccess = "connect" | "verify" | "ready";
export function walletAccess(input: {
  address: string | null | undefined;
  signedIn: boolean;
}): WalletAccess;
export const ACCESS_LABEL: Record<WalletAccess, string>;
