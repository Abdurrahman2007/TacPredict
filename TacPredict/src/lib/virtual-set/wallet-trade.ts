/**
 * One Virtual USDC trade from the user's own wallet, start to finish.
 *
 * Gas is sponsored via Pimlico paymaster (EIP-5792) when the wallet supports it; otherwise the user
 * pays Base ETH. The server only adds the maker's signed price; the wallet calls Exchange.fillOrder.
 * Order of work: approvals first (one time each), then a fresh quote, then fill.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  WaitForTransactionReceiptTimeoutError,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import type { WalletProvider } from "@/lib/onchain/wallet";
import { BASE_BUILDER_DATA_SUFFIX } from "@/lib/web3/builder-code";
import {
  SponsoredSendPendingError,
  clearPendingSend,
  gasSponsorshipAvailable,
  previousSendStillPending,
  sponsoredWriteContract,
} from "@/lib/web3/sponsored-send";
import { virtualConditionalPositionsAbi, virtualExchangeAbi, virtualUsdcAbi } from "./abi";
import { VIRTUAL_SET_ADDRESSES } from "./deployment.mjs";
import { confirmOnchainTrade, quoteOnchain } from "./functions";
import {
  APPROVE_AMOUNT,
  MIN_GAS_WEI,
  MIN_QUOTE_LIFE_SEC,
  errorText,
  neededApprovals,
  quoteTooFar,
  reasonText,
  toAtomic,
} from "./trade-plan.mjs";

export type OnchainTradeInput = {
  provider: WalletProvider;
  address: string;
  chainId: number | null;
  switchToBase: () => Promise<unknown>;
  /** reference-<asset>-<startMs>-<minutes>, the id the page already uses for a window. */
  key: string;
  outcome: 0 | 1;
  side: "buy" | "sell";
  /** Buy: dollars as typed, e.g. "5" or "12.50". */
  amount?: string;
  /** Sell: the exact shares held, in 6-decimal units. */
  sharesAtomic?: bigint;
  /** The price (cents) the page was showing, used only to refuse a quote that is far off. */
  shownCents?: number | null;
  onStatus?: (text: string) => void;
};

export type OnchainTradeResult =
  | { ok: true; hash: Hex; side: "buy" | "sell"; shares: number; usdc: number; priceCents: number }
  | { ok: false; message: string };

const EXCHANGE = VIRTUAL_SET_ADDRESSES.exchange as Address;
const POSITIONS = VIRTUAL_SET_ADDRESSES.positions as Address;
const USDC = VIRTUAL_SET_ADDRESSES.usdc as Address;
const ONE = 1_000_000;

const fail = (message: string): OnchainTradeResult => ({ ok: false, message });

const STILL_CONFIRMING =
  "Still confirming on Base — no need to send it again. It will show up once it lands.";
const PREVIOUS_IN_FLIGHT = "Your last transaction is still confirming — try again in a minute";

/** A send that was accepted but has not confirmed yet: not a failure, and must not be retried. */
function stillConfirming(error: unknown): boolean {
  return (
    error instanceof SponsoredSendPendingError ||
    error instanceof WaitForTransactionReceiptTimeoutError
  );
}

