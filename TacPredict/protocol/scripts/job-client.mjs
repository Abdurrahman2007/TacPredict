import { randomUUID } from "node:crypto";
export function createDatabaseClient(env) {
  const base = env.SUPABASE_URL,
    key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || new URL(base).hostname !== "lmqaiqvwcytmgwgwyfwx.supabase.co" || !key)
    throw Error("Main Supabase server configuration required");
  return async function db(resource, body, query = "") {
    const headers = {
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    };
    if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
    const r = await fetch(`${base}/rest/v1/${resource}${query}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw Error(`Protocol database rejected ${resource}: ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
}
export async function withProtocolLease(db, chain, job, work) {
  const owner = randomUUID();
  const args = { _chain: chain, _job: job, _owner: owner };
  if (!(await db("rpc/acquire_protocol_job_lease", { ...args, _seconds: 180 }))) {
    console.log(
      JSON.stringify({ chain, job, status: "skipped", reason: "Another writer owns the lease" }),
    );
    return;
  }
  let lost = false,
    pending = false;
  const heartbeat = setInterval(() => {
    if (pending || lost) return;
    pending = true;
    void db("rpc/renew_protocol_job_lease", { ...args, _seconds: 180 })
      .then((ok) => {
        if (!ok) lost = true;
      })
      .catch(() => {
        lost = true;
      })
      .finally(() => {
        pending = false;
      });
  }, 45000);
  heartbeat.unref();
  const assert = async () => {
    if (lost || !(await db("rpc/renew_protocol_job_lease", { ...args, _seconds: 180 }))) {
      lost = true;
      throw Error("Job fencing lease lost; halt");
    }
  };
  let run;
  try {
    const rows = await db("protocol_job_runs", { chain_id: chain, job, status: "RUNNING" });
    run = rows?.[0]?.id;
    await work({ owner, assert });
    if (run) await fetchUpdate(db, run, "SUCCESS");
  } catch (e) {
    if (run) await fetchUpdate(db, run, "FAILED").catch(() => {});
    throw e;
  } finally {
    clearInterval(heartbeat);
    await db("rpc/release_protocol_job_lease", args).catch(() => {});
  }
}
async function fetchUpdate(db, id, status) {
  await db("rpc/finish_protocol_job_run", { _id: id, _status: status });
}
export function safeError(error, env) {
  let text = error instanceof Error ? error.message : String(error);
  for (const [k, v] of Object.entries(env))
    if (v && /KEY|SECRET|TOKEN|PASSWORD|RPC_URL/.test(k)) text = text.split(v).join("[redacted]");
  return text.slice(0, 1500);
}
