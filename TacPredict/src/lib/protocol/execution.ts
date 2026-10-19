import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type Hex,
  zeroAddress,
  hashTypedData,
  keccak256,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import type { WalletState } from "@/lib/onchain/wallet";
import type { ProtocolDeployment, NativeMarket } from "./types";
import {
  erc20Abi,
  exchangeAbi,
  registryReadAbi,
  orderTypes,
  orderMessage,
  limitQuote,
  settlementAbi,
  positionAbi,
  usdcAtomic,
} from "./orders";
import { assertMarketIdentity, onchainMarketId } from "./market-identity.mjs";
import type { BookOrder } from "./read.functions";
import { submitProtocolOrder } from "./orders.functions";
export async function protocolClients(w: WalletState, d: ProtocolDeployment, newRisk = true) {
  if ((newRisk && !d.tradingEnabled) || !w.provider || !w.address)
    throw Error("Verified trading deployment and connected wallet required.");
  const chain = d.chainId === 8453 ? base : baseSepolia;
  if (![8453, 84532].includes(d.chainId)) throw Error("Unsupported chain");
  const expected =
    d.chainId === 8453
      ? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      : "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
  if (d.collateral.toLowerCase() !== expected) throw Error("Official native USDC required.");
  const pub = createPublicClient({ chain, transport: custom(w.provider) });
  if ((await pub.getChainId()) !== d.chainId) throw Error(`Switch your wallet to ${chain.name}.`);
  for (const key of [
    "registry",
    "factory",
    "positions",
    "exchange",
    "oracle",
    "settlement",
  ] as const) {
    const code = await pub.getBytecode({ address: d[key] as Address });
    if (!code || keccak256(code) !== d.codeHashes[key])
      throw Error(`Verified runtime bytecode mismatch: ${key}`);
  }
  const collateral = await pub.readContract({
    address: d.registry as Address,
    abi: registryReadAbi,
    functionName: "collateralToken",
  });
  if (collateral.toLowerCase() !== expected) throw Error("Registry collateral mismatch");
  const account = w.address as Address;
  return {
    pub,
    wallet: createWalletClient({ chain, account, transport: custom(w.provider) }),
    account,
    chain,
  };
}
export async function placeLimitBuy(
  w: WalletState,
  d: ProtocolDeployment,
  m: NativeMarket,
  outcome: number,
  amount: string,
  price: string,
) {
  assertMarketIdentity(m, d.chainId);
  const { pub, wallet, account, chain } = await protocolClients(w, d);
  const q = limitQuote(amount, price);
  if (
    !(await pub.readContract({
      address: d.registry as Address,
      abi: registryReadAbi,
      functionName: "isTradingOpen",
      args: [BigInt(m.onchainId)],
    }))
  )
    throw Error("Market is closed.");
  const balance = await pub.readContract({
    address: d.collateral as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  if (balance < q.maximumCostAtomic) throw Error("Insufficient native USDC.");
  const allowance = await pub.readContract({
    address: d.collateral as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, d.exchange as Address],
  });
  if (allowance < q.maximumCostAtomic) {
    const { request } = await pub.simulateContract({
      account,
      address: d.collateral as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [d.exchange as Address, q.maximumCostAtomic],
    });
    const hash = await wallet.writeContract(request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("Approval failed");
  }
  const nonce = await pub.readContract({
    address: d.exchange as Address,
    abi: exchangeAbi,
    functionName: "minimumNonce",
    args: [account],
  });
  const expiration = Math.min(
    Math.floor(Date.parse(m.closeAt) / 1000),
    Math.floor(Date.now() / 1000) + 3600,
  );
  const order = {
    marketId: m.onchainId,
    outcome,
    maker: account,
    isBuy: true,
    price: q.priceAtomic.toString(),
    shares: q.sharesAtomic.toString(),
    nonce: nonce.toString(),
    expiration: String(expiration),
    taker: zeroAddress,
  };
  const signature = await wallet.signTypedData({
    domain: {
      name: "TacPredictExchange",
      version: "1",
      chainId: chain.id,
      verifyingContract: d.exchange as Address,
    },
    types: orderTypes,
    primaryType: "Order",
    message: orderMessage(order),
  });
  return submitProtocolOrder({
    data: { chainId: chain.id as 8453 | 84532, marketUuid: m.id, order, signature },
  });
}
export async function fillOffer(w: WalletState, d: ProtocolDeployment, offer: BookOrder) {
  const { pub, wallet, account, chain } = await protocolClients(w, d);
  const o = orderMessage(offer.order);
  if (o.isBuy) throw Error("Select a sell offer.");
  if (o.maker.toLowerCase() === account.toLowerCase()) throw Error("Cannot trade with yourself.");
  const domain = {
    name: "TacPredictExchange",
    version: "1",
    chainId: chain.id,
    verifyingContract: d.exchange as Address,
  };
  if (
    hashTypedData({ domain, types: orderTypes, primaryType: "Order", message: o }) !==
      offer.orderId ||
    !(await pub.verifyTypedData({
      address: o.maker,
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: o,
      signature: offer.signature as Hex,
    }))
  )
    throw Error("Invalid signed offer");
  const filled = await pub.readContract({
    address: d.exchange as Address,
    abi: exchangeAbi,
    functionName: "filledShares",
    args: [offer.orderId as Hex],
  });
  const available = o.shares - filled;
  const shown = BigInt(offer.remainingAtomic);
  const quantity = available < shown ? available : shown;
  if (quantity <= 0n) throw Error("Offer filled already.");
  const cost = ((filled + quantity) * o.price) / 1000000n - (filled * o.price) / 1000000n;
  const allowance = await pub.readContract({
    address: d.collateral as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, d.exchange as Address],
  });
  if (allowance < cost) {
    const { request } = await pub.simulateContract({
      account,
      address: d.collateral as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [d.exchange as Address, cost],
    });
    const hash = await wallet.writeContract(request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("Approval failed");
  }
  const { request } = await pub.simulateContract({
    account,
    address: d.exchange as Address,
    abi: exchangeAbi,
    functionName: "fillOrder",
    args: [o, offer.signature as Hex, quantity],
  });
  const hash = await wallet.writeContract(request);
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Settlement failed");
  return hash;
}
export async function claimPosition(
  w: WalletState,
  d: ProtocolDeployment,
  marketId: string,
  voided: boolean,
) {
  const id = onchainMarketId(marketId);
  const { pub, wallet, account } = await protocolClients(w, d, false);
  const amount = await pub.readContract({
    address: d.positions as Address,
    abi: positionAbi,
    functionName: "claimable",
    args: [id, account],
  });
  if (amount <= 0n) throw Error("No redeemable shares.");
  const { request } = await pub.simulateContract({
    account,
    address: d.settlement as Address,
    abi: settlementAbi,
    functionName: voided ? "refund" : "claim",
    args: [id],
  });
  const hash = await wallet.writeContract(request);
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Claim failed");
  return hash;
}

export async function fundCompleteSet(
  w: WalletState,
  d: ProtocolDeployment,
  m: NativeMarket,
  amount: string,
  merge = false,
) {
  assertMarketIdentity(m, d.chainId);
  const { pub, wallet, account } = await protocolClients(w, d, !merge);
  const quantity = usdcAtomic(amount);
  if (m.chainId !== d.chainId) throw Error("Market network mismatch");
  if (!merge) {
    const balance = await pub.readContract({
      address: d.collateral as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    if (balance < quantity) throw Error("Insufficient native USDC");
    const allowance = await pub.readContract({
      address: d.collateral as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, d.positions as Address],
    });
    if (allowance < quantity) {
      const { request } = await pub.simulateContract({
        account,
        address: d.collateral as Address,
        abi: erc20Abi,
        functionName: "approve",
        args: [d.positions as Address, quantity],
      });
      const approval = await wallet.writeContract(request);
      if ((await pub.waitForTransactionReceipt({ hash: approval })).status !== "success")
        throw Error("USDC approval failed");
    }
  }
  const { request } = await pub.simulateContract({
    account,
    address: d.positions as Address,
    abi: positionAbi,
    functionName: merge ? "merge" : "split",
    args: [BigInt(m.onchainId), quantity],
  });
  const hash = await wallet.writeContract(request);
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Complete-set transaction failed");
  return hash;
}
export async function placeLimitSell(
  w: WalletState,
  d: ProtocolDeployment,
  m: NativeMarket,
  outcome: number,
  shares: string,
  price: string,
) {
  assertMarketIdentity(m, d.chainId);
  const { pub, wallet, account, chain } = await protocolClients(w, d);
  const quantity = usdcAtomic(shares),
    p = usdcAtomic(price);
  if (p >= 1000000n) throw Error("Price must be below 1 USDC");
  const token = m.outcomes.find((o) => o.index === outcome)?.tokenId;
  if (!token) throw Error("Outcome token not indexed");
  const chainToken = await pub.readContract({
    address: d.positions as Address,
    abi: positionAbi,
    functionName: "tokenId",
    args: [onchainMarketId(m.onchainId), outcome],
  });
  if (chainToken.toString() !== token) throw Error("Indexed outcome token mismatch");
  const balance = await pub.readContract({
    address: d.positions as Address,
    abi: positionAbi,
    functionName: "balanceOf",
    args: [account, BigInt(token)],
  });
  if (balance < quantity) throw Error("Insufficient owned outcome shares");
  const approved = await pub.readContract({
    address: d.positions as Address,
    abi: positionAbi,
    functionName: "isApprovedForAll",
    args: [account, d.exchange as Address],
  });
  if (!approved) {
    const { request } = await pub.simulateContract({
      account,
      address: d.positions as Address,
      abi: positionAbi,
      functionName: "setApprovalForAll",
      args: [d.exchange as Address, true],
    });
    const hash = await wallet.writeContract(request);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("Share transfer approval failed");
  }
  const nonce = await pub.readContract({
    address: d.exchange as Address,
    abi: exchangeAbi,
    functionName: "minimumNonce",
    args: [account],
  });
  const expiration = Math.min(
    Math.floor(Date.parse(m.closeAt) / 1000),
    Math.floor(Date.now() / 1000) + 3600,
  );
  if (expiration <= Math.floor(Date.now() / 1000)) throw Error("Market is closed");
  const order = {
    marketId: m.onchainId,
    outcome,
    maker: account,
    isBuy: false,
    price: p.toString(),
    shares: quantity.toString(),
    nonce: nonce.toString(),
    expiration: String(expiration),
    taker: zeroAddress,
  };
  const signature = await wallet.signTypedData({
    domain: {
      name: "TacPredictExchange",
      version: "1",
      chainId: chain.id,
      verifyingContract: d.exchange as Address,
    },
    types: orderTypes,
    primaryType: "Order",
    message: orderMessage(order),
  });
  return submitProtocolOrder({
    data: { chainId: chain.id as 8453 | 84532, marketUuid: m.id, order, signature },
  });
}
export async function cancelSignedOrder(w: WalletState, d: ProtocolDeployment, offer: BookOrder) {
  const { pub, wallet, account } = await protocolClients(w, d, false);
  if (offer.order.maker.toLowerCase() !== account.toLowerCase())
    throw Error("Only the maker can cancel this order");
  const { request } = await pub.simulateContract({
    account,
    address: d.exchange as Address,
    abi: exchangeAbi,
    functionName: "cancelOrder",
    args: [orderMessage(offer.order)],
  });
  const hash = await wallet.writeContract(request);
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Cancellation failed");
  return hash;
}
export async function revokeShareApproval(w: WalletState, d: ProtocolDeployment) {
  const { pub, wallet, account } = await protocolClients(w, d, false);
  const { request } = await pub.simulateContract({
    account,
    address: d.positions as Address,
    abi: positionAbi,
    functionName: "setApprovalForAll",
    args: [d.exchange as Address, false],
  });
  const hash = await wallet.writeContract(request);
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Revocation failed");
  return hash;
}
