/** Test-only adapter. Accepts ONLY a private socket created by our ephemeral local runner.
 * No DATABASE_URL, Supabase endpoint, TCP host, password or production config is accepted.
 */
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { randomBytes } from "node:crypto";
export async function createLocalPostgresDatabase() {
  const socket = process.env.TACP_LOCAL_PG_SOCKET;
  if (
    !socket ||
    !socket.startsWith("/") ||
    basename(socket) !== "socket" ||
    !basename(dirname(socket)).startsWith("tacpredict-pg-")
  )
    throw Error("Only the isolated runner socket is allowed");
  if ((await realpath(socket)) !== socket) throw Error("Symlinked socket path is not allowed");
  const marker = JSON.parse(await readFile(join(dirname(socket), "test-runtime.json"), "utf8"));
  const st = await stat(dirname(socket));
  if (
    marker.purpose !== "tacpredict-isolated-postgres-tests" ||
    marker.pid !== Number(process.env.TACP_LOCAL_PG_RUNNER_PID) ||
    st.uid !== process.getuid() ||
    (st.mode & 0o077) !== 0
  )
    throw Error("Untrusted local test runtime");
  const { default: pg } = await import("../sql-runtime/node_modules/pg/lib/index.js");
  const config = { host: socket, port: 5432, user: "postgres", connectionTimeoutMillis: 5000 };
  const admin = new pg.Client({ ...config, database: "postgres" });
  await admin.connect();
  const name = "tacpredict_security_" + randomBytes(8).toString("hex");
  await admin.query(`CREATE DATABASE "${name}"`);
  const sessions = new Set();
  async function newSession() {
    const c = new pg.Client({ ...config, database: name });
    await c.connect();
    sessions.add(c);
    return {
      query: (...a) => c.query(...a),
      exec: (s) => c.query(s),
      close: async () => {
        sessions.delete(c);
        await c.end();
      },
    };
  }
  const first = await newSession();
  return {
    ...first,
    newSession,
    close: async () => {
      await Promise.all([...sessions].map((c) => c.end()));
      sessions.clear();
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}
