export { keeperEnv } from "./keeper-env.mjs";
export function runPoolKeeper(
  env: Record<string, unknown>,
  options?: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    nowMs?: () => number;
    maxAttempts?: number;
    waitForReceipts?: boolean;
    log?: (message: string) => void;
  },
): Promise<{ status: string; [key: string]: unknown }>;
