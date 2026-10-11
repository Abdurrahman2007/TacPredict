import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAbi,
  encodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  stringToHex,
  getCreate2Address,
  encodeDeployData,
} from "viem";
import {
  assertApprovedCreationBatch,
  expectedCreationCalls,
  deploymentProxy,
} from "../scripts/base-account-proof.mjs";
const names = {
  registry: "MarketRegistry",
  oracle: "ResolutionOracle",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  settlement: "Settlement",
};
function fixture(success = true, tamper = false) {
  const m = { admin: "0x1111111111111111111111111111111111111111", deployment_transactions: {} },
    artifacts = {};
  for (const [k, n] of Object.entries(names)) {
    const abi = parseAbi([
        "constructor()",
        "function grantRole(bytes32,address)",
        "function pauseTrading(bool)",
      ]),
      bytecode = "0x60006000f3",
      salt = keccak256(stringToHex(n)),
      init = encodeDeployData({ abi, bytecode, args: [] });
    m[k] = getCreate2Address({ from: deploymentProxy, salt, bytecode: init });
    m.deployment_transactions[k] = { salt, args: [], initCodeHash: keccak256(init) };
    artifacts[n] = { abi, bytecode };
  }
  const calls = expectedCreationCalls(m, artifacts);
  if (tamper) calls[0] = { ...calls[0], target: m.admin };
  const callData = encodeFunctionData({
    abi: parseAbi(["function executeBatch((address target,uint256 value,bytes data)[] calls)"]),
    functionName: "executeBatch",
    args: [calls],
  });
  const abi = parseAbi([
    "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)",
    "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
  ]);
  const entry = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
    zero = "0x0000000000000000000000000000000000000000",
    userOpHash = keccak256(stringToHex("local fixture"));
  const op = {
    sender: m.admin,
    nonce: 0n,
    initCode: "0x",
    callData,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
    paymasterAndData: "0x",
    signature: "0x",
  };
  return {
    m,
    artifacts,
    tx: {
      to: entry,
      input: encodeFunctionData({ abi, functionName: "handleOps", args: [[op], zero] }),
    },
    receipt: {
      status: "success",
      logs: [
        {
          address: entry,
          topics: encodeEventTopics({
            abi,
            eventName: "UserOperationEvent",
            args: { userOpHash, sender: m.admin, paymaster: zero },
          }),
          data: encodeAbiParameters(
            [{ type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }],
            [0n, success, 0n, 0n],
          ),
        },
      ],
    },
  };
}
test("exact nine-call compiled constructor and paused bootstrap batch is accepted", () => {
  const f = fixture();
  assert.equal(assertApprovedCreationBatch(f.tx, f.receipt, f.m, f.artifacts).length, 9);
});
test("a successful outer bundle never conceals a failed admin user operation", () => {
  const f = fixture(false);
  assert.throws(
    () => assertApprovedCreationBatch(f.tx, f.receipt, f.m, f.artifacts),
    /did not succeed/,
  );
});
test("changed recipient or changed constructor hash is rejected", () => {
  const f = fixture(true, true);
  assert.throws(
    () => assertApprovedCreationBatch(f.tx, f.receipt, f.m, f.artifacts),
    /calls differ/,
  );
  const g = fixture();
  g.m.deployment_transactions.registry.initCodeHash = keccak256(stringToHex("different"));
  assert.throws(
    () => assertApprovedCreationBatch(g.tx, g.receipt, g.m, g.artifacts),
    /constructor\/address mismatch/,
  );
});
