import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { paymasterServiceUrl } from "./paymaster";

type WriteArgs = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/**
 * Prefer EIP-5792 wallet_sendCalls + Pimlico paymaster (gas sponsored).
 * Falls back to a normal writeContract when the wallet cannot sponsor.
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

  if (paymaster && typeof input.wallet?.request === "function") {
    try {
      input.onStatus?.("Confirm — gas sponsored…");
      const chainIdHex = `0x${input.chain.id.toString(16)}`;
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
            capabilities: {
              paymasterService: { url: paymaster },
            },
          },
        ],
      })) as string | { id?: string };

      const callsId = typeof id === "string" ? id : id?.id;
      if (callsId) {
        const hash = await waitForSponsoredHash(input.wallet, input.public, callsId);
        if (hash) return hash;
      }
    } catch (error) {
      // Wallet rejected sponsorship or does not support EIP-5792 — fall through to self-pay.
      const code = (error as { code?: number })?.code;
      if (code === 4001) throw error;
      console.warn("[paymaster] sponsored send unavailable, falling back", error);
    }
  }

  input.onStatus?.("Confirm in your wallet…");
  return input.wallet.writeContract({
    chain: input.chain,
    account: input.account,
    address: input.request.address,
    abi: input.request.abi,
    functionName: input.request.functionName,
    args: input.request.args,
    value: input.request.value,
  }) as Promise<Hex>;
}

async function waitForSponsoredHash(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pub: any,
  callsId: string,
): Promise<Hex | null> {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    try {
      const status = (await wallet.request({
        method: "wallet_getCallsStatus",
        params: [callsId],
      })) as {
        status?: number | string;
        receipts?: Array<{ transactionHash?: Hex; status?: string }>;
      };
      const code = status?.status;
      const done =
        code === 200 ||
        code === "CONFIRMED" ||
        code === "confirmed" ||
        (typeof code === "number" && code >= 200 && code < 300);
      const failed =
        code === 400 ||
        code === 500 ||
        code === "FAILED" ||
        code === "failed" ||
        code === "REVERTED";
      if (failed) return null;
      const hash = status?.receipts?.find((r) => r.transactionHash)?.transactionHash;
      if (done && hash) {
        await pub.waitForTransactionReceipt({ hash, timeout: 60_000 }).catch(() => null);
        return hash;
      }
      if (hash) return hash;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 1_200));
  }
  return null;
}

/** True when a paymaster URL is configured for this build/page. */
export function gasSponsorshipAvailable(): boolean {
  return Boolean(paymasterServiceUrl());
}
