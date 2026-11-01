import type { Address, PublicClient } from "viem";
import { virtualUsdcAbi } from "./abi";
import { VIRTUAL_SET_ADDRESSES } from "./deployment.mjs";

/** One wallet's state on the virtual USDC contract. Amounts are raw 6-decimal units. */
export type VirtualAccountState = {
  balance: bigint;
  boxClaimed: boolean;
  /** UTC day number of the last check-in; 0 means the wallet never checked in. */
  lastCheckInDay: bigint;
  streak: bigint;
};

/**
 * Reads a wallet's virtual USDC state straight from the chain.
 *
 * Returns null when any value cannot be read. A failed read is never turned into a zero balance or an unclaimed
 * box, so the screen can say "unavailable" instead of showing a made-up number. Read-only: no signer, no key.
 */
export async function readVirtualAccount(
  client: Pick<PublicClient, "readContract">,
  wallet: Address,
): Promise<VirtualAccountState | null> {
  const address = VIRTUAL_SET_ADDRESSES.usdc as Address;
  try {
    const [balance, boxClaimed, lastCheckInDay, streak] = await Promise.all([
      client.readContract({ address, abi: virtualUsdcAbi, functionName: "balanceOf", args: [wallet] }),
      client.readContract({ address, abi: virtualUsdcAbi, functionName: "boxClaimed", args: [wallet] }),
      client.readContract({ address, abi: virtualUsdcAbi, functionName: "lastCheckInDay", args: [wallet] }),
      client.readContract({ address, abi: virtualUsdcAbi, functionName: "streak", args: [wallet] }),
    ]);
    return { balance, boxClaimed, lastCheckInDay, streak };
  } catch {
    return null;
  }
}
