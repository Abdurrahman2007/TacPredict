/**
 * Patch local .env with Sepolia VirtualPriceAMM config (does not print secrets).
 * Usage: node protocol/virtual/scripts/apply-sepolia-virtual-env.mjs
 * Never commits .env. Never touches private keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const envPath = path.join(root, ".env");
const cfgPath = path.join(
  root,
  "protocol/virtual/launch/approved-sepolia/virtual-trading-config.json",
);
if (!fs.existsSync(cfgPath)) throw Error("missing virtual-trading-config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
// Strict schema — strip unknown keys if present
const { notes: _n, ...clean } = cfg;
const minified = JSON.stringify(clean);
const sepoliaRpc = "https://sepolia.base.org";

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
function upsert(key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(env)) env = env.replace(re, line);
  else env = env.trimEnd() + `\n${line}\n`;
}
upsert("BASE_SEPOLIA_PROTOCOL_RPC_URL", sepoliaRpc);
upsert("VIRTUAL_TRADING_CONFIG", minified);
fs.writeFileSync(envPath, env.endsWith("\n") ? env : env + "\n");
console.log(
  JSON.stringify({
    wrote: ".env (local only)",
    engine: clean.engine,
    chainId: clean.chainId,
    enabled: clean.enabled,
    configChars: minified.length,
    baseSepoliaRpc: sepoliaRpc,
  }),
);
