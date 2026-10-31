import assert from "node:assert/strict";
import ganache from "ganache";
import { compile } from "../scripts/compile.mjs";
import { createPublicClient, createWalletClient, custom, defineChain, keccak256, stringToHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Isolated chain with Base Sepolia's id, so the "Base only" guards pass exactly as on Base.
const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 84532, hardfork: "shanghai" },
  wallet: { totalAccounts: 5 },
});
const chain = defineChain({
  id: 84532,
  name: "Isolated Base Sepolia simulation",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
});
const accounts = Object.values(provider.getInitialAccounts()).map((x) => privateKeyToAccount(x.secretKey));
const clients = accounts.map((a) => createWalletClient({ account: a, chain, transport: custom(provider) }));
const pub = createPublicClient({ chain, transport: custom(provider), pollingInterval: 20, cacheTime: 0 });
const art = compile();
const address = {};
const [admin, maker, taker, observer] = accounts;
const USDC = 1_000_000n;
let passed = 0;

async function deploy(name, args = [], keep = true) {
  const hash = await clients[0].deployContract({ abi: art[name].abi, bytecode: "0x" + art[name].evm.bytecode.object, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  if (keep) address[name] = receipt.contractAddress;
  return receipt.contractAddress;
}
async function write(name, fn, args = [], who = 0, at = address[name]) {
  const hash = await clients[who].writeContract({ address: at, abi: art[name].abi, functionName: fn, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt;
}
const read = (name, fn, args = [], at = address[name]) =>
  pub.readContract({ address: at, abi: art[name].abi, functionName: fn, args });
const advance = async (seconds) => {
  await provider.request({ method: "evm_increaseTime", params: [seconds] });
  await provider.request({ method: "evm_mine", params: [] });
};
const h = (text) => keccak256(stringToHex(text));
const balance = (who) => read("VirtualUSDC", "balanceOf", [who.address]);
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}

try {
  await deploy("TestUSDC");
  await deploy("VirtualUSDC", [admin.address]);

  await test("The virtual registry only accepts the virtual token, never other USDC-like tokens or non-contracts", async () => {
    await assert.rejects(deploy("VirtualMarketRegistry", [admin.address, address.TestUSDC], false));
    await assert.rejects(deploy("VirtualMarketRegistry", [admin.address, taker.address], false));
    await assert.rejects(deploy("VirtualMarketRegistry", [zeroAddress, address.VirtualUSDC], false));
  });

  await deploy("VirtualMarketRegistry", [admin.address, address.VirtualUSDC]);
  await deploy("VirtualResolutionOracle", [admin.address, address.VirtualMarketRegistry, 5n * USDC, 60n]);
  await deploy("VirtualMarketFactory", [admin.address, address.VirtualMarketRegistry, address.VirtualResolutionOracle]);
  await deploy("VirtualConditionalPositions", [address.VirtualMarketRegistry]);
  await deploy("VirtualExchange", [address.VirtualMarketRegistry, address.VirtualConditionalPositions]);
  await deploy("VirtualSettlement", [address.VirtualMarketRegistry, address.VirtualConditionalPositions]);
  await write("VirtualMarketRegistry", "grantRole", [h("FACTORY_ROLE"), address.VirtualMarketFactory]);
  await write("VirtualMarketRegistry", "grantRole", [h("ORACLE_ROLE"), address.VirtualResolutionOracle]);

  await test("Only the admin can build the protocol list, only for contracts, and it locks for good", async () => {
    await assert.rejects(write("VirtualUSDC", "allowProtocol", [address.VirtualExchange], 1));
    await assert.rejects(write("VirtualUSDC", "allowProtocol", [taker.address]));
    for (const name of ["VirtualConditionalPositions", "VirtualExchange", "VirtualResolutionOracle"])
      await write("VirtualUSDC", "allowProtocol", [address[name]]);
    await assert.rejects(write("VirtualUSDC", "lockProtocol", [], 1));
    await write("VirtualUSDC", "lockProtocol");
    await assert.rejects(write("VirtualUSDC", "allowProtocol", [address.VirtualSettlement]));
    assert.equal(await read("VirtualUSDC", "protocol", [address.VirtualSettlement]), false);
    assert.equal(await read("VirtualUSDC", "protocolLocked"), true);
  });

  await test("The admin funds wallets, but cannot take or edit balances", async () => {
    assert.equal(await read("VirtualUSDC", "decimals"), 6);
    assert.equal(await read("VirtualUSDC", "symbol"), "vUSDC");
    const grant = (who, to, amount) => write("VirtualUSDC", "adminGrant", [to, amount, h("setup")], who);
    await assert.rejects(grant(1, maker.address, 500n * USDC), undefined, "only the admin");
    await assert.rejects(grant(0, zeroAddress, 500n * USDC));
    await assert.rejects(grant(0, maker.address, 0n));
    for (const i of [0, 1, 2, 3]) {
      await grant(0, accounts[i].address, 500n * USDC);
      assert.equal(await balance(accounts[i]), 500n * USDC);
    }
    assert.equal(await read("VirtualUSDC", "totalSupply"), 2000n * USDC);
    assert.equal(await read("VirtualUSDC", "totalGranted"), 2000n * USDC);
    const names = art.VirtualUSDC.abi.map((x) => x.name);
    for (const forbidden of ["mint", "burn", "adminBurn", "adminTransfer", "setBalance"]) assert.ok(!names.includes(forbidden), forbidden);
  });

  await test("Virtual USDC cannot be sent to another wallet or pulled out by anyone but the trading contracts", async () => {
    await assert.rejects(write("VirtualUSDC", "transfer", [taker.address, USDC], 1));
    await write("VirtualUSDC", "approve", [taker.address, 10n * USDC], 1);
    await assert.rejects(write("VirtualUSDC", "transferFrom", [maker.address, taker.address, USDC], 2));
    await assert.rejects(write("VirtualUSDC", "transferFrom", [maker.address, admin.address, USDC], 0));
    assert.equal(await balance(maker), 500n * USDC);
    assert.equal(await balance(taker), 500n * USDC);
    await write("VirtualUSDC", "approve", [taker.address, 0n], 1);
  });

  for (const i of [0, 1, 2, 3]) {
    for (const name of ["VirtualConditionalPositions", "VirtualExchange", "VirtualResolutionOracle"])
      await write("VirtualUSDC", "approve", [address[name], 1_000n * USDC], i);
    await write("VirtualConditionalPositions", "setApprovalForAll", [address.VirtualExchange, true], i);
  }

  async function market(life = 150) {
    const id = await read("VirtualMarketRegistry", "nextMarketId");
    const now = (await pub.getBlock()).timestamp;
    const terms = {
      salt: h("salt" + id),
      metadataHash: h("metadata" + id),
      rulesHash: h("rules" + id),
      sourceHash: h("locked-source"),
      outcomes: 2,
      openAt: now + 3n,
      closeAt: now + BigInt(life),
      resolveAfter: now + BigInt(life),
      resolutionDeadline: now + BigInt(life + 250),
    };
    await write("VirtualMarketFactory", "createMarket", [terms, "https://tacpredict.fun/metadata/" + id]);
    await advance(4);
    return { id, terms };
  }
  const { id, terms } = await market();
  const yes = await read("VirtualConditionalPositions", "tokenId", [id, 0]);
  const types = {
    Order: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "maker", type: "address" },
      { name: "isBuy", type: "bool" },
      { name: "price", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiration", type: "uint64" },
      { name: "taker", type: "address" },
    ],
  };
  const order = {
    marketId: id,
    outcome: 0,
    maker: maker.address,
    isBuy: false,
    price: 620_000n,
    shares: 40n * USDC,
    nonce: 0n,
    expiration: terms.closeAt,
    taker: zeroAddress,
  };
  const domain = (name) => ({ name, version: "1", chainId: 84532, verifyingContract: address.VirtualExchange });

  await test("Every position and fill moves virtual USDC through the contracts, signed under the virtual domain only", async () => {
    await write("VirtualConditionalPositions", "split", [id, 100n * USDC], 1);
    assert.equal(await balance(maker), 400n * USDC);
    assert.equal(await read("VirtualUSDC", "balanceOf", [address.VirtualConditionalPositions]), 100n * USDC);
    assert.equal(await read("VirtualConditionalPositions", "collateralLocked", [id]), 100n * USDC);

    // A signature made for the production exchange's domain is worthless here.
    const foreign = await maker.signTypedData({ domain: domain("TacPredictExchange"), types, primaryType: "Order", message: order });
    await assert.rejects(write("VirtualExchange", "fillOrder", [order, foreign, 20n * USDC], 2));

    const signature = await maker.signTypedData({ domain: domain("TacPredictVirtualExchange"), types, primaryType: "Order", message: order });
    await write("VirtualExchange", "fillOrder", [order, signature, 20n * USDC], 2);
    assert.equal(await read("VirtualConditionalPositions", "balanceOf", [taker.address, yes]), 20n * USDC);
    assert.equal(await balance(taker), 500n * USDC - 12_400_000n);
    assert.equal(await balance(maker), 400n * USDC + 12_400_000n);
    await assert.rejects(write("VirtualExchange", "fillOrder", [order, signature, 30n * USDC], 2));
  });

  await advance(160);
  await test("Resolution and claims pay out in virtual USDC and conserve every unit", async () => {
    const now = (await pub.getBlock()).timestamp;
    await write("VirtualResolutionOracle", "propose", [id, 0, false, h("evidence"), terms.sourceHash, now]);
    assert.equal(await balance(admin), 495n * USDC, "the proposer bond is virtual USDC too");
    await advance(61);
    await write("VirtualResolutionOracle", "finalize", [id], 3);
    assert.equal(await read("VirtualSettlement", "claimable", [id, taker.address]), 20n * USDC);
    assert.equal(await read("VirtualSettlement", "claimable", [id, maker.address]), 80n * USDC);
    await write("VirtualSettlement", "claim", [id], 2);
    await write("VirtualSettlement", "claim", [id], 1);
    await assert.rejects(write("VirtualSettlement", "claim", [id], 2));
    await write("VirtualResolutionOracle", "withdrawBondCredit");
    assert.equal(await balance(admin), 500n * USDC);
    assert.equal(await balance(taker), 500n * USDC - 12_400_000n + 20n * USDC);
    assert.equal(await balance(maker), 400n * USDC + 12_400_000n + 80n * USDC);
    assert.equal(await read("VirtualConditionalPositions", "collateralLocked", [id]), 0n);
    assert.equal(await read("VirtualUSDC", "balanceOf", [address.VirtualConditionalPositions]), 0n);
    assert.equal(await read("VirtualUSDC", "balanceOf", [address.VirtualResolutionOracle]), 0n);
    assert.equal(await read("VirtualUSDC", "totalSupply"), 2000n * USDC, "nothing was created or lost by trading");
  });

  const other = accounts[4];
  const day = 86400;
  const onToday = async () => {
    const now = Number((await pub.getBlock()).timestamp);
    await advance(day - (now % day) + 10); // just after the next UTC midnight, so one day is one step
  };

  await test("The box is fixed per wallet, 50 to 500 whole USDC, shown without a transaction and credited exactly once", async () => {
    const preview = [];
    for (const who of accounts) {
      const amount = await read("VirtualUSDC", "boxAmount", [who.address]);
      assert.ok(amount >= 50n * USDC && amount <= 500n * USDC, "range " + amount);
      assert.equal(amount % USDC, 0n, "whole dollars");
      assert.equal(amount, await read("VirtualUSDC", "boxAmount", [who.address]), "stable");
      preview.push(amount);
    }
    assert.ok(new Set(preview).size > 1, "not the same for everyone");
    const expected = await read("VirtualUSDC", "boxAmount", [other.address]);
    assert.equal(await balance(other), 0n);
    await write("VirtualUSDC", "claimBox", [other.address], 3); // someone else pays the gas
    assert.equal(await balance(other), expected);
    await assert.rejects(write("VirtualUSDC", "claimBox", [other.address], 3));
    await assert.rejects(write("VirtualUSDC", "claimBox", [other.address], 4));
    await assert.rejects(write("VirtualUSDC", "claimBox", [zeroAddress], 3));
    assert.equal(await read("VirtualUSDC", "boxesOpened"), 1n);
    assert.equal(await read("VirtualUSDC", "totalBoxAmount"), expected);
  });

  await test("Check-in is one transaction a day: 20 to 80 USDC over seven days, then 80 until a missed day restarts it", async () => {
    await onToday();
    const rewards = [20, 30, 40, 50, 60, 70, 80, 80, 80];
    for (const [n, usdc] of rewards.entries()) {
      if (n > 0) await advance(day);
      const before = await balance(observer);
      const box = n === 0 ? await read("VirtualUSDC", "boxAmount", [observer.address]) : 0n;
      await write("VirtualUSDC", "checkIn", [], 3);
      assert.equal((await balance(observer)) - before, BigInt(usdc) * USDC + box, "day " + (n + 1) + (n === 0 ? " includes the first-time box" : ""));
      if (n === 0) await assert.rejects(write("VirtualUSDC", "checkIn", [], 3), undefined, "once per UTC day");
    }
    assert.equal(await read("VirtualUSDC", "streak", [observer.address]), 9n);
    await advance(2 * day);
    const before = await balance(observer);
    await write("VirtualUSDC", "checkIn", [], 3);
    assert.equal((await balance(observer)) - before, 20n * USDC);
    assert.equal(await read("VirtualUSDC", "streak", [observer.address]), 1n);
    // The box was credited once, inside the first check-in, and never again.
    assert.equal(await read("VirtualUSDC", "boxClaimed", [observer.address]), true);
    assert.equal(await read("VirtualUSDC", "boxesOpened"), 2n);
    // A wallet whose box was already credited gets only the check-in reward.
    const otherBefore = await balance(other);
    await write("VirtualUSDC", "checkIn", [], 4);
    assert.equal((await balance(other)) - otherBefore, 20n * USDC);
  });

  await test("The admin can switch check-in and the box off and on, and only the admin can", async () => {
    await assert.rejects(write("VirtualUSDC", "setCheckInOpen", [false], 1));
    await assert.rejects(write("VirtualUSDC", "setBoxOpen", [false], 1));
    await write("VirtualUSDC", "setCheckInOpen", [false]);
    await advance(day);
    await assert.rejects(write("VirtualUSDC", "checkIn", [], 4), undefined, "check-in is off");
    await write("VirtualUSDC", "setCheckInOpen", [true]);
    await write("VirtualUSDC", "setBoxOpen", [false]);
    await assert.rejects(write("VirtualUSDC", "claimBox", [maker.address], 1), undefined, "box is off");
    const before = await balance(taker);
    await write("VirtualUSDC", "checkIn", [], 2);
    assert.equal((await balance(taker)) - before, 20n * USDC, "check-in still works and pays no box while the box is off");
    await write("VirtualUSDC", "setBoxOpen", [true]);
    await write("VirtualUSDC", "claimBox", [maker.address], 1);
    assert.equal(await read("VirtualUSDC", "boxClaimed", [maker.address]), true);
  });

  await test("Admin grants are capped at 100,000 USDC in total per wallet; the admin can be handed over safely", async () => {
    const grant = (who, to, amount) => write("VirtualUSDC", "adminGrant", [to, amount, h("campaign")], who);
    await assert.rejects(grant(0, other.address, 100_001n * USDC));
    await grant(0, other.address, 60_000n * USDC);
    await assert.rejects(grant(0, other.address, 40_001n * USDC));
    await grant(0, other.address, 40_000n * USDC);
    await assert.rejects(grant(0, other.address, 1n));
    assert.equal(await read("VirtualUSDC", "adminGranted", [other.address]), 100_000n * USDC);
    await grant(0, observer.address, 99_500n * USDC); // 500 were granted at setup; the cap is per wallet, not global

    await assert.rejects(write("VirtualUSDC", "proposeAdmin", [maker.address], 1));
    await write("VirtualUSDC", "proposeAdmin", [maker.address]);
    await assert.rejects(write("VirtualUSDC", "acceptAdmin", [], 2));
    await write("VirtualUSDC", "acceptAdmin", [], 1);
    assert.equal((await read("VirtualUSDC", "admin")).toLowerCase(), maker.address.toLowerCase());
    await assert.rejects(grant(0, taker.address, USDC), undefined, "the old admin lost its powers");
    await grant(1, taker.address, USDC);
    // Everything that was ever created is accounted for and nothing was burned.
    assert.equal(await read("VirtualUSDC", "totalSupply"), await read("VirtualUSDC", "totalGranted"));
  });

  console.log(`${passed} virtual set tests passed`);
} finally {
  await provider.disconnect();
}
