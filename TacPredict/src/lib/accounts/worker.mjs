import { normalizeUsername, referralCode, validSignup } from "./rules.mjs";
const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Vary: "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
function string(v, max = 200) {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw fail(400, "Invalid input");
  return v.trim();
}
function checkedName(value) {
  try {
    return normalizeUsername(value);
  } catch (e) {
    throw fail(400, e.message);
  }
}
async function body(req) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw fail(415, "JSON required");
  if (Number(req.headers.get("content-length") || 0) > 4096) throw fail(413, "Request too large");
  let text = "",
    bytes = 0;
  const reader = req.body?.getReader(),
    decoder = new TextDecoder();
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          throw fail(413, "Request too large");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const v = JSON.parse(text);
    if (!v || Array.isArray(v) || typeof v !== "object") throw Error();
    return v;
  } catch {
    throw fail(400, "Invalid JSON");
  }
}
async function auth(req, env, fetcher) {
  const token = req.headers.get("Authorization");
  if (!token?.startsWith("Bearer ") || token.length > 8192)
    throw fail(401, "Sign in with your wallet to continue");
  const r = await fetcher(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: token },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw fail(401, "Session expired. Sign in again.");
  const u = await r.json();
  if (!/^[0-9a-f-]{36}$/i.test(u.id)) throw fail(401, "Invalid session");
  return u;
}
async function admin(req, env, fetcher) {
  const r = await fetcher(env.SUPABASE_URL + "/rest/v1/rpc/get_market_import_admin", {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: req.headers.get("Authorization"),
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw fail(403, "Assigned administrator with MFA required");
  await r.body?.cancel();
}
async function limit(db, id, scope, max) {
  const minute = Math.floor(Date.now() / 60000);
  const r = await db
    .prepare(
      "INSERT INTO account_rate(user_id,scope,minute,count) VALUES(?,?,?,1) ON CONFLICT(user_id,scope) DO UPDATE SET count=CASE WHEN minute=excluded.minute THEN count+1 ELSE 1 END,minute=excluded.minute RETURNING count",
    )
    .bind(id, scope, minute)
    .first();
  if (r.count > max) throw fail(429, "Please wait a minute and try again");
}
async function profile(db, id) {
  return db.prepare("SELECT * FROM account_profiles WHERE user_id=?").bind(id).first();
}
async function own(db, id) {
  const p = await profile(db, id);
  if (!p) throw fail(409, "Account setup is not complete. Retry.");
  const stats = await db
    .prepare(
      "SELECT count(*) AS invited,coalesce(sum(CASE WHEN status='credited' THEN amount_units ELSE 0 END),0) AS earned,coalesce(sum(CASE WHEN status='pending' THEN amount_units ELSE 0 END),0) AS pending FROM account_referral_rewards WHERE inviter_id=?",
    )
    .bind(id)
    .first();
  const rows = await db
    .prepare(
      "SELECT p.username,r.amount_units,r.status,r.created_at FROM account_referral_rewards r JOIN account_profiles p ON p.user_id=r.invitee_id WHERE r.inviter_id=? ORDER BY r.created_at DESC LIMIT 50",
    )
    .bind(id)
    .all();
  const inviter = p.referred_by
    ? await db
        .prepare("SELECT username FROM account_profiles WHERE user_id=?")
        .bind(p.referred_by)
        .first()
    : null;
  return {
    profile: {
      username: p.username,
      referralCode: p.referral_code,
      status: p.status,
      createdAt: p.created_at,
      referredBy: inviter?.username ?? null,
    },
    stats,
    referrals: rows.results,
    policy: await db
      .prepare("SELECT enabled,reward_units,review_required FROM account_policy WHERE id=1")
      .first(),
  };
}
export async function handleAccounts(req, env, fetcher = fetch) {
  try {
    const url = new URL(req.url),
      path = url.pathname.replace("/api/account", "");
    if (!["GET", "POST"].includes(req.method)) throw fail(405, "Method not allowed");
    if (
      req.method === "POST" &&
      ((req.headers.get("origin") && req.headers.get("origin") !== url.origin) ||
        req.headers.get("sec-fetch-site") === "cross-site")
    )
      throw fail(403, "Same-origin requests only");
    if (!env.TAC_ACCOUNTS) throw fail(503, "Account service is not configured");
    const u = await auth(req, env, fetcher),
      db = env.TAC_ACCOUNTS;
    await limit(db, u.id, req.method, req.method === "POST" ? 20 : 90);
    if (path.startsWith("/admin")) {
      await admin(req, env, fetcher);
      if (path === "/admin" && req.method === "GET") {
        const page = Math.max(
          0,
          Math.min(9999, Number.parseInt(url.searchParams.get("page") || "0") || 0),
        );
        const search = (url.searchParams.get("search") || "").replace(/[\\%_]/g, "").slice(0, 80);
        const term = "%" + search + "%";
        const rows = await db
          .prepare(
            "SELECT p.*,i.username AS inviter_name,(SELECT count(*) FROM account_referral_rewards WHERE inviter_id=p.user_id) AS invited,(SELECT coalesce(sum(amount_units),0) FROM account_referral_rewards WHERE inviter_id=p.user_id AND status='credited') AS earned FROM account_profiles p LEFT JOIN account_profiles i ON i.user_id=p.referred_by WHERE p.username LIKE ? OR p.referral_code LIKE ? OR p.user_id LIKE ? ORDER BY p.created_at DESC LIMIT 25 OFFSET ?",
          )
          .bind(term, term, term, page * 25)
          .all();
        const total = await db
          .prepare(
            "SELECT count(*) AS count FROM account_profiles WHERE username LIKE ? OR referral_code LIKE ? OR user_id LIKE ?",
          )
          .bind(term, term, term)
          .first();
        return json({
          rows: rows.results,
          total: total.count,
          page,
          policy: await db.prepare("SELECT * FROM account_policy WHERE id=1").first(),
        });
      }
      if (path === "/admin/detail" && req.method === "GET") {
        const id = string(url.searchParams.get("id"), 36);
        const p = await profile(db, id);
        if (!p) throw fail(404, "Account not found");
        const rewards = await db
          .prepare(
            "SELECT r.*,p.username FROM account_referral_rewards r JOIN account_profiles p ON p.user_id=r.invitee_id WHERE r.inviter_id=? ORDER BY r.created_at DESC LIMIT 100",
          )
          .bind(id)
          .all();
        const audit = await db
          .prepare("SELECT * FROM account_audit WHERE target=? ORDER BY created_at DESC LIMIT 25")
          .bind(id)
          .all();
        return json({ profile: p, rewards: rewards.results, audit: audit.results });
      }
      if (path === "/admin/update" && req.method === "POST") {
        const v = await body(req),
          reason = string(v.reason, 300),
          id = string(v.userId, 36),
          p = await profile(db, id);
        if (!p) throw fail(404, "Account not found");
        const statements = [];
        let before = p;
        if (v.action === "username") {
          const name = checkedName(v.value);
          statements.push(
            db
              .prepare("UPDATE account_profiles SET username=?,renamed_at=? WHERE user_id=?")
              .bind(name, now(), id),
          );
        } else if (v.action === "status") {
          if (!["active", "suspended"].includes(v.value)) throw fail(400, "Invalid status");
          statements.push(
            db.prepare("UPDATE account_profiles SET status=? WHERE user_id=?").bind(v.value, id),
          );
        } else if (v.action === "code") {
          const code = referralCode(v.value);
          if (!code) throw fail(400, "Use a 16-character hexadecimal code");
          statements.push(
            db
              .prepare("INSERT INTO account_referral_codes(code,user_id,created_at) VALUES(?,?,?)")
              .bind(code, id, now()),
          );
          statements.push(
            db
              .prepare("UPDATE account_profiles SET referral_code=? WHERE user_id=?")
              .bind(code, id),
          );
        } else if (v.action === "reward") {
          if (!["credited", "pending", "revoked"].includes(v.value))
            throw fail(400, "Invalid reward status");
          before = await db
            .prepare("SELECT * FROM account_referral_rewards WHERE invitee_id=?")
            .bind(id)
            .first();
          if (!before) throw fail(404, "Reward not found");
          statements.push(
            db
              .prepare(
                "UPDATE account_referral_rewards SET status=?,updated_at=? WHERE invitee_id=?",
              )
              .bind(v.value, now(), id),
          );
        } else throw fail(400, "Invalid action");
        statements.push(
          db
            .prepare("INSERT INTO account_audit VALUES(?,?,?,?,?,?,?,?)")
            .bind(
              crypto.randomUUID(),
              u.id,
              v.action,
              id,
              reason,
              JSON.stringify(before),
              JSON.stringify({ value: v.value }),
              now(),
            ),
        );
        await db.batch(statements);
        return json({ ok: true });
      }
      if (path === "/admin/policy" && req.method === "POST") {
        const v = await body(req);
        if (
          typeof v.enabled !== "boolean" ||
          typeof v.reviewRequired !== "boolean" ||
          !Number.isInteger(v.rewardUnits) ||
          v.rewardUnits < 0 ||
          v.rewardUnits > 1000
        )
          throw fail(400, "Invalid policy");
        const reason = string(v.reason, 300);
        const before = await db.prepare("SELECT * FROM account_policy WHERE id=1").first();
        await db.batch([
          db
            .prepare(
              "UPDATE account_policy SET enabled=?,reward_units=?,review_required=?,updated_at=? WHERE id=1",
            )
            .bind(Number(v.enabled), v.rewardUnits, Number(v.reviewRequired), now()),
          db
            .prepare("INSERT INTO account_audit VALUES(?,?,?,?,?,?,?,?)")
            .bind(
              crypto.randomUUID(),
              u.id,
              "policy",
              "policy",
              reason,
              JSON.stringify(before),
              JSON.stringify(v),
              now(),
            ),
        ]);
        return json({ ok: true });
      }
      throw fail(404, "Not found");
    }
    if (path === "/bootstrap" && req.method === "POST") {
      const v = await body(req);
      const p = await profile(db, u.id);
      if (!p) {
        const providers = [
          ...(u.app_metadata?.providers ?? []),
          u.app_metadata?.provider,
          ...(u.identities ?? []).map((i) => i.provider),
        ];
        const code =
          validSignup(u.created_at) && providers.includes("web3") ? referralCode(v.ref) : null;
        // One atomic insert decides attribution, snapshots policy and creates at most one reward.
        const random = crypto.randomUUID().replaceAll("-", "");
        await db
          .prepare(
            "INSERT OR IGNORE INTO account_profiles(user_id,username,referral_code,referred_by,auth_created_at,created_at) VALUES(?,?,?,(SELECT p.user_id FROM account_referral_codes c JOIN account_profiles p ON p.user_id=c.user_id JOIN account_policy s ON s.id=1 WHERE c.code=? AND p.user_id<>? AND p.status='active' AND s.enabled=1),?,?)",
          )
          .bind(
            u.id,
            "trader_" + random.slice(0, 10),
            random.slice(0, 16).toUpperCase(),
            code,
            u.id,
            u.created_at,
            now(),
          )
          .run();
      }
      return json(await own(db, u.id));
    }
    const p = await profile(db, u.id);
    if (!p) throw fail(409, "Account setup is not complete. Retry.");
    if (path === "" && req.method === "GET") return json(await own(db, u.id));
    if (path === "/username/check" && req.method === "POST") {
      const v = await body(req);
      let name;
      try {
        name = normalizeUsername(v.username);
      } catch (e) {
        return json({ available: false, message: e.message });
      }
      const exists = await db
        .prepare(
          "SELECT user_id FROM account_profiles WHERE username=? COLLATE NOCASE AND user_id<>?",
        )
        .bind(name, u.id)
        .first();
      return json({
        available: !exists,
        message: exists ? "This username is already taken" : "Username available",
        username: name,
      });
    }
    if (path === "/username" && req.method === "POST") {
      if (p.status !== "active") throw fail(403, "Account is suspended");
      const v = await body(req);
      const name = checkedName(v.username);
      if (p.renamed_at && Date.now() - Date.parse(p.renamed_at) < 60000)
        throw fail(429, "Please wait a minute before changing your username again");
      await db
        .prepare("UPDATE account_profiles SET username=?,renamed_at=? WHERE user_id=?")
        .bind(name, now(), u.id)
        .run();
      return json(await own(db, u.id));
    }
    throw fail(404, "Not found");
  } catch (e) {
    if (/UNIQUE constraint failed.*username/i.test(e.message))
      return json({ error: "This username is already taken" }, 409);
    if (/UNIQUE constraint failed.*code/i.test(e.message))
      return json({ error: "This referral code is already taken" }, 409);
    if (e.status) return json({ error: e.message }, e.status);
    console.error("Account service request failed");
    return json({ error: "Account service is temporarily unavailable. Please retry." }, 503);
  }
}
