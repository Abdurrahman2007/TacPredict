export function keeperEnv(env: Record<string, unknown>): { error: string } | { key: string; pool: string; rpc: string; geckoKey: string };
