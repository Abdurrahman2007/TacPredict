/** Read-only Base launch snapshot. No signing, approvals, DB writes, deployment or unpause. */
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http, parseAbi, keccak256, stringToHex } from "viem";
import { base } from "viem/chains";
import { assessLaunchReadiness } from "./launch-readiness-core.mjs";

const manifest = JSON.parse(
  fs.readFileSync(new URL("../deployments/base-mainnet.json", import.meta.url), "utf8"),
);
const rpc =
  process.env.BASE_PROTOCOL_RPC_URL || process.env.PROTOCOL_RPC_URL || "https://mainnet.base.org";
const pub = createPublicClient({
  chain: base,
  transport: http(rpc, { timeout: 15000, retryCount: 1 }),
});
const official = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const abi = parseAbi([
  "function tradingPaused() view returns(bool)",
  "function nextMarketId() view returns(uint256)",
  "function collateralToken() view returns(address)",
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function hasRole(bytes32,address) view returns(bool)",
  "function getMarket(uint256) view returns ((bytes32 questionId,bytes32 conditionId,bytes32 metadataHash,bytes32 rulesHash,bytes32 sourceHash,address oracle,uint64 createdAt,uint64 openAt,uint64 closeAt,uint64 resolveAfter,uint64 resolutionDeadline,uint8 outcomeCount,uint8 status))",
]);
const errors = [];
const safe = async (id, fn) => {
  try {
    return await fn();
  } catch {
    errors.push(id);
    return null;
  }
};
function finish(report) {
  const output = process.argv.indexOf("--out");
  if (output >= 0) {
    const file = process.argv[output + 1];
    if (!file) throw Error("--out requires a file path");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 2;
}
let chainId = await safe("chain-id", () => pub.getChainId());
// Avoid querying arbitrary chain addresses after a chain mismatch.
if (chainId !== 8453) {
  const report = {
    observedAt: new Date().toISOString(),
    ...assessLaunchReadiness({ chainId }),
    errors,
  };
  finish(report);
  process.exit(2);
}
const block = await safe("finalized-block", () => pub.getBlock({ blockTag: "finalized" }));
if (!block || block.number === null || !block.hash) {
  finish({ observedAt: new Date().toISOString(), ...assessLaunchReadiness({ chainId }), errors });
  process.exit(2);
}
const read = (address, functionName, args = []) =>
  pub.readContract({ address, abi, functionName, args, blockNumber: block.number });
const [paused, nextId, collateral, decimals, balance, adminEth, adminUsdc, guardian] =
  await Promise.all([
    safe("trading-pause", () => read(manifest.registry, "tradingPaused")),
    safe("market-count", () => read(manifest.registry, "nextMarketId")),
    safe("registry-collateral", () => read(manifest.registry, "collateralToken")),
    safe("usdc-decimals", () => read(manifest.collateral_token, "decimals")),
    safe("positions-collateral", () =>
      read(manifest.collateral_token, "balanceOf", [manifest.positions]),
    ),
    safe("operator-gas", () =>
      pub.getBalance({ address: manifest.admin, blockNumber: block.number }),
    ),
    safe("operator-usdc", () => read(manifest.collateral_token, "balanceOf", [manifest.admin])),
    safe("guardian-role", () =>
      read(manifest.registry, "hasRole", [keccak256(stringToHex("GUARDIAN_ROLE")), manifest.admin]),
    ),
  ]);
const runtimes = await Promise.all(
  Object.entries(manifest.code_hashes).map(async ([key, expected]) => ({
    contract: key,
    matches: await safe(`runtime:${key}`, async () => {
      const code = await pub.getBytecode({ address: manifest[key], blockNumber: block.number });
      return Boolean(code && code !== "0x" && keccak256(code) === expected);
    }),
  })),
);
// Bound discovery, and never silently conclude there are no open markets after a truncated read.
const count = nextId === null ? null : nextId - 1n;
const sampled = [];
if (count !== null)
  for (let id = 1n; id <= count && id <= 100n; id++) {
    const m = await safe(`market:${id}`, () => read(manifest.registry, "getMarket", [id]));
    if (m)
      sampled.push({
        id: String(id),
        status: Number(m.status),
        openAt: Number(m.openAt),
        closeAt: Number(m.closeAt),
      });
  }
const open = sampled.filter(
  (m) =>
    m.status === 2 && m.openAt <= Number(block.timestamp) && m.closeAt > Number(block.timestamp),
);
const again = await safe("canonical-recheck", () => pub.getBlock({ blockNumber: block.number }));
const evidence = {
  chainId,
  canonical: again ? block.hash === again.hash : null,
  nativeUsdc:
    collateral === null || decimals === null
      ? null
      : collateral.toLowerCase() === official && Number(decimals) === 6,
  runtimeMatches: runtimes.some((r) => r.matches === null)
    ? null
    : runtimes.every((r) => r.matches),
  guardian,
  hasOpenMarket:
    count === null
      ? null
      : open.length > 0
        ? true
        : count > 100n || errors.some((e) => e.startsWith("market:"))
          ? null
          : false,
  hasCollateral: balance === null ? null : balance > 0n,
  unpaused: paused === null ? null : !paused,
};
const report = {
  observedAt: new Date().toISOString(),
  network: "Base Mainnet",
  snapshot: {
    number: String(block.number),
    hash: block.hash,
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    finality: "finalized",
  },
  ...assessLaunchReadiness(evidence),
  runtimes,
  marketCount: count === null ? null : String(count),
  sampledMarkets: sampled,
  openMarkets: open,
  positionsCollateralAtomic: balance === null ? null : String(balance),
  operator: {
    address: manifest.admin,
    ethWei: adminEth === null ? null : String(adminEth),
    usdcAtomic: adminUsdc === null ? null : String(adminUsdc),
  },
  separatePool: {
    configured: Boolean(process.env.UPDOWN_POOL_ADDRESS),
    note: "UpDownPool is a separate, undeployed-by-default parimutuel protocol, not the CLOB Exchange. A configured address alone is not verification or launch readiness.",
  },
  errors,
  limitations: [
    "Does not read private production DB, signed orders, legal sign-off or independent audit results; those gates remain unknown.",
    "Collateral > 0 is not a directional purchase, funded executable orderbook or an E2E test.",
    "No flag is set and no transaction is generated.",
  ],
};
finish(report);
