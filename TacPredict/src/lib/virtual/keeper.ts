/**
 * Idempotent keeper planner/runner (pure + optional submit gate).
 * Does not register a cloud cron by itself — pair with process supervisor / CI schedule.
 * Never submits on Base Mainnet (8453). Sepolia (84532) submit requires explicit env.
 */

export type KeeperJob = {
  idempotencyKey: string;
  marketId: string;
  action: "captureStart" | "proposeFromFeed" | "finalize" | "timeoutVoid" | "createWindow";
  status: "pending" | "done" | "failed" | "skipped";
  attempts: number;
  lastError?: string;
  updatedAt: number;
};

export type KeeperStore = {
  get(key: string): KeeperJob | undefined;
  set(job: KeeperJob): void;
  all(): KeeperJob[];
};

export function memoryKeeperStore(): KeeperStore {
  const map = new Map<string, KeeperJob>();
  return {
    get: (k) => map.get(k),
    set: (j) => {
      map.set(j.idempotencyKey, j);
    },
    all: () => [...map.values()],
  };
}

export function assertKeeperNetworkAllowed(chainId: number, submit: boolean) {
  if (!submit) return;
  if (chainId === 8453) throw Error("Keeper submit blocked on Base Mainnet without approval");
  if (chainId !== 84532 && chainId !== 31337)
    throw Error(`Keeper submit only allowed on Sepolia/local, got chain ${chainId}`);
}

/**
 * Apply planned lifecycle actions into the store with retries / idempotency.
 * `execute` returns true on success. Failed jobs stay pending until maxAttempts.
 */
export async function runKeeperTick(input: {
  store: KeeperStore;
  plans: { marketId: string; action: KeeperJob["action"]; idempotencyKey: string }[];
  execute: (plan: { marketId: string; action: KeeperJob["action"]; idempotencyKey: string }) => Promise<void>;
  now?: number;
  maxAttempts?: number;
}): Promise<{ processed: number; done: number; failed: number; skipped: number }> {
  const now = input.now ?? Date.now();
  const maxAttempts = input.maxAttempts ?? 5;
  let processed = 0,
    done = 0,
    failed = 0,
    skipped = 0;

  for (const plan of input.plans) {
    const existing = input.store.get(plan.idempotencyKey);
    if (existing?.status === "done") {
      skipped += 1;
      continue;
    }
    if (existing && existing.attempts >= maxAttempts && existing.status === "failed") {
      skipped += 1;
      continue;
    }
    const job: KeeperJob = existing ?? {
      idempotencyKey: plan.idempotencyKey,
      marketId: plan.marketId,
      action: plan.action,
      status: "pending",
      attempts: 0,
      updatedAt: now,
    };
    job.attempts += 1;
    job.updatedAt = now;
    processed += 1;
    try {
      await input.execute(plan);
      job.status = "done";
      delete job.lastError;
      done += 1;
    } catch (e) {
      job.status = "failed";
      job.lastError = e instanceof Error ? e.message : "unknown";
      failed += 1;
    }
    input.store.set(job);
  }
  return { processed, done, failed, skipped };
}

/** Who pays gas: funded operator EOA with PROPOSER_ROLE (and CREATOR for pool create). */
export const KEEPER_GAS_POLICY = {
  payer: "Authorized operator wallet (PROPOSER/CREATOR roles)",
  funding: "Sepolia faucet ETH only until Mainnet approval; alert if balance < configured floor",
  feedUpdates: "Never send txs on price ticks — only captureStart/propose/finalize/timeoutVoid/create",
  alerts: "Emit structured JSON logs; page on consecutive failed attempts ≥ maxAttempts",
} as const;
