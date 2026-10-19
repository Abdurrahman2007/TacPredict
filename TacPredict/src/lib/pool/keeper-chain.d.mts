export function keeperEnv(env: Record<string, unknown>): { error: string } | { key: string; pool: string; rpc: string; geckoKey: string };
export function runPoolKeeper(
  env: Record<string, unknown>,
  options?: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    nowMs?: () => number;
    log?: (message: string) => void;
  },
): Promise<{ status: string; [key: string]: unknown }>;
