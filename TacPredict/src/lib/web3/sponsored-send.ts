import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { BASE_BUILDER_DATA_SUFFIX, BASE_BUILDER_DATA_SUFFIX_CAPABILITY } from "./builder-code";
import { paymasterServiceUrl } from "./paymaster";

type WriteArgs = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * Thrown when the wallet accepted a sponsored batch but it has not landed yet.
 * The batch may still confirm, so callers must not ask the user to send again.
 */
export class SponsoredSendPendingError extends Error {
  readonly callsId: string;
  constructor(callsId: string) {
    super("Your transaction is still confirming on Base");
    this.callsId = callsId;
    this.name = "SponsoredSendPendingError";
  }
}

/**
 * Prefer EIP-5792 wallet_sendCalls + Pimlico paymaster (gas sponsored).
 * Always attaches Base Builder Code attribution (ERC-8021 dataSuffix).
 * Falls back to writeContract only when the wallet cannot use sendCalls, or when it reports
 * that the batch was not included (status 400). Once the wallet has accepted a batch, it is
 * tracked until it lands; it is never replaced by a second, self-paid transaction.
 * Wallet/public are untyped clients to avoid viem WalletClient identity clashes.
 */
export async function sponsoredWriteContract(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public: any;
  account: Address | { address: Address };
  chain: { id: number };
  request: WriteArgs;
  onStatus?: (text: string) => void;
}): Promise<Hex> {
  const data = encodeFunctionData({
    abi: input.request.abi,
    functionName: input.request.functionName,
    args: input.request.args,
  });
  const paymaster = paymasterServiceUrl();
  const from =
    typeof input.account === "string" ? input.account : (input.account.address as Address);

  let callsId: string | undefined;
  if (typeof input.wallet?.request === "function") {
    try {
      input.onStatus?.(paymaster ? "Confirm — gas sponsored…" : "Confirm in your wallet…");
      const chainIdHex = `0x${input.chain.id.toString(16)}`;
      const capabilities: Record<string, unknown> = {
        dataSuffix: BASE_BUILDER_DATA_SUFFIX_CAPABILITY,
      };
      if (paymaster) {
        capabilities["paymasterService"] = { url: paymaster };
      }
      const id = (await input.wallet.request({
        method: "wallet_sendCalls",
        params: [
          {
            version: "2.0.0",
            from,
            chainId: chainIdHex,
            atomicRequired: true,
            calls: [
              {
                to: input.request.address,
                data,
                value: `0x${(input.request.value ?? 0n).toString(16)}`,
              },
            ],
            capabilities,
          },
        ],
      })) as string | { id?: string };
      callsId = typeof id === "string" ? id : id?.id;
    } catch (error) {
      // Wallet rejected sponsorship or does not support EIP-5792 — fall through to self-pay.
      const code = (error as { code?: number })?.code;
      if (code === 4001) throw error;
      console.warn("[paymaster] sponsored send unavailable, falling back", error);
    }
  }

  if (callsId) {
    // The wallet accepted the batch: from here on, track it instead of sending again.
    savePendingSend(from, input.chain.id, { callsId, at: Date.now() });
    input.onStatus?.("Confirming on Base…");
    const result = await waitForSponsoredHash(input.wallet, callsId);
    if (result.kind === "hash") {
      savePendingSend(from, input.chain.id, { callsId, hash: result.hash, at: Date.now() });
      return result.hash;
    }
    if (result.kind === "reverted") throw new Error("Transaction reverted");
    if (result.kind === "pending") throw new SponsoredSendPendingError(callsId);
    // "dropped": the wallet says the batch was not included, so nothing is on chain.
    clearPendingSend(from, input.chain.id);
  }

  input.onStatus?.("Confirm in your wallet…");
  const hash = (await input.wallet.writeContract({
    chain: input.chain,
    account: input.account,
    address: input.request.address,
    abi: input.request.abi,
    functionName: input.request.functionName,
    args: input.request.args,
    value: input.request.value,
    dataSuffix: BASE_BUILDER_DATA_SUFFIX,
  })) as Hex;
  savePendingSend(from, input.chain.id, { hash, at: Date.now() });
  return hash;
}

