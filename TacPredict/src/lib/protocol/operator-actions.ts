import { parseAbi, keccak256, stringToHex, zeroAddress, type Address, type Hex } from "viem";
import type { WalletState } from "@/lib/onchain/wallet";
import type { ProtocolDeployment } from "./types";
import { protocolClients } from "./execution";
import { erc20Abi } from "./orders";
const factoryAbi = parseAbi([
  "function createMarket((bytes32 salt,bytes32 metadataHash,bytes32 rulesHash,bytes32 sourceHash,uint8 outcomes,uint64 openAt,uint64 closeAt,uint64 resolveAfter,uint64 resolutionDeadline) terms,string metadataURI) returns(uint256)",
]);
const oracleAbi = parseAbi([
  "function hasRole(bytes32,address) view returns(bool)",
  "function proposals(uint256) view returns(address proposer,address disputer,uint64 challengeDeadline,uint8 outcome,uint8 alternative,bool voided,bool alternativeVoid,bool finished,bytes32 evidenceHash)",
  "function bond() view returns(uint256)",
  "function challengePeriod() view returns(uint64)",
  "function propose(uint256,uint8,bool,bytes32,bytes32,uint64)",
  "function dispute(uint256,uint8,bool,bytes32)",
  "function finalize(uint256)",
  "function resolveDispute(uint256,uint8,bool,bytes32)",
  "function releaseTimeoutBonds(uint256)",
  "function withdrawBondCredit()",
]);
const registryAbi = parseAbi([
  "function getMarket(uint256) view returns((bytes32 questionId,bytes32 conditionId,bytes32 metadataHash,bytes32 rulesHash,bytes32 sourceHash,address oracle,uint64 createdAt,uint64 openAt,uint64 closeAt,uint64 resolveAfter,uint64 resolutionDeadline,uint8 outcomeCount,uint8 status))",
  "function timeoutVoid(uint256)",
  "function checkpointClose(uint256)",
  "function pauseTrading(bool)",
]);
export type PreparedTerms = {
  metadataHash: string;
  rulesHash: string;
  sourceHash: string;
  metadataUri: string;
};
export async function createOnchainMarket(
  w: WalletState,
  d: ProtocolDeployment,
  prepared: PreparedTerms,
  outcomes: number,
  times: { openAt: string; closeAt: string; resolveAfter: string; resolutionDeadline: string },
) {
  const { pub, wallet, account } = await protocolClients(w, d, false);
  const seconds = (v: string) => {
    const n = Date.parse(v + "Z");
    if (!Number.isFinite(n)) throw Error("Use a valid UTC market time");
    return BigInt(Math.floor(n / 1000));
  };
  const t = {
    salt: ("0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("")) as Hex,
    metadataHash: prepared.metadataHash as Hex,
    rulesHash: prepared.rulesHash as Hex,
    sourceHash: prepared.sourceHash as Hex,
    outcomes,
    openAt: seconds(times.openAt),
    closeAt: seconds(times.closeAt),
    resolveAfter: seconds(times.resolveAfter),
    resolutionDeadline: seconds(times.resolutionDeadline),
  };
  const now = (await pub.getBlock()).timestamp,
    period = await pub.readContract({
      address: d.oracle as Address,
      abi: oracleAbi,
      functionName: "challengePeriod",
    });
  if (
    t.openAt < now + 60n ||
    t.closeAt <= t.openAt ||
    t.resolveAfter < t.closeAt ||
    t.resolutionDeadline <= t.resolveAfter + period
  )
    throw Error(
      "Times must leave at least one minute before open and a full oracle challenge period before timeout.",
    );
  if (!prepared.metadataUri.startsWith("https://tacpredict.fun/api/protocol/metadata/"))
    throw Error("Approved TacPredict metadata required");
  const { request } = await pub.simulateContract({
    account,
    address: d.factory as Address,
    abi: factoryAbi,
    functionName: "createMarket",
    args: [t, prepared.metadataUri],
  });
  const hash = await wallet.writeContract(request);
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Market creation reverted");
  return hash;
}
export type ResolverAction =
  | "propose"
  | "dispute"
  | "finalize"
  | "resolveDispute"
  | "timeoutVoid"
  | "checkpointClose"
  | "releaseTimeoutBonds"
  | "withdrawBondCredit"
  | "pause"
  | "unpause";
export async function resolverTransaction(
  w: WalletState,
  d: ProtocolDeployment,
  action: ResolverAction,
  input: {
    marketId: string;
    outcome: number;
    voided: boolean;
    evidenceHash: string;
    observedAt: string;
  },
) {
  const { pub, wallet, account } = await protocolClients(w, d, false);
  let hash: Hex;
  if (action === "pause" || action === "unpause") {
    const { request } = await pub.simulateContract({
      account,
      address: d.registry as Address,
      abi: registryAbi,
      functionName: "pauseTrading",
      args: [action === "pause"],
    });
    hash = await wallet.writeContract(request);
  } else if (action === "withdrawBondCredit") {
    const { request } = await pub.simulateContract({
      account,
      address: d.oracle as Address,
      abi: oracleAbi,
      functionName: "withdrawBondCredit",
    });
    hash = await wallet.writeContract(request);
  } else {
    if (
      !/^\d{1,78}$/.test(input.marketId) ||
      BigInt(input.marketId) === 0n ||
      BigInt(input.marketId) >= 2n ** 256n
    )
      throw Error("Valid onchain market ID required");
    const id = BigInt(input.marketId);
    if (!Number.isInteger(input.outcome) || input.outcome < 0 || input.outcome > 7)
      throw Error("Valid outcome index required");
    if (
      ["propose", "dispute", "resolveDispute"].includes(action) &&
      (!/^0x[0-9a-fA-F]{64}$/.test(input.evidenceHash) || /^0x0+$/.test(input.evidenceHash))
    )
      throw Error("A reviewed, nonzero evidence hash is required");
    if (action === "timeoutVoid" || action === "checkpointClose") {
      const { request } = await pub.simulateContract({
        account,
        address: d.registry as Address,
        abi: registryAbi,
        functionName: action,
        args: [id],
      });
      hash = await wallet.writeContract(request);
    } else {
      let args: readonly unknown[] = [id];
      if (action === "propose" || action === "dispute" || action === "resolveDispute") {
        const market = await pub.readContract({
          account,
          address: d.registry as Address,
          abi: registryAbi,
          functionName: "getMarket",
          args: [id],
        });
        if (
          input.outcome >= market.outcomeCount ||
          market.oracle.toLowerCase() !== d.oracle.toLowerCase()
        )
          throw Error("Market oracle/outcome mismatch");
        if (action === "propose" || action === "resolveDispute") {
          const role = keccak256(
            stringToHex(action === "propose" ? "PROPOSER_ROLE" : "ARBITER_ROLE"),
          );
          if (
            !(await pub.readContract({
              address: d.oracle as Address,
              abi: oracleAbi,
              functionName: "hasRole",
              args: [role, account],
            }))
          )
            throw Error("Operator wallet does not hold the required oracle role");
        }
        const now = (await pub.getBlock()).timestamp;
        if (action === "propose") {
          const stamp = Date.parse(input.observedAt + "Z");
          if (
            !Number.isFinite(stamp) ||
            BigInt(Math.floor(stamp / 1000)) < market.closeAt ||
            BigInt(Math.floor(stamp / 1000)) > now ||
            market.status !== 3 ||
            now < market.resolveAfter
          )
            throw Error(
              "Valid post-close observation and closed market required before bond approval",
            );
        } else if (action === "dispute") {
          const proposal = await pub.readContract({
            address: d.oracle as Address,
            abi: oracleAbi,
            functionName: "proposals",
            args: [id],
          });
          if (
            proposal[0] === zeroAddress ||
            proposal[1] !== zeroAddress ||
            proposal[7] ||
            now >= proposal[2] ||
            market.status !== 4 ||
            proposal[0].toLowerCase() === account.toLowerCase()
          )
            throw Error("Proposal cannot currently be disputed");
        }
      }
      if (action === "propose" || action === "dispute") {
        const bond = await pub.readContract({
          address: d.oracle as Address,
          abi: oracleAbi,
          functionName: "bond",
        });
        const balance = await pub.readContract({
          address: d.collateral as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
        if (balance < bond) throw Error("Insufficient native USDC for the oracle bond");
        const allowance = await pub.readContract({
          address: d.collateral as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, d.oracle as Address],
        });
        if (allowance < bond) {
          const { request } = await pub.simulateContract({
            account,
            address: d.collateral as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [d.oracle as Address, bond],
          });
          const approval = await wallet.writeContract(request);
          if ((await pub.waitForTransactionReceipt({ hash: approval })).status !== "success")
            throw Error("Oracle bond approval failed");
        }
      }
      if (action === "propose") {
        const m = await pub.readContract({
          address: d.registry as Address,
          abi: registryAbi,
          functionName: "getMarket",
          args: [id],
        });
        const time = Date.parse(input.observedAt + "Z");
        if (!Number.isFinite(time)) throw Error("Valid UTC observation time required");
        args = [
          id,
          input.outcome,
          input.voided,
          input.evidenceHash as Hex,
          m.sourceHash,
          BigInt(Math.floor(time / 1000)),
        ];
      } else if (action === "dispute" || action === "resolveDispute")
        args = [id, input.outcome, input.voided, input.evidenceHash as Hex];
      // The explicit action union is runtime-whitelisted above; simulate before signing, onchain roles and lifecycle are authoritative.
      const { request } = await pub.simulateContract({
        account,
        address: d.oracle as Address,
        abi: oracleAbi,
        functionName: action,
        args,
      } as Parameters<typeof pub.simulateContract>[0]);
      hash = await wallet.writeContract(request);
    }
  }
  if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
    throw Error("Resolver transaction reverted");
  return hash;
}
