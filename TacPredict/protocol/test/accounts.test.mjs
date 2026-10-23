import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleAccounts } from "../../src/lib/accounts/worker.mjs";
import { normalizeUsername, referralCode, validSignup } from "../../src/lib/accounts/rules.mjs";
const schema = readFileSync(new URL("../../database/accounts.sql", import.meta.url), "utf8");
class D1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(schema);
  }
  prepare(sql) {
    const owner = this;
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return owner.db.prepare(sql).get(...this.params) ?? null;
      },
      async all() {
        return { results: owner.db.prepare(sql).all(...this.params) };
      },
      async run() {
        return owner.db.prepare(sql).run(...this.params);
      },
    };
  }
  async batch(rows) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const row of rows) out.push(await row.run());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
function setup() {
  const db = new D1();
  const users = new Map();
  const env = {
    TAC_ACCOUNTS: db,
    SUPABASE_URL: "https://auth.example",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  const add = (options = {}) => {
    const id = crypto.randomUUID();
    users.set(id, {
      id,
      created_at: new Date().toISOString(),
      app_metadata: { providers: ["web3"] },
      ...options,
    });
    return id;
  };
  const fetcher = async (url, opts) => {
    const id = opts.headers.Authorization?.replace("Bearer ", "");
    if (url.endsWith("/auth/v1/user"))
      return users.has(id) ? Response.json(users.get(id)) : new Response("", { status: 401 });
    if (url.includes("/rpc/"))
      return id === admin ? Response.json({}) : new Response("", { status: 403 });
    throw Error("Unexpected network call");
  };
  let admin = null;
  async function call(id, path = "", data, extra = {}) {
    const req = new Request("https://tacpredict.fun/api/account" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(id ? { Authorization: "Bearer " + id } : {}),
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const r = await handleAccounts(req, env, fetcher);
    return { status: r.status, data: await r.json() };
  }
  const bootstrap = async (id, ref) => call(id, "/bootstrap", { ref });
  return {
    db,
    add,
    call,
    bootstrap,
    setAdmin(id) {
      admin = id;
    },
  };
}
test("username canonicalization, reserved words and referral expiry", () => {
  assert.equal(normalizeUsername(" Cool_Cat "), "cool_cat");
  assert.throws(() => normalizeUsername("Admin"));
  assert.throws(() => normalizeUsername("<script>"));
  assert.equal(referralCode("aa11223344556677"), "AA11223344556677");
  assert.equal(referralCode("../"), null);
  assert.equal(validSignup("2020-01-01"), false);
  assert.equal(validSignup("bad"), false);
});
test("sign-in required, cross-origin writes denied, no arbitrary owner input", async () => {
  const t = setup();
  assert.equal((await t.call(null, "/bootstrap", {})).status, 401);
  const id = t.add();
  assert.equal(
    (await t.call(id, "/bootstrap", {}, { Origin: "https://evil.example" })).status,
    403,
  );
  const r = await t.bootstrap(id);
  assert.equal(r.status, 200);
  assert.match(r.data.profile.username, /^trader_[a-f0-9]{10}$/);
  assert.equal((await t.call(id, "/admin")).status, 403);
  assert.equal(
    (await t.call(id, "/username", { username: "nice_name", userId: "victim" })).status,
    200,
  );
  assert.equal(t.db.db.prepare("SELECT count(*) n FROM account_profiles").get().n, 1);
});
test("referral signup permanently binds and credits inviter exactly once, not invitee", async () => {
  const t = setup(),
    a = t.add(),
    b = t.add();
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  await t.bootstrap(b, code);
  await t.bootstrap(b, code);
  const inviter = (await t.call(a)).data;
  assert.equal(inviter.stats.invited, 1);
  assert.equal(inviter.stats.earned, 100);
  assert.equal((await t.call(b)).data.stats.earned, 0);
  assert.equal((await t.call(b)).data.profile.referredBy, inviter.profile.username);
  assert.throws(
    () => t.db.db.prepare("UPDATE account_profiles SET referred_by=NULL WHERE user_id=?").run(b),
    /permanent/,
  );
});
test("existing profiles, old auth accounts, non-wallet identities and self-referrals never rebind", async () => {
  const t = setup(),
    a = t.add(),
    existing = t.add(),
    old = t.add({ created_at: "2020-01-01T00:00:00Z" }),
    oauth = t.add({ app_metadata: { providers: ["google"] } });
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  await t.bootstrap(existing);
  for (const id of [a, existing, old, oauth]) await t.bootstrap(id, code);
  assert.equal((await t.call(a)).data.stats.invited, 0);
});
test("duplicate username returns red-field error and never overwrites another account", async () => {
  const t = setup(),
    a = t.add(),
    b = t.add();
  await t.bootstrap(a);
  await t.bootstrap(b);
  assert.equal((await t.call(a, "/username", { username: "cool_animal" })).status, 200);
  const check = await t.call(b, "/username/check", { username: "COOL_ANIMAL" });
  assert.equal(check.data.available, false);
  assert.equal(check.data.message, "This username is already taken");
  const conflict = await t.call(b, "/username", { username: "COOL_ANIMAL" });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error, "This username is already taken");
});
test("server rate limits writes and cannot be bypassed by client amount fields", async () => {
  const t = setup(),
    a = t.add(),
    b = t.add();
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  await t.call(b, "/bootstrap", { ref: code, reward: 999999999, status: "credited", inviter: a });
  assert.equal((await t.call(a)).data.stats.earned, 100);
  let last;
  for (let i = 0; i < 22; i++) last = await t.call(b, "/username/check", { username: "test_name" });
  assert.equal(last.status, 429);
});
test("admin changes require authorization and reason; old codes survive rotation; audit is atomic", async () => {
  const t = setup(),
    a = t.add(),
    admin = t.add();
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  t.setAdmin(admin);
  const payload = { userId: a, action: "code", value: "AABBCCDDEEFF0011" };
  assert.equal((await t.call(a, "/admin/update", { ...payload, reason: "not admin" })).status, 403);
  assert.equal((await t.call(admin, "/admin/update", payload)).status, 400);
  assert.equal(
    (await t.call(admin, "/admin/update", { ...payload, reason: "Code rotation requested" }))
      .status,
    200,
  );
  const b = t.add();
  await t.bootstrap(b, code);
  assert.equal((await t.call(a)).data.stats.earned, 100);
  assert.equal(t.db.db.prepare("SELECT count(*) n FROM account_audit WHERE target=?").get(a).n, 1);
});
test("policy applies prospectively; review and revocation preserve one reward record", async () => {
  const t = setup(),
    a = t.add(),
    admin = t.add(),
    b = t.add();
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  t.setAdmin(admin);
  await t.call(admin, "/admin/policy", {
    enabled: true,
    reviewRequired: true,
    rewardUnits: 75,
    reason: "New campaign",
  });
  await t.bootstrap(b, code);
  assert.equal((await t.call(a)).data.stats.pending, 75);
  await t.call(admin, "/admin/update", {
    userId: b,
    action: "reward",
    value: "credited",
    reason: "Eligibility reviewed",
  });
  assert.equal((await t.call(a)).data.stats.earned, 75);
  await t.call(admin, "/admin/update", {
    userId: b,
    action: "reward",
    value: "revoked",
    reason: "Duplicate identity",
  });
  assert.equal((await t.call(a)).data.stats.earned, 0);
  await t.bootstrap(b, code);
  assert.equal(t.db.db.prepare("SELECT count(*) n FROM account_referral_rewards").get().n, 1);
});
test("daily cap queues extra rewards and suspended inviters cannot bind new accounts", async () => {
  const t = setup(),
    a = t.add(),
    admin = t.add();
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  for (let i = 0; i < 11; i++) await t.bootstrap(t.add(), code);
  const r = (await t.call(a)).data;
  assert.equal(r.stats.earned, 1000);
  assert.equal(r.stats.pending, 100);
  t.setAdmin(admin);
  await t.call(admin, "/admin/update", {
    userId: a,
    action: "status",
    value: "suspended",
    reason: "Abuse review",
  });
  await t.bootstrap(t.add(), code);
  assert.equal((await t.call(a)).data.stats.invited, 11);
});
test("concurrent duplicate bootstrap cannot mint a second referral reward", async () => {
  const t = setup(),
    a = t.add(),
    b = t.add();
  const code = (await t.bootstrap(a)).data.profile.referralCode;
  await Promise.all([t.bootstrap(b, code), t.bootstrap(b, code), t.bootstrap(b, code)]);
  assert.equal((await t.call(a)).data.stats.earned, 100);
  assert.equal(t.db.db.prepare("SELECT count(*) n FROM account_referral_rewards").get().n, 1);
});

test("oversized JSON and invalid usernames fail without database mutation", async () => {
  const t = setup(),
    id = t.add();
  await t.bootstrap(id);
  assert.equal((await t.call(id, "/username", { username: "bad<script>" })).status, 400);
  assert.equal((await t.call(id, "/username", { username: "a".repeat(5000) })).status, 413);
  assert.equal(t.db.db.prepare("SELECT count(*) n FROM account_profiles").get().n, 1);
});
