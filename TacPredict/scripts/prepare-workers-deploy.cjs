// Release the audited custom fetch + scheduled wrapper, not Nitro's SSR-only entry.
const fs = require("node:fs"),
  path = require("node:path");
const modules = JSON.parse(fs.readFileSync(".output/worker-modules.json", "utf8"));
const out = ".output/cloudflare";
fs.mkdirSync(out, { recursive: true });
for (const m of modules) {
  const name = path.normalize(m.name);
  if (path.isAbsolute(name) || name.startsWith("..")) throw Error("Invalid module path");
  const file = path.join(out, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, m.content);
}
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (
  url !== "https://lmqaiqvwcytmgwgwyfwx.supabase.co" ||
  !key ||
  !key.startsWith("sb_publishable_")
)
  throw Error("Approved public Supabase configuration required");
if (/service_role|sb_secret_/.test(key))
  throw Error("Never bake server secrets into public settings");
const config = {
  name: "tacpredict-app",
  main: "entry.mjs",
  compatibility_date: "2026-10-16",
  compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
  no_bundle: true,
  find_additional_modules: true,
  rules: [{ type: "ESModule", globs: ["**/*.mjs"], fallthrough: true }],
  keep_vars: true,
  workers_dev: false,
  ai: { binding: "AI" },
  d1_databases: [
    {
      binding: "TAC_ACCOUNTS",
      database_name: "tacpredict-accounts",
      database_id: "7cde07f3-086b-480e-b023-3819582d03dd",
    },
  ],
  triggers: { crons: ["* * * * *", "*/15 * * * *"] },
  vars: { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key },
};
fs.writeFileSync(path.join(out, "wrangler.json"), JSON.stringify(config, null, 2));
console.log(
  "Prepared custom SSR + finalized indexer + scheduled discovery Worker. Secret bindings preserved, never exported.",
);
