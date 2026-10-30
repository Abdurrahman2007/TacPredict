import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("token logos are the real upstream icons, never hand-drawn text badges", () => {
  for (const name of ["btc", "eth", "sol", "bnb"]) {
    const path = `public/brand/crypto/${name}.svg`;
    assert.ok(existsSync(new URL(path, root)), `${name} logo is installed`);
    const svg = read(path);
    assert.ok(svg.startsWith("<svg"), `${name} is an svg`);
    assert.ok(!svg.includes("<text"), `${name} must not be a typed label`);
  }
  assert.ok(read("public/brand/crypto/bnb.svg").includes("#F3BA2F"), "BNB keeps its brand yellow");
  assert.ok(read("public/brand/crypto/LICENSE.md").includes("cryptocurrency-icons"));
});

test("opening the app is direct, with no intro overlay or animation component", () => {
  const shell = read("src/components/app-shell.tsx");
  assert.ok(!shell.includes("BrandIntro"));
  assert.ok(!existsSync(new URL("src/components/brand-intro.tsx", root)));
  assert.ok(!existsSync(new URL("src/styles/prediction-intro.css", root)));
  assert.ok(!existsSync(new URL("public/brand/tacpredict-intro.mp4.b64", root)));
});

test("every logo is requested through the versioned helper so a replaced logo is never served from an old cache", () => {
  const files = [
    "src/components/market-icon.tsx",
    "src/components/up-down-section.tsx",
    "src/components/updown/island.tsx",
    "src/components/updown/sections.tsx",
    "src/components/updown/updown-detail.tsx",
    "src/components/prelaunch-markets.tsx",
  ];
  for (const file of files) {
    const text = read(file);
    assert.ok(text.includes("cryptoLogoUrl"), `${file} uses the versioned logo helper`);
    assert.ok(!/`\/brand\/crypto\//.test(text), `${file} has no hard-coded logo path`);
  }
  assert.match(read("src/lib/crypto-logo.ts"), /\?v=\$\{LOGO_VERSION\}/);
});

test("the supplied blue-white mark is shared by public, auth, admin and wallet surfaces", () => {
  const brand = read("src/lib/brand.ts");
  assert.ok(brand.includes('blue-white-20261022'));
  for (const file of ["src/components/brand-mark.tsx", "src/components/auth-panel.tsx", "src/components/admin/admin-login.tsx", "src/components/admin/admin-shell.tsx"])
    assert.ok(read(file).includes("BRAND_LOGO_URL"), `${file} shares the supplied mark`);
  assert.ok(read("src/lib/onchain/coinbase-auth.ts").includes("appLogoUrl: BRAND_LOGO_ABSOLUTE_URL"));
  assert.ok(read("src/lib/web3/config.ts").includes("appIcon: BRAND_WALLET_ICON_URL"));
  assert.equal(read("public/brand/tacpredict.svg"), read("public/brand/tacpredict-object.svg"));
  assert.ok(read("public/brand/tacpredict.svg").includes("data:image/png;base64,"));
  for (const file of ["src/components/admin/admin-login.tsx", "src/components/admin/admin-shell.tsx"])
    assert.ok(!/aria-hidden="true">\s*TP\s*</.test(read(file)), "old admin TP badge is replaced");
});

test("browser and share logo variants are generated from versioned brand assets", () => {
  const data = JSON.parse(read("scripts/brand-assets.json"));
  assert.equal(data.sourceSha256.length, 64);
  for (const file of ["public/favicon.ico", "public/brand/apple-touch-icon-v2.png", "public/brand/app-icon-v2.png", "public/brand/social-logo-v2.png"])
    assert.ok(Buffer.from(data.assets[file], "base64").length > 500, `${file} has actual image data`);
  const social = Buffer.from(data.assets["public/brand/social-logo-v2.png"], "base64");
  assert.equal(social.readUInt32BE(16), 1200);
  assert.equal(social.readUInt32BE(20), 630);
  const rootUi = read("src/routes/__root.tsx");
  assert.ok(rootUi.includes("apple-touch-icon"));
  assert.ok(rootUi.includes('property: "og:image", content: BRAND_SOCIAL_URL'));
  assert.ok(rootUi.includes('name: "twitter:image", content: BRAND_SOCIAL_URL'));
  assert.ok(JSON.parse(read("package.json")).scripts.prebuild.includes("build-brand-assets.cjs"));
});


test("scroll discovery is in-page and the page has no site footer", () => {
  const discovery = read("src/components/market-discovery.tsx");
  assert.ok(discovery.includes("IntersectionObserver"));
  assert.ok(discovery.includes("prefers-reduced-motion"));
  assert.ok(discovery.includes("if (!visible || reduced) return"));
  assert.ok(!discovery.includes("sessionStorage"));
  assert.ok(discovery.includes("@/styles/market-discovery.css"));
  // The footer was removed on request (twice). It must not come back through an old merge.
  const shell = read("src/components/app-shell.tsx");
  assert.ok(!shell.includes("SiteFooter"));
  assert.ok(!shell.includes("<footer"));
  assert.ok(!existsSync(new URL("src/components/site-footer.tsx", root)));
  assert.ok(!existsSync(new URL("src/styles/site-footer.css", root)));
  assert.ok(!read("src/styles/market-discovery.css").includes("tp-site-footer"));
  // Home is crypto Up/Down first; MarketDiscovery remains available as a component.
  assert.ok(read("src/components/market-discovery.tsx").includes("export function MarketDiscovery"));
  assert.ok(read("src/routes/index.tsx").includes("UpDownSection"));
});
