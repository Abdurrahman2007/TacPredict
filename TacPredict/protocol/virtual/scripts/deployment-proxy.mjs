// Pure encoding/verification helpers. No RPC, signer, wallet key or submission.
import { concatHex, encodeDeployData, getContractAddress, keccak256 } from "viem";
export const deploymentProxy = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
// Arachnid deterministic-deployment-proxy README deployment transaction runtime.
// Source: https://github.com/Arachnid/deterministic-deployment-proxy
export const deploymentProxyRuntime =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
export function assertDeploymentProxy(code) {
  if (code?.toLowerCase() !== deploymentProxyRuntime) throw Error("Unverified deployment proxy");
}
export function proxyDeployment(artifact, admin, seedBudget, grantBudget, salt) {
  if (!/^0x[0-9a-f]{64}$/i.test(salt)) throw Error("Invalid deployment salt");
  const initCode = encodeDeployData({
    abi: artifact.abi,
    bytecode: "0x" + artifact.evm.bytecode.object,
    args: [admin, seedBudget, grantBudget],
  });
  return {
    engine: getContractAddress({
      from: deploymentProxy,
      opcode: "CREATE2",
      salt,
      bytecode: initCode,
    }),
    initCode,
    initCodeHash: keccak256(initCode),
    data: concatHex([salt, initCode]),
  };
}
export function assertRuntime(artifact, code) {
  if (!code || code === "0x") throw Error("Missing virtual engine");
  let actual = code.slice(2),
    expected = artifact.evm.deployedBytecode.object;
  if (actual.length !== expected.length) throw Error("Virtual runtime size mismatch");
  for (const refs of Object.values(artifact.evm.deployedBytecode.immutableReferences ?? {}))
    for (const { start, length } of refs) {
      actual =
        actual.slice(0, start * 2) + "0".repeat(length * 2) + actual.slice((start + length) * 2);
      expected =
        expected.slice(0, start * 2) +
        "0".repeat(length * 2) +
        expected.slice((start + length) * 2);
    }
  if (actual.toLowerCase() !== expected.toLowerCase()) throw Error("Virtual runtime mismatch");
  // Caller MUST also verify immutable seedBudget/grantBudget getters and admin role.
}
