/** Isolated PostgreSQL 17.9 tests only. Does not load .env or connect to any external database. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const protocol = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (
  args.length &&
  (args.length !== 2 || args[0] !== "--schema-snapshot" || !args[1].startsWith("/"))
)
  throw Error("Only --schema-snapshot /absolute/local/path is supported");
const snapshot = args.length ? args[1] : null;
const native = join(protocol, "test/sql-runtime/node_modules/@embedded-postgres/linux-x64/native");
if (
  process.platform !== "linux" ||
  process.arch !== "x64" ||
  !existsSync(join(native, "bin/initdb"))
)
  throw Error("Pinned isolated Linux x64 test runtime is required; no external DB fallback");
const dir = mkdtempSync(join(tmpdir(), "tacpredict-pg-"));
mkdirSync(join(dir, "socket"), { mode: 0o700 });
writeFileSync(
  join(dir, "test-runtime.json"),
  JSON.stringify({ purpose: "tacpredict-isolated-postgres-tests", pid: process.pid }),
  { mode: 0o600 },
);
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: "C",
  LC_ALL: "C",
  LD_LIBRARY_PATH: join(native, "lib"),
  TACP_LOCAL_PG_SOCKET: join(dir, "socket"),
  TACP_LOCAL_PG_RUNNER_PID: String(process.pid),
  ...(snapshot ? { TACP_LOCAL_SCHEMA_SNAPSHOT: snapshot } : {}),
};
const run = (bin, args) => {
  const r = spawnSync(join(native, "bin", bin), args, {
    env,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  if (r.status !== 0) throw Error(`${bin} failed: ${r.error?.message || r.stderr || r.stdout}`);
  return r.stdout.trim();
};
let started = false,
  status = 1;
try {
  run("initdb", [
    "-D",
    join(dir, "data"),
    "-U",
    "postgres",
    "--auth-local=trust",
    "--auth-host=reject",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  started = true; // Also attempt shutdown if startup wait fails after launching postgres.
  run("pg_ctl", [
    "-D",
    join(dir, "data"),
    "-l",
    join(dir, "server.log"),
    "-w",
    "start",
    "-o",
    `-k ${join(dir, "socket")} -c listen_addresses='' -p 5432`,
  ]);
  console.log(run("postgres", ["--version"]) + "; private Unix socket only, no TCP listener");
  const r = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "test/supabase-security-sql.test.mjs",
      "test/supabase-security-concurrency.test.mjs",
      ...(snapshot ? ["test/live-schema-staging.test.mjs"] : []),
    ],
    { cwd: protocol, env, stdio: "inherit", timeout: 120000 },
  );
  if (r.error) throw r.error;
  status = r.status ?? 1;
} finally {
  let safeToRemove = !started;
  if (started) {
    try {
      run("pg_ctl", ["-D", join(dir, "data"), "-w", "stop", "-m", "fast"]);
      safeToRemove = true;
    } catch (e) {
      console.error(e.message);
      status = 1;
      safeToRemove = !existsSync(join(dir, "data", "postmaster.pid"));
    }
  }
  if (safeToRemove) rmSync(dir, { recursive: true, force: true });
  else
    console.error(
      "Local test runtime retained: shutdown unconfirmed; no production database was used.",
    );
}
process.exit(status);
