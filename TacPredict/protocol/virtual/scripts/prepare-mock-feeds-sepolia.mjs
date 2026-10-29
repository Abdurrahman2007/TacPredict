/**
 * Prepare unsigned MockFeed deploys for Base Sepolia (AggregatorV3-compatible).
 * Mainnet Chainlink addresses have no code on Sepolia — required for configurePricePolicy.
 * Does not broadcast. Does not touch private keys.
 *
 * Usage:
 *   VIRTUAL_TESTNET_RPC_URL=https://sepolia.base.org \
 *   node scripts/prepare-mock-feeds-sepolia.mjs launch/approved-sepolia/mock-feeds-unsigned.json
 */
import fs from "node:fs";
import { createPublicClient, http, encodeDeployData, keccak256 } from "viem";
import { baseSepolia } from "viem/chains";
import { compile } from "./compile.mjs";

const outPath = process.argv[2];
if (!outPath) throw Error("Usage: node scripts/prepare-mock-feeds-sepolia.mjs out.json");
const rpc = process.env.VIRTUAL_TESTNET_RPC_URL || "https://sepolia.base.org";
const from = process.argv[3] || "0x6397A026560e7b66584F087739b15AE2bda8610f";

const c = createPublicClient({
  chain: baseSepolia,
  transport: http(rpc, { timeout: 20000, retryCount: 1 }),
});
if ((await c.getChainId()) !== 84532) throw Error("RPC is not Base Sepolia");

const compiled = compile({
  "MockFeed.sol": {
    content: `pragma solidity ^0.8.30; contract MockFeed {struct R {int256 price;uint256 at;} mapping(uint80=>R) public rounds;uint80 public last;function decimals() external pure returns(uint8){return 8;}function push(int256 p,uint256 at) external {rounds[++last]=R(p,at);}function latestRoundData() external view returns(uint80,int256,uint256,uint256,uint80){R memory r=rounds[last];return(last,r.price,r.at,r.at,last);}function getRoundData(uint80 n) external view returns(uint80,int256,uint256,uint256,uint80){R memory r=rounds[n];return(n,r.price,r.at,r.at,n);}}`,
  },
});
const art = compiled["MockFeed.sol"].MockFeed;
const data = encodeDeployData({
  abi: art.abi,
  bytecode: "0x" + art.evm.bytecode.object,
  args: [],
});
const gas = await c.estimateGas({ account: from, data, value: 0n });

const payload = {
  reviewOnly: true,
  chainId: 84532,
  from,
  purpose: "Deploy MockFeed twice: (1) BTC price feed (2) sequencer (push answer=0, since=now-4001)",
  deploy: {
    to: null,
    value: "0x0",
    data,
    gasEstimate: gas.toString(),
    initCodeHash: keccak256(data),
  },
  afterDeploy: {
    pushPrice: 'cast send $FEED "push(int256,uint256)" <price8decimals> <unixTs> --rpc-url $RPC --private-key "$MY_LOCAL_KEY"',
    pushSequencerUp:
      'cast send $SEQ "push(int256,uint256)" 0 $(($(date +%s)-4001)) --rpc-url $RPC --private-key "$MY_LOCAL_KEY"',
  },
  warning: "Unsigned only. Sign on your machine. No Mainnet.",
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log("Unsigned MockFeed deploy prepared; no transaction submitted.");
