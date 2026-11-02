/**
 * Deploys the seven virtual-set contracts (valueless vUSDC set, Base mainnet 8453) through the public CREATE2 proxy,
 * from the exact compiler initcode stored in protocol/deployments/virtual-base-mainnet.initcode.json.
 *
 * Why a script: the initcode is 2 to 10 KB of hex per contract. Copying it by hand into a wallet request is where
 * mistakes happen, and a wrong byte deploys a different contract at a different address (and Basescan cannot verify it).
 * Here nothing is typed: the bytes come from the file, and before anything is sent each contract is simulated on chain
 * and must return exactly the address recorded in the file.
 *
 *   node protocol/scripts/deploy-virtual-set.mjs --new-key
 *       Makes a throwaway deployer wallet on YOUR machine and prints it. Send it a little ETH on Base (about 0.0001).
 *       The private key is secret: never paste it in a chat or a file. It only pays gas; it owns nothing.
 *   node protocol/scripts/deploy-virtual-set.mjs
 *       Dry run (default). Checks every hash and address, reads the chain, simulates each deployment. Sends nothing.
 *   DEPLOYER_PRIVATE_KEY=0x... node protocol/scripts/deploy-virtual-set.mjs --send
 *       Sends the deployments that are still missing, in order. Contracts that already have code are skipped.
 *
 * The admin is NOT the deployer: it is fixed inside each constructor argument (the Base Account), so the deployer wallet
 * has no power over the contracts afterwards. Roles and the protocol list are set later by the admin.
 * Optional: BASE_RPC_URL (default https://mainnet.base.org).
 */
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getCreate2Address,
  http,
  keccak256,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const flags = new Set(process.argv.slice(2));

if (flags.has("--new-key")) {
  const key = generatePrivateKey();
  console.log("Deployer address (public): ", privateKeyToAccount(key).address);
  console.log("Deployer private key (SECRET):", key);
  console.log("\nSend about 0.0001 ETH on Base to the address, then clear this terminal.");
  process.exit(0);
}

const send = flags.has("--send");
const NAMES = [
  "VirtualUSDC",
  "VirtualMarketRegistry",
  "VirtualResolutionOracle",
  "VirtualMarketFactory",
  "VirtualConditionalPositions",
  "VirtualExchange",
  "VirtualSettlement",
];
const file = path.resolve(import.meta.dirname, "../deployments/virtual-base-mainnet.initcode.json");
const plan = JSON.parse(fs.readFileSync(file, "utf8"));

// 1. Offline checks: the file is internally consistent before the chain is touched.
if (plan.chain_id !== 8453) throw new Error("Base mainnet only");
if (plan.contracts.map((c) => c.name).join() !== NAMES.join())
  throw new Error("Unexpected contract list");
for (const c of plan.contracts) {
  if (keccak256(c.initcode) !== c.initCodeHash)
    throw new Error(`${c.name}: initcode does not match its hash`);
  const derived = getCreate2Address({
    from: plan.create2_proxy,
    salt: c.salt,
    bytecodeHash: c.initCodeHash,
  });
  if (derived.toLowerCase() !== c.address.toLowerCase())
    throw new Error(`${c.name}: salt and hash do not derive ${c.address}`);
}
console.log("File checks passed: seven initcodes match their hashes and CREATE2 addresses.");

// 2. Chain.
const transport = http(process.env.BASE_RPC_URL || "https://mainnet.base.org");
const pub = createPublicClient({ chain: base, transport });
if ((await pub.getChainId()) !== 8453) throw new Error("RPC is not Base mainnet");

let account;
let wallet;
if (send) {
  const key = process.env.DEPLOYER_PRIVATE_KEY ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("Set DEPLOYER_PRIVATE_KEY to the throwaway deployer key (see --new-key)");
  account = privateKeyToAccount(key);
  wallet = createWalletClient({ account, chain: base, transport });
  const balance = await pub.getBalance({ address: account.address });
  console.log(`Deployer ${account.address} holds ${formatEther(balance)} ETH on Base.`);
}
const from = account?.address ?? "0x0000000000000000000000000000000000000001";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function hasCode(address) {
  const code = await pub.getCode({ address });
  return Boolean(code) && code !== "0x";
}

/** Runs the deployment as an eth_call. The proxy returns the 20-byte address it would create. */
async function simulate(data) {
  const { data: returned } = await pub.call({ account: from, to: plan.create2_proxy, data });
  return (returned ?? "0x").toLowerCase();
}

let sent = 0;
let blocked = 0;
for (const c of plan.contracts) {
  if (await hasCode(c.address)) {
    console.log(`${c.name}: already deployed at ${c.address}`);
    continue;
  }
  const data = `${c.salt}${c.initcode.slice(2)}`;
  let returned;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      returned = await simulate(data);
      break;
    } catch (error) {
      if (attempt === 3) {
        if (send)
          throw new Error(`${c.name}: simulation failed: ${error.shortMessage ?? error.message}`);
        console.log(`${c.name}: cannot be simulated yet, an earlier contract is not deployed.`);
        blocked += 1;
      } else {
        await sleep(2000);
      }
    }
  }
  if (returned === undefined) continue;
  if (returned !== c.address.toLowerCase())
    throw new Error(
      `${c.name}: simulation returned ${returned}, expected ${c.address}. Nothing was sent.`,
    );
  console.log(`${c.name}: simulation returns ${c.address} as expected.`);
  if (!send) continue;

  const gas = await pub.estimateGas({ account, to: plan.create2_proxy, data });
  if (gas > 6_000_000n) throw new Error(`${c.name}: unexpected gas ${gas}, review required`);
  const hash = await wallet.sendTransaction({
    to: plan.create2_proxy,
    data,
    gas: gas + gas / 5n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${c.name}: transaction failed (${hash})`);
  for (let attempt = 1; attempt <= 5 && !(await hasCode(c.address)); attempt += 1)
    await sleep(2000);
  if (!(await hasCode(c.address)))
    throw new Error(`${c.name}: no code at ${c.address} after ${hash}`);
  sent += 1;
  console.log(
    JSON.stringify({
      contract: c.name,
      address: c.address,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
    }),
  );
}

if (!send)
  console.log(
    `\nDry run only, nothing was sent.${blocked ? ` ${blocked} contract(s) can only be simulated after the earlier ones exist.` : ""}\nTo deploy: DEPLOYER_PRIVATE_KEY=0x... node protocol/scripts/deploy-virtual-set.mjs --send`,
  );
else
  console.log(
    `\nDone: ${sent} contract(s) deployed. Tell Claude, it checks the chain and sets roles and the protocol list.`,
  );
