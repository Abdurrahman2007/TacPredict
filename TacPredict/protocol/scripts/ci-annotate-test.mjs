/**
 * CI helper: re-runs the named test files and prints their failure text as workflow annotations, so a
 * failed check can be read from the checks API. Read-only; it runs the same tests again and nothing else.
 * Usage: node ci-annotate-test.mjs <test file> [...]
 */
import { spawnSync } from "node:child_process";
const files = process.argv.slice(2);
const run = spawnSync(process.execPath, ["--test", ...files], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const text = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const first = text.search(/not ok|Error|AssertionError/);
const body = (first >= 0 ? text.slice(Math.max(0, first - 200)) : text.slice(-3000)).replace(/\u001b\[[0-9;]*m/g, "");
const enc = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const size = 3000;
for (let n = 0; n < 9 && n * size < body.length; n += 1)
  console.log(`::notice title=test-output.${n}::${enc(body.slice(n * size, (n + 1) * size))}`);
console.log(`::notice title=test-exit::status=${run.status}`);
