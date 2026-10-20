/**
 * Makes a brand-new wallet for the Up/Down price reporter, on YOUR machine.
 * Run it in Codespaces or Termux after `npm ci`:   node protocol/scripts/new-reporter-wallet.mjs
 *  - the ADDRESS is public: paste it into Admin -> Up/Down pool -> Setup -> "Grant reporter role", and send it some ETH on Base for gas;
 *  - the PRIVATE KEY is secret: store it only as the Cloudflare Worker secret POOL_REPORTER_PRIVATE_KEY. Never paste it into a chat,
 *    a file in the repository, or a screenshot. This wallet can only post prices; it cannot move user funds.
 * Nothing is written to disk and nothing is sent over the network.
 */
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";

const key = generatePrivateKey();
console.log("Reporter address (public):      ", privateKeyToAddress(key));
console.log("Reporter private key (SECRET):  ", key);
console.log("\nStore the private key as the Worker secret POOL_REPORTER_PRIVATE_KEY, then clear this terminal.");