type BatchResult =
  { kind: "hash"; hash: Hex } | { kind: "dropped" } | { kind: "reverted" } | { kind: "pending" };

/** One wallet_getCallsStatus read, mapped to what the app needs to know. */
async function readCallsStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any,
  callsId: string,
): Promise<BatchResult> {
  const status = (await wallet.request({
    method: "wallet_getCallsStatus",
    params: [callsId],
  })) as {
    status?: number | string;
    receipts?: Array<{ transactionHash?: Hex; status?: string }>;
  };
  const code = status?.status;
  const hash = status?.receipts?.find((r) => r.transactionHash)?.transactionHash;
  if (hash) return { kind: "hash", hash };
  // EIP-5792: 400 = not included on chain (safe to retry); 500/600 = reverted (fully/partially).
  if (code === 400) return { kind: "dropped" };
  if (code === 500 || code === 600 || code === "FAILED" || code === "failed" || code === "REVERTED")
    return { kind: "reverted" };
  return { kind: "pending" };
}

async function waitForSponsoredHash(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any,
  callsId: string,
): Promise<BatchResult> {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    try {
      const result = await readCallsStatus(wallet, callsId);
      if (result.kind !== "pending") return result;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 1_200));
  }
  return { kind: "pending" };
}

/** True when a paymaster URL is configured for this build/page. */
export function gasSponsorshipAvailable(): boolean {
  return Boolean(paymasterServiceUrl());
}

/* ---------- In-flight transaction record (survives a page reload) ---------- */

type PendingSend = { callsId?: string; hash?: Hex; at: number };

/** Give up on a record the wallet can no longer tell us about after this long. */
const PENDING_MAX_AGE_MS = 15 * 60_000;

const pendingKey = (account: string, chainId: number) =>
  `tac:pending-send:v1:${chainId}:${account.toLowerCase()}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function savePendingSend(account: string, chainId: number, record: PendingSend) {
  try {
    storage()?.setItem(pendingKey(account, chainId), JSON.stringify(record));
  } catch {
    /* storage full or blocked: tracking still works for this page */
  }
}

function readPendingSend(account: string, chainId: number): PendingSend | null {
  try {
    const raw = storage()?.getItem(pendingKey(account, chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSend;
    return typeof parsed?.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/** Call once the transaction has a final receipt (success or revert). */
export function clearPendingSend(account: string, chainId: number) {
  try {
    storage()?.removeItem(pendingKey(account, chainId));
  } catch {
    /* ignore */
  }
}

/**
 * Before a new send: is an earlier one from this wallet (possibly from before a reload) still
 * in flight? Returns true while it is, so the UI can hold the next trade instead of letting
 * the user buy twice. Resolved or unknowable-and-stale records are cleared.
 */
export async function previousSendStillPending(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public: any;
  account: Address;
  chainId: number;
}): Promise<boolean> {
  const record = readPendingSend(input.account, input.chainId);
  if (!record) return false;
  const stale = Date.now() - record.at > PENDING_MAX_AGE_MS;
  try {
    let hash = record.hash;
    if (!hash && record.callsId) {
      const result = await readCallsStatus(input.wallet, record.callsId);
      if (result.kind === "pending") {
        if (stale) clearPendingSend(input.account, input.chainId);
        return !stale;
      }
      if (result.kind !== "hash") {
        clearPendingSend(input.account, input.chainId);
        return false;
      }
      hash = result.hash;
    }
    if (!hash) {
      clearPendingSend(input.account, input.chainId);
      return false;
    }
    const receipt = await input.public.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt || stale) {
      clearPendingSend(input.account, input.chainId);
      return false;
    }
    return true;
  } catch {
    // The wallet no longer knows the batch (e.g. reconnected): trust it only while fresh.
    if (stale) clearPendingSend(input.account, input.chainId);
    return !stale;
  }
}
