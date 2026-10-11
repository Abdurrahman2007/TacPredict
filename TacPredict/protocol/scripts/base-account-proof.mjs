/** Verify an atomic Base Account CREATE2 deployment, never submit a transaction. */
import {
  parseAbi,
  decodeFunctionData,
  decodeEventLog,
  encodeDeployData,
  encodeFunctionData,
  getCreate2Address,
  keccak256,
  stringToHex,
  concatHex,
} from "viem";
export const deploymentProxy = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
export const proxyRuntime =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
const names = {
  registry: "MarketRegistry",
  oracle: "ResolutionOracle",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  settlement: "Settlement",
};
const entryAbi = parseAbi([
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)",
  "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
]);
const accountAbi = parseAbi([
  "function executeBatch((address target,uint256 value,bytes data)[] calls)",
]);
export function expectedCreationCalls(m, artifacts) {
  const calls = [];
  for (const [k, n] of Object.entries(names)) {
    const proof = m.deployment_transactions?.[k];
    if (!proof?.salt || !proof?.args) throw Error("CREATE2 proof missing: " + k);
    const init = encodeDeployData({
      abi: artifacts[n].abi,
      bytecode: artifacts[n].bytecode,
      args: proof.args,
    });
    if (
      proof.initCodeHash !== keccak256(init) ||
      getCreate2Address({
        from: deploymentProxy,
        salt: proof.salt,
        bytecode: init,
      }).toLowerCase() !== m[k].toLowerCase()
    )
      throw Error("CREATE2 constructor/address mismatch: " + k);
    calls.push({ target: deploymentProxy, value: 0n, data: concatHex([proof.salt, init]) });
  }
  for (const [role, to] of [
    ["FACTORY_ROLE", m.factory],
    ["ORACLE_ROLE", m.oracle],
  ])
    calls.push({
      target: m.registry,
      value: 0n,
      data: encodeFunctionData({
        abi: artifacts.MarketRegistry.abi,
        functionName: "grantRole",
        args: [keccak256(stringToHex(role)), to],
      }),
    });
  calls.push({
    target: m.registry,
    value: 0n,
    data: encodeFunctionData({
      abi: artifacts.MarketRegistry.abi,
      functionName: "pauseTrading",
      args: [true],
    }),
  });
  return calls;
}
export function assertApprovedCreationBatch(tx, receipt, m, artifacts) {
  if (
    receipt.status !== "success" ||
    tx.to?.toLowerCase() !== "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789"
  )
    throw Error("Invalid Base Account EntryPoint receipt");
  const outer = decodeFunctionData({ abi: entryAbi, data: tx.input });
  const ops = outer.args[0].filter((o) => o.sender.toLowerCase() === m.admin.toLowerCase());
  if (ops.length !== 1) throw Error("Unambiguous approved admin operation required");
  const actual = decodeFunctionData({ abi: accountAbi, data: ops[0].callData }).args[0],
    expected = expectedCreationCalls(m, artifacts);
  if (
    actual.length !== expected.length ||
    actual.some(
      (c, i) =>
        c.target.toLowerCase() !== expected[i].target.toLowerCase() ||
        c.value !== expected[i].value ||
        c.data.toLowerCase() !== expected[i].data.toLowerCase(),
    )
  )
    throw Error("Confirmed account calls differ from compiled deployment");
  const events = receipt.logs
    .filter((l) => l.address.toLowerCase() === tx.to.toLowerCase())
    .flatMap((l) => {
      try {
        const e = decodeEventLog({ abi: entryAbi, ...l });
        return e.eventName === "UserOperationEvent" &&
          e.args.sender.toLowerCase() === m.admin.toLowerCase()
          ? [e]
          : [];
      } catch {
        return [];
      }
    });
  if (events.length !== 1 || events[0].args.success !== true)
    throw Error("Admin UserOperation did not succeed");
  return expected;
}
export async function verifyBaseAccountCreation(pub, m, artifacts) {
  const proofs = Object.values(m.deployment_transactions ?? {}),
    hash = proofs[0]?.txHash;
  if (!hash || proofs.length !== 6 || proofs.some((p) => p.txHash !== hash))
    throw Error("One six-contract creation transaction required");
  const [tx, receipt] = await Promise.all([
    pub.getTransaction({ hash }),
    pub.getTransactionReceipt({ hash }),
  ]);
  if (
    (await pub.getBytecode({ address: deploymentProxy, blockNumber: receipt.blockNumber })) !==
    proxyRuntime
  )
    throw Error("Unrecognized deployment proxy runtime");
  assertApprovedCreationBatch(tx, receipt, m, artifacts);
  return receipt;
}