export async function executeOnchainTrade(input: OnchainTradeInput): Promise<OnchainTradeResult> {
  const say = input.onStatus ?? (() => undefined);
  try {
    const account = getAddress(input.address);
    const transport = custom(input.provider);
    const pub = createPublicClient({ chain: base, transport });
    const wallet = createWalletClient({
      account,
      chain: base,
      transport,
      dataSuffix: BASE_BUILDER_DATA_SUFFIX,
    });

    if (input.chainId !== base.id) {
      say("Switching your wallet to Base…");
      await input.switchToBase();
    }
    if ((await pub.getChainId()) !== base.id) return fail("Switch your wallet to the Base network");
    if (await previousSendStillPending({ wallet, public: pub, account, chainId: base.id }))
      return fail(PREVIOUS_IN_FLIGHT);

    const sponsored = gasSponsorshipAvailable();
    if (!sponsored && (await pub.getBalance({ address: account })) < MIN_GAS_WEI)
      return fail("Add a little ETH on Base for the network fee (about $0.01)");
    if (sponsored) say("Gas sponsored — you won’t pay the network fee");

    const spend = input.side === "buy" ? toAtomic(input.amount ?? "") : null;
    if (input.side === "buy" && (spend === null || spend <= 0n)) return fail(reasonText("bad_request"));
    if (input.side === "sell" && (input.sharesAtomic === undefined || input.sharesAtomic <= 0n))
      return fail(reasonText("bad_request"));

    // 1. One-time approvals, each waited for before moving on.
    const [allowance, approvedForAll] = await Promise.all([
      input.side === "buy"
        ? pub.readContract({ address: USDC, abi: virtualUsdcAbi, functionName: "allowance", args: [account, EXCHANGE] })
        : Promise.resolve(0n),
      input.side === "sell"
        ? pub.readContract({
            address: POSITIONS,
            abi: virtualConditionalPositionsAbi,
            functionName: "isApprovedForAll",
            args: [account, EXCHANGE],
          })
        : Promise.resolve(true),
    ]);
    for (const step of neededApprovals({ side: input.side, cost: spend ?? 0n, allowance, approvedForAll })) {
      say(step === "usdc" ? "Approve Virtual USDC (one time)…" : "Approve selling shares (one time)…");
      const approval = await sponsoredWriteContract({
        wallet,
        public: pub,
        account,
        chain: base,
        onStatus: say,
        request:
          step === "usdc"
            ? {
                address: USDC,
                abi: virtualUsdcAbi as Abi,
                functionName: "approve",
                args: [EXCHANGE, APPROVE_AMOUNT],
              }
            : {
                address: POSITIONS,
                abi: virtualConditionalPositionsAbi as Abi,
                functionName: "setApprovalForAll",
                args: [EXCHANGE, true],
              },
      });
      say("Confirming approval on Base…");
      const receipt = await pub.waitForTransactionReceipt({ hash: approval, timeout: 60_000 });
      clearPendingSend(account, base.id);
      if (receipt.status !== "success") return fail("The approval did not go through — try again");
    }

    // 2. A fresh signed price from the market maker.
    say("Getting the price…");
    const quoted = await quoteOnchain({
      data: {
        key: input.key,
        outcome: input.outcome,
        side: input.side,
        taker: account,
        ...(input.side === "buy" ? { usdc: (spend ?? 0n).toString() } : { shares: (input.sharesAtomic ?? 0n).toString() }),
      },
    });
    if (!quoted.ok) return fail(reasonText(quoted.reason));
    const quote = quoted.quote;
    const order = quote.order;

    // 3. Check what came back is exactly the trade that was asked for, against the real contracts.
    if (
      quote.contracts.exchange.toLowerCase() !== EXCHANGE.toLowerCase() ||
      order.taker.toLowerCase() !== account.toLowerCase() ||
      order.isBuy !== (input.side === "sell") ||
      order.outcome !== input.outcome
    )
      return fail("The price did not match this trade — try again");
    if (input.side === "buy" && spend !== null && BigInt(quote.usdc) > spend) return fail("The price moved — try again");
    if (input.side === "sell" && input.sharesAtomic !== undefined && BigInt(order.shares) > input.sharesAtomic)
      return fail("The price did not match this trade — try again");
    if (quoteTooFar(quote.pricePpm, input.shownCents ?? null)) return fail("The price moved a lot — check it and try again");
    if (quote.expiration - Math.floor(Date.now() / 1000) < MIN_QUOTE_LIFE_SEC) return fail("That price expired — try again");

    // 4. Dry-run, then ask the wallet. A failed dry-run costs the user nothing.
    const args = [
      {
        marketId: BigInt(order.marketId),
        outcome: order.outcome,
        maker: order.maker,
        isBuy: order.isBuy,
        price: BigInt(order.price),
        shares: BigInt(order.shares),
        nonce: BigInt(order.nonce),
        expiration: BigInt(order.expiration),
        taker: order.taker,
      },
      quote.signature,
      BigInt(order.shares),
    ] as const;
    await pub.simulateContract({
      account,
      address: EXCHANGE,
      abi: virtualExchangeAbi,
      functionName: "fillOrder",
      args,
    });
    const hash = await sponsoredWriteContract({
      wallet,
      public: pub,
      account,
      chain: base,
      onStatus: say,
      request: {
        address: EXCHANGE,
        abi: virtualExchangeAbi as Abi,
        functionName: "fillOrder",
        args,
      },
    });
    say("Confirming on Base…");
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    clearPendingSend(account, base.id);
    if (receipt.status !== "success") return fail("The trade did not go through — try again");

    // 5. Let the server record the fill from the receipt so the position shows at once.
    try {
      await confirmOnchainTrade({ data: { hash } });
    } catch {
      // The keeper indexes it within a minute anyway.
    }
    return {
      ok: true,
      hash,
      side: input.side,
      shares: Number(order.shares) / ONE,
      usdc: Number(quote.usdc) / ONE,
      priceCents: Math.round(quote.pricePpm / 10_000),
    };
  } catch (error) {
    if (stillConfirming(error)) return fail(STILL_CONFIRMING);
    return fail(errorText(error));
  }
}

/** Opens the daily check-in from the user's own wallet (the contract pays the reward to the sender). */
export async function sendCheckIn(input: Pick<OnchainTradeInput, "provider" | "address" | "chainId" | "switchToBase">) {
  try {
    const account = getAddress(input.address);
    const transport = custom(input.provider);
    const pub = createPublicClient({ chain: base, transport });
    const wallet = createWalletClient({
      account,
      chain: base,
      transport,
      dataSuffix: BASE_BUILDER_DATA_SUFFIX,
    });
    if (input.chainId !== base.id) await input.switchToBase();
    if ((await pub.getChainId()) !== base.id) return { ok: false as const, message: "Switch your wallet to the Base network" };
    if (await previousSendStillPending({ wallet, public: pub, account, chainId: base.id }))
      return { ok: false as const, message: PREVIOUS_IN_FLIGHT };
    const sponsored = gasSponsorshipAvailable();
    if (!sponsored && (await pub.getBalance({ address: account })) < MIN_GAS_WEI)
      return { ok: false as const, message: "Add a little ETH on Base for the network fee (about $0.01)" };
    await pub.simulateContract({
      account,
      address: USDC,
      abi: virtualUsdcAbi,
      functionName: "checkIn",
    });
    const hash = await sponsoredWriteContract({
      wallet,
      public: pub,
      account,
      chain: base,
      request: { address: USDC, abi: virtualUsdcAbi as Abi, functionName: "checkIn" },
    });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    clearPendingSend(account, base.id);
    if (receipt.status !== "success") return { ok: false as const, message: "Check-in did not go through — try again" };
    return { ok: true as const, hash };
  } catch (error) {
    if (stillConfirming(error)) return { ok: false as const, message: STILL_CONFIRMING };
    return { ok: false as const, message: errorText(error) };
  }
}
