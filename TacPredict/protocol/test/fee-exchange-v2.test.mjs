/** Isolated local EVM only. No live RPC, production keys, user funds or deployment. */
import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  keccak256,
  stringToHex,
  zeroAddress,
  encodeFunctionData,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compile } from "../scripts/compile.mjs";
import { feeV2OrderTypes, feeV2Quote } from "../../src/lib/protocol/fee-v2.mjs";

const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 84532, hardfork: "shanghai" },
  wallet: { totalAccounts: 6 },
});
const chain = defineChain({
  id: 84532,
  name: "Isolated FeeV2 simulation",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost"] } },
});
const accounts = Object.values(provider.getInitialAccounts()).map((a) =>
  privateKeyToAccount(a.secretKey),
);
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain, transport: custom(provider) }),
);
const pub = createPublicClient({
  chain,
  transport: custom(provider),
  pollingInterval: 10,
  cacheTime: 0,
});
const compiled = compile();
const arts = Object.fromEntries(
  Object.entries(compiled).map(([n, a]) => [
    n,
    { abi: a.abi, bytecode: "0x" + a.evm.bytecode.object },
  ]),
);
const actorSource = `pragma solidity ^0.8.30;
contract FeeTestWallet {
 address public owner; bool public rejectShares; address public callbackTarget; bytes public callbackData; bool public callbackSucceeded;
 mapping(bytes32=>bool) public permitted;
 constructor(){owner=msg.sender;}
 function permit(bytes32 hash) external {require(msg.sender==owner);permitted[hash]=true;}
 function setReceiver(bool reject,address target,bytes calldata data) external {require(msg.sender==owner);rejectShares=reject;callbackTarget=target;callbackData=data;}
 function execute(address target,bytes calldata data) external {require(msg.sender==owner);(bool ok,)=target.call(data);require(ok);}
 function isValidSignature(bytes32 hash,bytes calldata) external view returns(bytes4){return permitted[hash]?bytes4(0x1626ba7e):bytes4(0xffffffff);}
 function onERC1155Received(address,address,uint256,uint256,bytes calldata) external returns(bytes4){require(!rejectShares,"Receiver rejected");if(callbackTarget!=address(0)){address target=callbackTarget;callbackTarget=address(0);(callbackSucceeded,)=target.call(callbackData);}return this.onERC1155Received.selector;}
}`;
const fixture = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Fixture.sol": { content: actorSource } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        viaIR: true,
        evmVersion: "shanghai",
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
assert(!(fixture.errors ?? []).some((e) => e.severity === "error"));
arts.FeeTestWallet = {
  abi: fixture.contracts["Fixture.sol"].FeeTestWallet.abi,
  bytecode: "0x" + fixture.contracts["Fixture.sol"].FeeTestWallet.evm.bytecode.object,
};
const addresses = {};
const H = (t) => keccak256(stringToHex(t));
async function deploy(n, args = []) {
  const hash = await wallets[0].deployContract({ ...arts[n], args });
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success");
  addresses[n] = r.contractAddress;
  return r.contractAddress;
}
async function write(n, fn, args = [], who = 0) {
  const hash = await wallets[who].writeContract({
    address: addresses[n],
    abi: arts[n].abi,
    functionName: fn,
    args,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success");
  return r;
}
const read = (n, functionName, args = []) =>
  pub.readContract({ address: addresses[n], abi: arts[n].abi, functionName, args });
const advance = async (n) => {
  await provider.request({ method: "evm_increaseTime", params: [n] });
  await provider.request({ method: "evm_mine", params: [] });
};
let salt = 0,
  nonce = 0n;
const USDC = 1_000_000n;
async function market() {
  const now = (await pub.getBlock()).timestamp;
  const id = await read("MarketRegistry", "nextMarketId");
  const terms = {
    salt: H("fee-market-" + ++salt),
    metadataHash: H("meta"),
    rulesHash: H("rules"),
    sourceHash: H("source"),
    outcomes: 2,
    openAt: now + 3n,
    closeAt: now + 600n,
    resolveAfter: now + 600n,
    resolutionDeadline: now + 200000n,
  };
  await write("MarketFactory", "createMarket", [terms, "https://tacpredict.fun/review-only-local"]);
  await advance(4);
  await write("ConditionalPositions", "split", [id, 100n * USDC], 1);
  return { id, terms };
}
let domain;
const order = (m, extra = {}) => ({
  marketId: m.id,
  outcome: 0,
  maker: accounts[1].address,
  isBuy: false,
  price: 500000n,
  shares: 20n * USDC,
  nonce: nonce++,
  expiration: m.terms.closeAt,
  taker: zeroAddress,
  feeBps: 100,
  feeRecipient: accounts[4].address,
  maxTotalCost: 0n,
  ...extra,
});
const sign = (o, who = 1, d = domain) =>
  accounts[who].signTypedData({
    domain: d,
    types: feeV2OrderTypes,
    primaryType: "Order",
    message: o,
  });
const feeRead = () => read("TestUSDC", "balanceOf", [addresses.FeeExchangeV2]);
const cash = (i) => read("TestUSDC", "balanceOf", [accounts[i].address]);

try {
  await deploy("TestUSDC");
  const native = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  await provider.request({
    method: "evm_setAccountCode",
    params: [native, "0x" + compiled.TestUSDC.evm.deployedBytecode.object],
  });
  addresses.TestUSDC = native;
  await deploy("MarketRegistry", [accounts[0].address, native]);
  await deploy("ResolutionOracle", [
    accounts[0].address,
    addresses.MarketRegistry,
    5n * USDC,
    86400n,
  ]);
  await deploy("MarketFactory", [
    accounts[0].address,
    addresses.MarketRegistry,
    addresses.ResolutionOracle,
  ]);
  await deploy("ConditionalPositions", [addresses.MarketRegistry]);
  await deploy("Settlement", [addresses.MarketRegistry, addresses.ConditionalPositions]);
  await deploy("FeeExchangeV2", [
    addresses.MarketRegistry,
    addresses.ConditionalPositions,
    accounts[4].address,
  ]);
  await deploy("FeeTestWallet");
  domain = {
    name: "TacPredictFeeExchange",
    version: "2",
    chainId: 84532,
    verifyingContract: addresses.FeeExchangeV2,
  };
  await write("MarketRegistry", "grantRole", [H("FACTORY_ROLE"), addresses.MarketFactory]);
  await write("MarketRegistry", "grantRole", [H("ORACLE_ROLE"), addresses.ResolutionOracle]);
  for (const i of [0, 1, 2, 5]) {
    await write("TestUSDC", "mint", [accounts[i].address, 1000n * USDC]);
    await write("TestUSDC", "approve", [addresses.ConditionalPositions, 1000n * USDC], i);
    await write("TestUSDC", "approve", [addresses.FeeExchangeV2, 1000n * USDC], i);
    await write("ConditionalPositions", "setApprovalForAll", [addresses.FeeExchangeV2, true], i);
  }
  await write("TestUSDC", "approve", [addresses.ResolutionOracle, 100n * USDC]);
  await write("TestUSDC", "approve", [addresses.ResolutionOracle, 100n * USDC], 2);
  const a = await market(),
    v = await market(),
    timeout = await market();

  await test("1% is an additional buyer fee: $10.10 debit, $10 seller, $0.10 reserved, no principal movement", async () => {
    const o = order(a),
      sig = await sign(o),
      b = await cash(2),
      s = await cash(1);
    const principal = await read("ConditionalPositions", "collateralLocked", [a.id]);
    const receipt = await write("FeeExchangeV2", "fillOrder", [o, sig, o.shares, 10_100_000n], 2);
    assert.equal(b - (await cash(2)), 10_100_000n);
    assert.equal((await cash(1)) - s, 10_000_000n);
    assert.equal(await feeRead(), 100000n);
    assert.equal(await cash(4), 0n);
    assert.equal(await read("ConditionalPositions", "collateralLocked", [a.id]), principal);
    const e = receipt.logs
      .map((l) => {
        try {
          return decodeEventLog({ abi: arts.FeeExchangeV2.abi, ...l });
        } catch {
          return null;
        }
      })
      .find((e) => e?.eventName === "ExecutionFeeEscrowed");
    assert.equal(e.args.feeAtomic, 100000n);
  });
  await test("cumulative floor rounding across partial fills: 99 atoms + 1 atom costs exactly 1 fee atom", async () => {
    const o = order(a, { shares: 200n }),
      sig = await sign(o),
      id = await read("FeeExchangeV2", "orderId", [o]);
    const scope = await read("FeeExchangeV2", "directFeeScope", [id, accounts[2].address]);
    await write("FeeExchangeV2", "fillOrder", [o, sig, 198n, 99n], 2);
    assert.equal(await read("FeeExchangeV2", "feeScopeNotional", [scope]), 99n);
    assert.equal(await read("FeeExchangeV2", "feeFor", [scope, 1n]), 1n);
    await write("FeeExchangeV2", "fillOrder", [o, sig, 2n, 2n], 2);
    assert.equal(await read("FeeExchangeV2", "feesPaid", [a.id, accounts[2].address]), 100001n);
  });
  await test("fee consent, domain/chain, recipient, taker cap and buyer signed all-in cap fail closed", async () => {
    const o = order(a);
    const digest = await read("FeeExchangeV2", "orderId", [o]);
    const balance = await cash(2),
      escrow = await feeRead();
    await assert.rejects(
      write("FeeExchangeV2", "fillOrder", [o, await sign(o), o.shares, 10n * USDC], 2),
    );
    await assert.rejects(
      write(
        "FeeExchangeV2",
        "fillOrder",
        [o, await sign(o, 1, { ...domain, chainId: 8453 }), o.shares, 11n * USDC],
        2,
      ),
    );
    await assert.rejects(
      write(
        "FeeExchangeV2",
        "fillOrder",
        [
          o,
          await sign(o, 1, { ...domain, name: "TacPredictExchange", version: "1" }),
          o.shares,
          11n * USDC,
        ],
        2,
      ),
    );
    for (const change of [
      { feeBps: 101 },
      { feeRecipient: accounts[3].address },
      { taker: accounts[5].address },
    ]) {
      const bad = { ...o, ...change };
      await assert.rejects(
        write("FeeExchangeV2", "fillOrder", [bad, await sign(bad), bad.shares, 11n * USDC], 2),
      );
    }
    const buy = order(a, { isBuy: true, maker: accounts[2].address, maxTotalCost: 10_099_999n });
    await assert.rejects(
      write("FeeExchangeV2", "fillOrder", [buy, await sign(buy, 2), buy.shares, 11n * USDC], 1),
    );
    assert.equal(await read("FeeExchangeV2", "filledShares", [digest]), 0n);
    assert.equal(await cash(2), balance);
    assert.equal(await feeRead(), escrow);
  });
  await test("allowance failure and share transfer failure roll back seller proceeds, fee and all counters", async () => {
    const o = order(a),
      sig = await sign(o),
      id = await read("FeeExchangeV2", "orderId", [o]),
      balance = await cash(1),
      escrow = await feeRead();
    await write("TestUSDC", "approve", [addresses.FeeExchangeV2, 10n * USDC], 2);
    await assert.rejects(write("FeeExchangeV2", "fillOrder", [o, sig, o.shares, 11n * USDC], 2));
    await write("TestUSDC", "approve", [addresses.FeeExchangeV2, 1000n * USDC], 2);
    await write("ConditionalPositions", "setApprovalForAll", [addresses.FeeExchangeV2, false], 1);
    await assert.rejects(write("FeeExchangeV2", "fillOrder", [o, sig, o.shares, 11n * USDC], 2));
    await write("ConditionalPositions", "setApprovalForAll", [addresses.FeeExchangeV2, true], 1);
    assert.equal(await cash(1), balance);
    assert.equal(await feeRead(), escrow);
    assert.equal(await read("FeeExchangeV2", "filledShares", [id]), 0n);
  });
  await test("direct buy and crossed matching share one signed cumulative budget and fee scope", async () => {
    const buy = order(a, { maker: accounts[2].address, isBuy: true, maxTotalCost: 10_100_000n }),
      bs = await sign(buy, 2),
      bid = await read("FeeExchangeV2", "orderId", [buy]);
    const sell = order(a, { shares: 10n * USDC }),
      ss = await sign(sell);
    await write("FeeExchangeV2", "fillOrder", [buy, bs, 10n * USDC, 5_050_000n], 1);
    await write("FeeExchangeV2", "matchOrders", [buy, bs, sell, ss, 10n * USDC], 3);
    assert.equal(await read("FeeExchangeV2", "buyerTotalDebited", [bid]), 10_100_000n);
    assert.equal(await read("FeeExchangeV2", "feeScopeNotional", [bid]), 10_000_000n);
    await assert.rejects(write("FeeExchangeV2", "matchOrders", [buy, bs, sell, ss, 1n], 3));
  });
  await test("cancel, nonce invalidation, zero price, self-trade and paused market block fee collection", async () => {
    const o = order(a),
      sig = await sign(o),
      escrow = await feeRead();
    await write("FeeExchangeV2", "cancelOrder", [o], 1);
    await assert.rejects(write("FeeExchangeV2", "fillOrder", [o, sig, 1n, 100n], 2));
    const fresh = order(a),
      fsig = await sign(fresh);
    await write("FeeExchangeV2", "invalidateNonce", [fresh.nonce + 1n], 1);
    await assert.rejects(write("FeeExchangeV2", "fillOrder", [fresh, fsig, 2n, 100n], 2));
    const z = order(a, { price: 0n });
    await assert.rejects(write("FeeExchangeV2", "fillOrder", [z, await sign(z), 2n, 100n], 2));
    const self = order(a);
    await assert.rejects(
      write("FeeExchangeV2", "fillOrder", [self, await sign(self), 2n, 100n], 1),
    );
    await write("MarketRegistry", "pauseTrading", [true]);
    const paused = order(a);
    await assert.rejects(
      write("FeeExchangeV2", "fillOrder", [paused, await sign(paused), 2n, 100n], 2),
    );
    await write("MarketRegistry", "pauseTrading", [false]);
    assert.equal(await feeRead(), escrow);
  });
  await test("ERC1271 smart-wallet buyer works; rejecting receiver atomically reverts all transfers", async () => {
    const actor = addresses.FeeTestWallet;
    await write("TestUSDC", "mint", [actor, 100n * USDC]);
    await write("FeeTestWallet", "execute", [
      addresses.TestUSDC,
      encodeFunctionData({
        abi: arts.TestUSDC.abi,
        functionName: "approve",
        args: [addresses.FeeExchangeV2, 100n * USDC],
      }),
    ]);
    const buy = order(a, { maker: actor, isBuy: true, maxTotalCost: 10_100_000n }),
      id = await read("FeeExchangeV2", "orderId", [buy]);
    await write("FeeTestWallet", "permit", [id]);
    await write("FeeTestWallet", "setReceiver", [true, zeroAddress, "0x"]);
    const sellerBefore = await cash(1),
      escrow = await feeRead();
    await assert.rejects(
      write("FeeExchangeV2", "fillOrder", [buy, "0x1234", buy.shares, 10_100_000n], 1),
    );
    assert.equal(await cash(1), sellerBefore);
    assert.equal(await feeRead(), escrow);
    assert.equal(await read("FeeExchangeV2", "filledShares", [id]), 0n);
    const nested = order(a),
      nestedSig = await sign(nested),
      nestedId = await read("FeeExchangeV2", "orderId", [nested]);
    const reentry = encodeFunctionData({
      abi: arts.FeeExchangeV2.abi,
      functionName: "fillOrder",
      args: [nested, nestedSig, 2n, 1n],
    });
    await write("FeeTestWallet", "setReceiver", [false, addresses.FeeExchangeV2, reentry]);
    await write("FeeExchangeV2", "fillOrder", [buy, "0x1234", buy.shares, 10_100_000n], 1);
    assert.equal(await read("FeeTestWallet", "callbackSucceeded"), false);
    assert.equal(await read("FeeExchangeV2", "filledShares", [nestedId]), 0n);
  });
  // Separate VOID and timeout markets: execution fee rights belong to the buyer even after shares move.
  const voidOrder = order(v),
    voidSig = await sign(voidOrder);
  await write("FeeExchangeV2", "fillOrder", [voidOrder, voidSig, voidOrder.shares, 10_100_000n], 2);
  const vtoken = await read("ConditionalPositions", "tokenId", [v.id, 0]);
  await write(
    "ConditionalPositions",
    "safeTransferFrom",
    [accounts[2].address, accounts[5].address, vtoken, 20n * USDC, "0x"],
    2,
  );
  const timeoutOrder = order(timeout);
  await write(
    "FeeExchangeV2",
    "fillOrder",
    [timeoutOrder, await sign(timeoutOrder), 10n * USDC, 5_050_000n],
    2,
  );
  await write(
    "FeeExchangeV2",
    "fillOrder",
    [timeoutOrder, await sign(timeoutOrder), 10n * USDC, 5_050_000n],
    5,
  );
  await test("fees cannot be refunded or released before terminal resolution; donations are not sweepable", async () => {
    const escrow = await read("FeeExchangeV2", "totalFeeEscrow");
    await assert.rejects(
      write("FeeExchangeV2", "refundExecutionFeeFor", [v.id, accounts[2].address], 3),
    );
    await assert.rejects(write("FeeExchangeV2", "releaseMarketFees", [a.id], 3));
    await write("TestUSDC", "transfer", [addresses.FeeExchangeV2, 123n], 0);
    assert.equal(await feeRead(), escrow + 123n);
    assert.equal(
      arts.FeeExchangeV2.abi.some(
        (x) => x.type === "function" && /sweep|rescue|setFee|setTreasury/i.test(x.name),
      ),
      false,
    );
  });
  await advance(610);
  const now = (await pub.getBlock()).timestamp;
  await write("ResolutionOracle", "propose", [
    a.id,
    0,
    false,
    H("a-evidence"),
    a.terms.sourceHash,
    now,
  ]);
  await write("ResolutionOracle", "propose", [
    v.id,
    0,
    true,
    H("v-evidence"),
    v.terms.sourceHash,
    now,
  ]);
  await test("immutable full 86400-second challenge is respected; fees cannot release during resolving", async () => {
    assert.equal(await read("ResolutionOracle", "challengePeriod"), 86400n);
    await assert.rejects(write("ResolutionOracle", "finalize", [a.id], 3));
    await assert.rejects(write("FeeExchangeV2", "releaseMarketFees", [a.id], 3));
    await assert.rejects(
      write("FeeExchangeV2", "refundExecutionFeeFor", [v.id, accounts[2].address], 3),
    );
  });
  await test("a bonded dispute blocks both fee withdrawal and refund until adjudicated", async () => {
    await write("ResolutionOracle", "dispute", [v.id, 1, false, H("void-dispute")], 2);
    await assert.rejects(write("FeeExchangeV2", "releaseMarketFees", [v.id], 3));
    await assert.rejects(
      write("FeeExchangeV2", "refundExecutionFeeFor", [v.id, accounts[2].address], 3),
    );
    await assert.rejects(
      write("ResolutionOracle", "resolveDispute", [v.id, 0, true, H("void-verdict")]),
    );
  });
  await advance(86401);
  await write("ResolutionOracle", "finalize", [a.id], 3);
  await assert.rejects(write("ResolutionOracle", "finalize", [v.id], 3));
  await write("ResolutionOracle", "resolveDispute", [v.id, 0, true, H("void-verdict")]);
  await test("non-VOID fees release only once to immutable treasury, not caller; principal remains backed", async () => {
    const amount = await read("FeeExchangeV2", "marketFeeEscrow", [a.id]),
      before = await cash(4),
      helper = await cash(3);
    const principal = await read("ConditionalPositions", "collateralLocked", [a.id]);
    await write("MarketRegistry", "pauseTrading", [true]);
    await write("FeeExchangeV2", "releaseMarketFees", [a.id], 3);
    assert.equal((await cash(4)) - before, amount);
    assert.equal(await cash(3), helper);
    assert.equal(await read("ConditionalPositions", "collateralLocked", [a.id]), principal);
    await assert.rejects(write("FeeExchangeV2", "releaseMarketFees", [a.id], 3));
    await assert.rejects(
      write("FeeExchangeV2", "refundExecutionFeeFor", [a.id, accounts[2].address], 3),
    );
  });
  await test("VOID execution fee returns to original buyer, separate from current-holder principal, once only", async () => {
    assert.equal(
      await read("FeeExchangeV2", "refundableFee", [v.id, accounts[2].address]),
      100000n,
    );
    assert.equal(await read("FeeExchangeV2", "refundableFee", [v.id, accounts[5].address]), 0n);
    const beforeBuyer = await cash(2),
      beforeHolder = await cash(5),
      principal = await read("ConditionalPositions", "collateralLocked", [v.id]);
    await write("FeeExchangeV2", "refundExecutionFeeFor", [v.id, accounts[2].address], 3);
    assert.equal((await cash(2)) - beforeBuyer, 100000n);
    assert.equal(await cash(5), beforeHolder);
    assert.equal(await read("ConditionalPositions", "collateralLocked", [v.id]), principal);
    await assert.rejects(
      write("FeeExchangeV2", "refundExecutionFeeFor", [v.id, accounts[2].address], 3),
    );
    await assert.rejects(write("FeeExchangeV2", "releaseMarketFees", [v.id], 3));
    await write("Settlement", "refund", [v.id], 5);
    assert.equal((await cash(5)) - beforeHolder, 10n * USDC); // 20 shares / 2, NOT original buyer's purchase refund
  });
  await test("timeout VOID requires real Registry transition; refund remains callable under trading pause", async () => {
    await assert.rejects(
      write("FeeExchangeV2", "refundExecutionFeeFor", [timeout.id, accounts[2].address], 3),
    );
    await advance(120000);
    await write("MarketRegistry", "timeoutVoid", [timeout.id], 3);
    const before = await cash(2),
      other = await cash(5);
    await write("FeeExchangeV2", "refundExecutionFeeFor", [timeout.id, accounts[2].address], 3);
    assert.equal((await cash(2)) - before, 50000n);
    assert.equal(await read("FeeExchangeV2", "marketFeeEscrow", [timeout.id]), 50000n);
    await write("FeeExchangeV2", "refundExecutionFeeFor", [timeout.id, accounts[5].address], 3);
    assert.equal((await cash(5)) - other, 50000n);
    await assert.rejects(write("FeeExchangeV2", "releaseMarketFees", [timeout.id], 3));
  });
  await test("global fee accounting reconciles exactly; no principal, bond or donation classified as fees", async () => {
    const collected = await read("FeeExchangeV2", "totalFeesCollected"),
      refunded = await read("FeeExchangeV2", "totalFeesRefunded"),
      released = await read("FeeExchangeV2", "totalFeesReleased"),
      escrow = await read("FeeExchangeV2", "totalFeeEscrow");
    assert.equal(collected, refunded + released + escrow);
    assert.equal(await feeRead(), escrow + 123n);
    assert.equal(escrow, 0n);
    assert.equal(await read("ResolutionOracle", "credits", [accounts[0].address]), 15n * USDC); // oracle credit is not fee revenue
  });
  await test("TypeScript quote model matches integer arithmetic and rejects Number/overflow/invalid input", () => {
    assert.equal(feeV2Quote("0", "10000000").buyerDebitAtomic, "10100000");
    assert.equal(feeV2Quote("99", "1").feeAtomic, "1");
    for (const pair of [
      [0, "1"],
      ["0", 1],
      ["0", "0"],
      ["0", "1e6"],
      ["01", "100"],
      [((1n << 256n) - 1n).toString(), "1"],
    ])
      assert.throws(() => feeV2Quote(...pair));
    for (const total of [1n, 99n, 100n, 101n, 9007199254740993000n]) {
      let before = 0n,
        fee = 0n;
      for (const cost of [total / 3n, total - total / 3n])
        if (cost > 0n) {
          fee += BigInt(feeV2Quote(before.toString(), cost.toString()).feeAtomic);
          before += cost;
        }
      assert.equal(fee, total / 100n);
    }
  });
} finally {
  await provider.disconnect();
}
