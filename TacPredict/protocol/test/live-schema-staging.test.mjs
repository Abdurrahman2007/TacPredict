/** Optional private metadata snapshot test. Only the isolated local PG runner can execute it. */
import test from "node:test";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { event, creation } from "./helpers/security-sql-fixture.mjs";
import { reconstructLiveSchema } from "./helpers/live-schema-reconstruction.mjs";
const root = new URL("../../", import.meta.url);
const A = "10000000-0000-0000-0000-000000000001",
  B = "20000000-0000-0000-0000-000000000002";
const addr = (n) => "0x" + n.repeat(40),
  hash = (n) => "0x" + n.repeat(64);
test("live-derived public schema: reproduce observed gaps, apply proposed fixes LOCALLY, verify isolation/atomicity", async (t) => {
  const file = process.env.TACP_LOCAL_SCHEMA_SNAPSHOT;
  if (!file) throw Error("Explicit local snapshot required");
  const { db, metadata, manifest } = await reconstructLiveSchema(file);
  t.after(() => db.close());
  await t.test(
    "reconstructed exact public table/policy counts; unmatched source and auth are not pretended",
    async () => {
      const q = await db.query(
        `SELECT (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r') tables,(SELECT count(*)::int FROM pg_policies WHERE schemaname='public') policies`,
      );
      assert.equal(q.rows[0].tables, 37);
      assert.equal(q.rows[0].policies, metadata.policies.length);
      assert.equal(manifest.sourceMatchedFunctions, 28);
      assert.equal(manifest.fullProductionClone, false);
      assert(manifest.withheldFunctions.includes("has_role"));
    },
  );
  await t.test(
    "baseline anonymous alternate-table write privilege and missing verified_at predicates are reproduced",
    async () => {
      const q = await db.query(
        `SELECT has_table_privilege('anon','public.users','INSERT') can_write,(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.apply_protocol_event(bigint,numeric,text,text,integer,text,text,jsonb,timestamp with time zone)'::regprocedure) event_md5`,
      );
      assert.equal(q.rows[0].can_write, true);
      assert.equal(q.rows[0].event_md5, "75b26365764b8eb9edeb60182e7053ab");
      for (const name of [
        "protocol_wallets",
        "protocol_positions",
        "protocol_claims",
        "protocol_refunds",
      ])
        assert(
          metadata.policies
            .filter((p) => p.table === name)
            .every((p) => !p.using?.includes("verified_at")),
        );
    },
  );
  await t.test(
    "baseline missing-parent acknowledgement reproduces live source defect with local-only fake event",
    async () => {
      await db.query(
        `INSERT INTO protocol_deployments(chain_id,collateral_token,registry,factory,positions,exchange,oracle,settlement,deployment_block,code_hashes,verified,trading_enabled) VALUES(84532,'0x036cbd53842c5426634e7929541ec2318f3dcf7e',$1,$2,$3,$4,$5,$6,1,'{}',true,false)`,
        [addr("1"), addr("2"), addr("3"), addr("4"), addr("5"), addr("6")],
      );
      assert.equal(await event(db, "TradeExecuted", { marketId: "999" }, { tx: hash("e") }), true);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM protocol_chain_events")).rows[0].n,
        1,
      );
      assert.equal((await db.query("SELECT count(*)::int n FROM protocol_trades")).rows[0].n, 0);
      await db.exec(
        "DELETE FROM protocol_chain_events;DELETE FROM protocol_transactions;DELETE FROM protocol_deployments",
      );
    },
  );
  for (const n of ["security-access-hardening.sql", "indexer-atomic-projection-guard.sql"])
    await db.exec(await readFile(new URL("docs/audit/proposals/" + n, root), "utf8"));
  await db.exec(
    `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${A}','a@local.invalid','{}'),('${B}','b@local.invalid','{}');`,
  );
  await db.query(
    `INSERT INTO protocol_deployments(chain_id,collateral_token,registry,factory,positions,exchange,oracle,settlement,deployment_block,code_hashes,verified,trading_enabled) VALUES(84532,'0x036cbd53842c5426634e7929541ec2318f3dcf7e',$1,$2,$3,$4,$5,$6,1,'{}',true,false)`,
    [addr("1"), addr("2"), addr("3"), addr("4"), addr("5"), addr("6")],
  );
  await t.test(
    "local proposed corrections revoke alternate-table grants including truncate and column-level grants",
    async () => {
      const q = await db.query(
        `SELECT bool_or(has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE')) unsafe FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN('users','wallets','protocol_orderbook')`,
      );
      assert.equal(q.rows[0].unsafe, false);
      await db.exec(
        "CREATE TABLE public.security_future_table(id integer);CREATE FUNCTION public.security_future_function() RETURNS integer LANGUAGE sql AS $$SELECT 1$$",
      );
      const future = await db.query(
        "SELECT has_table_privilege('anon','public.security_future_table','INSERT') OR has_function_privilege('anon','public.security_future_function()','EXECUTE') OR has_table_privilege('authenticated','public.security_future_table','INSERT') OR has_function_privilege('authenticated','public.security_future_function()','EXECUTE') unsafe",
      );
      assert.equal(future.rows[0].unsafe, false);
    },
  );
  await t.test(
    "missing-parent financial event rolls back raw acknowledgement in live-derived schema",
    async () => {
      await assert.rejects(
        db.query(
          `SELECT public.apply_protocol_event(84532,10,$1,$2,0,$3,'TradeExecuted',$4::jsonb,now())`,
          [
            hash("a"),
            hash("b"),
            addr("4"),
            JSON.stringify({
              marketId: "999",
              buyer: addr("a"),
              seller: addr("b"),
              outcome: 0,
              price: "500000",
              shares: "1000000",
              usdcAmount: "500000",
              buyOrderId: hash("c"),
              sellOrderId: hash("d"),
            }),
          ],
        ),
        /no rows|market|parent/i,
      );
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM protocol_chain_events")).rows[0].n,
        0,
      );
    },
  );
  await db.query(
    `INSERT INTO protocol_wallets(user_id,address,verified_at) VALUES($1,$2,now()),($3,$4,now())`,
    [A, addr("a"), B, addr("b")],
  );
  async function user(uid, sql) {
    await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${uid}';`);
    try {
      return await db.query(sql);
    } finally {
      await db.exec("RESET ROLE;RESET request.jwt.claim.sub");
    }
  }
  await t.test(
    "financial owner isolation, portfolio and revoked ownership on live-derived native tables",
    async () => {
      assert.equal(await event(db, "MarketCreated", creation, { tx: hash("f") }), true);
      await db.exec(`UPDATE protocol_markets SET published=true;
   INSERT INTO protocol_wallets(user_id,address,verified_at) VALUES('${A}','${addr("c")}',NULL);
   INSERT INTO protocol_positions(market_uuid,wallet_id,outcome_index,shares_atomic) SELECT m.id,w.id,0,1000000 FROM protocol_markets m CROSS JOIN protocol_wallets w;
   INSERT INTO protocol_claims(market_uuid,wallet_id,amount_atomic,chain_id,tx_hash,log_index,created_at) SELECT m.id,w.id,1,84532,'${hash("d")}',row_number() OVER()::int,now() FROM protocol_markets m CROSS JOIN protocol_wallets w;
   INSERT INTO protocol_refunds SELECT * FROM protocol_claims;
   INSERT INTO protocol_orders(order_id,market_uuid,user_id,maker,taker,outcome_index,side,price_atomic,shares_atomic,nonce,expiration,signature,signed_order) SELECT '0x'||lpad(row_number() OVER()::text,64,'0'),m.id,w.user_id,w.address,'${addr("0")}',0,'BUY',500000,1000000,0,now()+interval '1 hour','LOCAL-FAKE-NOT-SIGNED','{}' FROM protocol_markets m CROSS JOIN protocol_wallets w;`);
      for (const table of [
        "protocol_positions",
        "protocol_claims",
        "protocol_refunds",
        "protocol_orders",
      ]) {
        assert.equal((await user(A, "SELECT * FROM " + table)).rows.length, 1);
        assert.equal((await user(B, "SELECT * FROM " + table)).rows.length, 1);
        await db.exec("SET ROLE anon");
        try {
          await assert.rejects(db.query("SELECT * FROM " + table), /permission denied/);
        } finally {
          await db.exec("RESET ROLE");
        }
      }
      assert.equal(
        (await user(A, "SELECT get_my_protocol_portfolio() p")).rows[0].p.positions.length,
        1,
      );
      await db.exec(`UPDATE protocol_wallets SET verified_at=NULL WHERE address='${addr("a")}'`);
      for (const table of [
        "protocol_positions",
        "protocol_claims",
        "protocol_refunds",
        "protocol_orders",
      ])
        assert.equal((await user(A, "SELECT * FROM " + table)).rows.length, 0);
      assert.equal(
        (await user(A, "SELECT get_my_protocol_portfolio() p")).rows[0].p.positions.length,
        0,
      );
      await db.exec(`UPDATE protocol_wallets SET verified_at=now() WHERE address='${addr("a")}'`);
    },
  );
  await t.test(
    "proven owner A cannot read B wallet; revoking verified_at hides own wallet",
    async () => {
      const rows = (await user(A, "SELECT address FROM protocol_wallets")).rows;
      assert.deepEqual(
        rows.map((r) => r.address),
        [addr("a")],
      );
      await db.query("UPDATE protocol_wallets SET verified_at=NULL WHERE address=$1", [addr("a")]);
      assert.equal((await user(A, "SELECT address FROM protocol_wallets")).rows.length, 0);
    },
  );
  await writeFile(
    join(dirname(file), "local-reconstruction-result.json"),
    JSON.stringify(
      {
        ...manifest,
        postgresVersion: (await db.query("SHOW server_version")).rows[0].server_version,
        productionWrites: false,
        launchAuthorized: false,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
});
