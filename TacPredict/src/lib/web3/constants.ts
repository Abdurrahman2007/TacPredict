import { base } from "viem/chains";

/** WalletConnect / Reown Cloud project ID */
export const WALLETCONNECT_PROJECT_ID =
  import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] ?? "ba72570e2db904ab92fdd696564a9cda";

/** Primary + only supported network */
export const PRIMARY_CHAIN = base;
export const PRIMARY_CHAIN_ID = base.id; // 8453

/** Native USDC on Base Mainnet */
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_USDC_DECIMALS = 6;
export const BASE_USDC_SYMBOL = "USDC";
