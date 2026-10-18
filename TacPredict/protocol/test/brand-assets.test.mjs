import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("token logos are the real upstream icons, never hand-drawn text badges", () => {
  for (const name of ["btc", "eth", "sol", "bnb", "xrp"]) {
    const path = `public/brand/crypto/${name}.svg`;
    assert.ok(existsSync(new URL(path, root)), `${name} logo is installed`);
    const svg = read(path);
    assert.ok(svg.startsWith("<svg"), `${name} is an svg`);
    assert.ok(!svg.includes("<text"), `${name} must not be a typed label`);
  }
  assert.ok(read("public/brand/crypto/bnb.svg").includes("#F3BA2F"), "BNB keeps its brand yellow");
  assert.ok(read("public/brand/crypto/LICENSE.md").includes("cryptocurrency-icons"));
});

test("opening animation uses only real shipped logos, carries no price figures and stays reload-based", () => {
  const ui = read("src/components/brand-intro.tsx");
  for (const name of ["btc", "eth", "sol", "bnb"]) assert.ok(ui.includes(`key: "${name}"`));
  assert.ok(ui.includes("/brand/crypto/"));
  assert.ok(!/\$\s?\d|\d{2,}[.,]\d{2}/.test(ui), "no price-like figures in the opening scene");
  assert.ok(ui.includes("prefers-reduced-motion"));
  assert.ok(ui.includes("useState(true)"));
  assert.ok(!/localStorage|sessionStorage|Math\.random/.test(ui));
  const css = read("src/styles/prediction-intro.css");
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.ok(css.includes("visibility: hidden"), "the scene removes itself even before scripts run");
});
