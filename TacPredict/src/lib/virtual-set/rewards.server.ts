/**
 * Read-only status of a wallet's on-chain rewards: the one-time welcome box and the daily check-in. Both are plain
 * reads of the Virtual USDC contract, so the page never has to trust anything but the chain.
 */
import { getAddress } from "viem";
import { virtualUsdcAbi } from "./abi";
import { vdb } from "./db.server";
import { VSET_CONTRACTS, publicClient } from "./onchain.server";

const DAY = 86_400;
const ONE = 1_000_000;

export type BoxStatus = { claimed: boolean; open: boolean; amount: number | null };

export async function boxStatus(wallet: string): Promise<BoxStatus> {
  const account = getAddress(wallet);
  const pub = publicClient();
  const [claimed, open] = await Promise.all([
    pub.readContract({ address: VSET_CONTRACTS.usdc, abi: virtualUsdcAbi, functionName: "boxClaimed", args: [account] }),
    pub.readContract({ address: VSET_CONTRACTS.usdc, abi: virtualUsdcAbi, functionName: "boxOpen" }),
  ]);
  let amount: number | null = null;
  if (claimed) {
    const db = await vdb();
    const { data } = await db.from("vset_boxes").select("amount").eq("account", account.toLowerCase()).maybeSingle();
    const raw = (data as { amount?: number } | null)?.amount;
    amount = typeof raw === "number" ? raw / ONE : null;
  }
  return { claimed, open, amount };
}

export type CheckinStatus = {
  /** The box must be opened before the first check-in. */
  claimed: boolean;
  open: boolean;
  /** Days in a row, 0 when the streak is broken or nothing was claimed yet. */
  streak: number;
  /** Dollars the next check-in pays. */
  nextReward: number;
  available: boolean;
  /** When the next check-in opens (the next UTC midnight), or null when it is open now. */
  availableAtMs: number | null;
};

export async function checkinStatus(wallet: string, nowMs = Date.now()): Promise<CheckinStatus> {
  const account = getAddress(wallet);
  const pub = publicClient();
  const address = VSET_CONTRACTS.usdc;
  const [claimed, open, lastRaw, streakRaw] = await Promise.all([
    pub.readContract({ address, abi: virtualUsdcAbi, functionName: "boxClaimed", args: [account] }),
    pub.readContract({ address, abi: virtualUsdcAbi, functionName: "checkInOpen" }),
    pub.readContract({ address, abi: virtualUsdcAbi, functionName: "lastCheckInDay", args: [account] }),
    pub.readContract({ address, abi: virtualUsdcAbi, functionName: "streak", args: [account] }),
  ]);
  const today = Math.floor(nowMs / 1000 / DAY);
  const last = Number(lastRaw);
  const stored = Number(streakRaw);
  const alive = last !== 0 && today - last <= 1;
  const streak = alive ? stored : 0;
  const doneToday = last !== 0 && today === last;
  const available = open && claimed && !doneToday;
  const nextCount = Math.min(streak + 1, 7);
  return {
    claimed,
    open,
    streak,
    nextReward: 20 + 10 * (nextCount - 1),
    available,
    availableAtMs: doneToday ? (today + 1) * DAY * 1000 : null,
  };
}
