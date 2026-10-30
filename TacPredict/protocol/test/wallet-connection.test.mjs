import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ACCESS_LABEL, walletAccess } from "../../src/lib/onchain/wallet-access.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("only a missing wallet opens the connect modal; a connected wallet is never asked to connect again", () => {
  assert.equal(walletAccess({ address: null, signedIn: false }), "connect");
  assert.equal(walletAccess({ address: undefined, signedIn: true }), "connect");
  assert.equal(walletAccess({ address: `0x${"1".repeat(40)}`, signedIn: false }), "verify");
  assert.equal(walletAccess({ address: `0x${"1".repeat(40)}`, signedIn: true }), "ready");
  assert.equal(ACCESS_LABEL.connect, "Connect wallet");
  assert.equal(ACCESS_LABEL.verify, "Verify wallet");
  assert.equal(ACCESS_LABEL.ready, "");
});

test("the wallet connected in wagmi is mirrored without asking the wallet to connect again", () => {
  const wallet = read("src/lib/onchain/wallet.tsx");
  const adopt = wallet.slice(wallet.indexOf("const adopt = useCallback"), wallet.indexOf("const connect = async"));
  assert.ok(adopt.length > 100, "adopt() exists");
  assert.ok(!adopt.includes("eth_requestAccounts"), "adopt never prompts");
  assert.ok(!adopt.includes("request("), "adopt makes no wallet request");
  // A restored session may report no accounts; that must not turn into "Not connected".
  assert.ok(wallet.includes("adopted.current"));
  assert.ok(wallet.includes("fixed ? Promise.resolve([fixed])"));

  const bridge = read("src/components/providers/wagmi-base-bridge.tsx");
  assert.ok(bridge.includes("adopt({ address, chainId: chainId ?? null })"), "mirrors right away");
  assert.ok(bridge.includes("adopt({ address, chainId: chainId ?? null, provider })"));
  assert.ok(!/\bconnect\(\{/.test(bridge), "the bridge no longer calls the prompting connect()");
  assert.ok(bridge.includes("withTimeout(connector.getProvider()"), "a silent wallet cannot block it");
  assert.ok(bridge.includes("signInWithEthereumWallet(provider, address)"));
  // Restored connections still never open a signature request.
  assert.ok(bridge.includes('if (decision === "skip") return;'));
});

test("sign-in reuses the connected account before it would ask the wallet to connect", () => {
  const auth = read("src/lib/onchain/wallet-auth.ts");
  const known = auth.indexOf("knownAddress &&");
  const request = auth.indexOf('method: "eth_requestAccounts"');
  assert.ok(known > 0 && request > known, "known address is tried first");
});

test("every wallet-gated button follows the shared access state", () => {
  for (const file of [
    "src/components/virtual/virtual-amount-card.tsx",
    "src/components/account-menu.tsx",
    "src/components/account-pages.tsx",
    "src/components/native-portfolio.tsx",
    "src/components/wallet-connect-button.inner.tsx",
  ]) {
    const text = read(file);
    assert.ok(text.includes("useWalletAccess"), `${file} uses the shared access state`);
    assert.ok(!/\blogin\(/.test(text), `${file} does not open the connect modal directly`);
  }
  const hook = read("src/hooks/use-wallet-access.ts");
  assert.ok(hook.includes('if (state === "connect")'));
  assert.ok(hook.includes("signInWithEthereumWallet(provider, address)"));
});

test("the connect modal shows the official Coinbase Wallet mark, never the library's own logo", () => {
  const wallet = read("src/lib/web3/preferred-wallet.ts");
  assert.ok(wallet.includes("iconUrl: COINBASE_WALLET_ICON_URL"));
  assert.ok(wallet.includes('name: "Wallet"'));
  const brand = read("src/lib/brand.ts");
  assert.match(brand, /COINBASE_WALLET_ICON_URL = `\/brand\/providers\/coinbase\.svg\?v=\$\{BRAND_VERSION\}`/);
  const svg = read("public/brand/providers/coinbase.svg");
  assert.ok(svg.includes("#0052FF"));
  assert.ok(!svg.includes("<text"));
  assert.ok(read("public/brand/providers/SOURCES.md").includes("@coinbase/wallet-sdk"));
  assert.ok(existsSync(new URL("public/brand/providers/COINBASE_LICENSE.txt", root)));
});

test("browser icons are raster files with a versioned address, so no old logo survives in a tab or on a phone", () => {
  const rootRoute = read("src/routes/__root.tsx");
  assert.ok(!rootRoute.includes("image/svg+xml"), "no SVG favicon for phones to ignore");
  for (const name of ["BRAND_FAVICON_ICO_URL", "BRAND_FAVICON_PNG_URL", "BRAND_TOUCH_ICON_URL", "BRAND_SOCIAL_URL"])
    assert.ok(rootRoute.includes(name), `${name} is used in the page head`);
  const brand = read("src/lib/brand.ts");
  for (const name of [
    "BRAND_SOCIAL_URL",
    "BRAND_WALLET_ICON_URL",
    "BRAND_FAVICON_ICO_URL",
    "BRAND_FAVICON_PNG_URL",
    "BRAND_TOUCH_ICON_URL",
  ])
    assert.match(brand, new RegExp(`${name} =[^\\n]*\\?v=\\$\\{BRAND_VERSION\\}`), `${name} is versioned`);
  const built = Object.keys(JSON.parse(read("scripts/brand-assets.json")).assets);
  for (const file of ["public/favicon.ico", "public/brand/app-icon-v2.png", "public/brand/apple-touch-icon-v2.png"])
    assert.ok(built.includes(file), `${file} is produced from the supplied logo`);
  // The sign-in email points at a file that really exists.
  const mail = read("supabase/templates/verification.html");
  const logo = mail.match(/https:\/\/tacpredict\.fun\/(brand\/[a-z0-9-]+\.png)/);
  assert.ok(logo && built.includes(`public/${logo[1]}`), "email logo is an existing brand asset");
  assert.ok(!read("supabase/templates/README.md").includes("favicon.png"));
});
