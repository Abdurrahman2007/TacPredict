/**
 * Gate: Up/Down may use wallet→VirtualPriceAMM execution only when explicitly bound.
 * Live home/detail markets are paper until a Sepolia/Mainnet pool mapping exists.
 * Mainnet (8453) stays disabled until VIRTUAL_MAINNET_EXECUTION_APPROVED=true AND config.enabled.
 */
import type { VirtualDeployment } from "./types";

export function onchainVirtualExecutionAllowed(deployment: VirtualDeployment | null | undefined): {
  allowed: boolean;
  reason: string;
} {
  if (!deployment) {
    return {
      allowed: false,
      reason: "No VirtualPriceAMM deployment in VIRTUAL_TRADING_CONFIG",
    };
  }
  if (!deployment.enabled) {
    return { allowed: false, reason: "Virtual deployment enabled:false" };
  }
  if (deployment.chainId === 8453) {
    if (process.env["VIRTUAL_MAINNET_EXECUTION_APPROVED"] !== "true") {
      return {
        allowed: false,
        reason: "Base Mainnet virtual execution blocked until explicit approval",
      };
    }
  } else if (deployment.chainId !== 84532 && deployment.chainId !== 31337) {
    return { allowed: false, reason: `Unsupported virtual chain ${deployment.chainId}` };
  }
  if (deployment.model !== "feed-v1") {
    return { allowed: false, reason: "Only feed-v1 VirtualPriceAMM is supported for Up/Down" };
  }
  return { allowed: true, reason: "ok" };
}
