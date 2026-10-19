import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  root,
  A,
  B,
  addr,
  hash,
  zero,
  registry,
  factory,
  positions,
  exchange,
  oracle,
  nextHash,
  fixture,
  event,
  creation,
  trade,
  asUser,
} from "./helpers/security-sql-fixture.mjs";
test("isolated SQL: privileges, wallet isolation and atomic projection lifecycle", async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await t.test(
    "anonymous legacy reads, writes, column grants and truncate revoked; native writes remain denied",
    async () => {
      const r = await db.query(
        `SELECT bool_or(has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE')) AS unsafe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('users','wallets','protocol_orderbook')`,
      );
      assert.equal(r.rows[0].unsafe, false);
      const native = await db.query(
        `SELECT bool_or(has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) AS unsafe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'protocol_%'`,
      );
      assert.equal(native.rows[0].unsafe, false);
      await db.exec("SET ROLE anon");
      await assert.rejects(db.query("TRUNCATE public.users"), /permission denied/);
      await db.exec("RESET ROLE");
      await db.exec(
        "CREATE TABLE public.security_future_table(id integer);CREATE FUNCTION public.security_future_function() RETURNS integer LANGUAGE sql AS $$SELECT 1$$",
      );
      assert.equal(
        (
          await db.query(
            "SELECT has_table_privilege('anon','public.security_future_table','INSERT') OR has_function_privilege('anon','public.security_future_function()','EXECUTE') AS unsafe",
          )
        ).rows[0].unsafe,
        false,
      );
    },
  );
  await t.test(
    "market creation and exact replay are idempotent; malformed/cross-chain parent fails",
    async () => {
      const tx = nextHash();
      assert.equal(await event(db, "MarketCreated", creation, { tx }), true);
      assert.equal(await event(db, "MarketCreated", creation, { tx }), false);
      for (const name of [
        "MarketClosed",
        "ResolutionFinalized",
        "PositionCreated",
        "CompleteSetMerged",
        "PositionRedeemed",
        "OrderFilled",
        "TradeExecuted",
        "ResolutionProposed",
        "ResolutionDisputed",
        "DisputeFinalized",
        "MetadataPublished",
      ])
        await assert.rejects(event(db, name, { marketId: "2" }), /no rows/);
      await assert.rejects(event(db, "MarketClosed", { marketId: "0" }), /Invalid market ID/);
      await db.exec(
        `INSERT INTO protocol_deployments(chain_id,collateral_token,registry,factory,positions,exchange,oracle,settlement,deployment_block,code_hashes,verified) SELECT 8453,'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',registry,factory,positions,exchange,oracle,settlement,deployment_block,code_hashes,true FROM protocol_deployments WHERE chain_id=84532`,
      );
      await assert.rejects(
        event(db, "MarketClosed", { marketId: "1" }, { chain: 8453 }),
        /no rows/,
      );
    },
  );
  await t.test(
    "missing-parent trade rolls back raw event and transaction before acknowledgement",
    async () => {
      const tx = nextHash();
      await assert.rejects(
        event(db, "TradeExecuted", { ...trade, marketId: "99" }, { tx }),
        /no rows/,
      );
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM protocol_chain_events WHERE tx_hash=$1", [tx]))
          .rows[0].n,
        0,
      );
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM protocol_transactions WHERE tx_hash=$1", [tx]))
          .rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "trade receipt and projection commit together; duplicate does not double count",
    async () => {
      const tx = nextHash();
      assert.equal(await event(db, "TradeExecuted", trade, { tx }), true);
      assert.equal(await event(db, "TradeExecuted", trade, { tx }), false);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM protocol_trades WHERE tx_hash=$1", [tx]))
          .rows[0].n,
        1,
      );
      await assert.rejects(
        event(db, "TradeExecuted", { ...trade, usdcAmount: "500001" }, { tx }),
        /Canonical duplicate mismatch/,
      );
    },
  );
  await t.test(
    "a projection constraint failure rolls back raw event, transaction and receipt",
    async () => {
      const tx = nextHash();
      await assert.rejects(
        event(db, "TradeExecuted", { ...trade, usdcAmount: "0" }, { tx }),
        /check constraint/,
      );
      for (const table of [
        "protocol_chain_events",
        "protocol_transactions",
        "protocol_event_projection_receipts",
      ])
        assert.equal(
          (await db.query(`SELECT count(*)::int n FROM ${table} WHERE tx_hash=$1`, [tx])).rows[0].n,
          0,
        );
    },
  );
  await t.test(
    "legacy raw-event duplicates require reconciliation, not silent acknowledgement",
    async () => {
      const tx = nextHash();
      await db.query(
        `INSERT INTO protocol_chain_events VALUES(84532,$1,0,10,$2,$3,'TradeExecuted',$4::jsonb,now())`,
        [tx, hash("a"), exchange, JSON.stringify(trade)],
      );
      await assert.rejects(
        event(db, "TradeExecuted", trade, { tx }),
        /historical projection reconciliation/,
      );
    },
  );
  await t.test("unmapped batch token rolls back entire transfer and raw event", async () => {
    const tx = nextHash();
    await assert.rejects(
      event(
        db,
        "TransferBatch",
        { from: zero, to: addr("a"), ids: ["101", "999"], values: ["10", "10"] },
        { tx },
      ),
      /no rows/,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM protocol_chain_events WHERE tx_hash=$1", [tx]))
        .rows[0].n,
      0,
    );
  });
  await t.test(
    "known transfers, self-transfer and non-market events retain intended behavior",
    async () => {
      assert.equal(
        await event(db, "TransferSingle", {
          from: zero,
          to: addr("a"),
          id: "101",
          value: "1000000",
        }),
        true,
      );
      assert.equal(
        await event(db, "TransferSingle", {
          from: addr("a"),
          to: addr("a"),
          id: "999",
          value: "1",
        }),
        true,
      );
      assert.equal(
        await event(db, "BondWithdrawn", { account: addr("a"), amount: "5000000" }),
        true,
      );
      assert.equal(await event(db, "NonceInvalidated", { maker: addr("a"), nonce: "3" }), true);
    },
  );
  await t.test(
    "verified own wallet only across raw positions, claims, refunds and portfolio; revoked proof loses access",
    async () => {
      await db.exec(`UPDATE protocol_markets SET published=true;
   UPDATE protocol_wallets SET user_id='${A}',verified_at=now() WHERE address='${addr("a")}';
   INSERT INTO protocol_wallets(address,user_id,verified_at) VALUES('${addr("b")}','${B}',now()),('${addr("c")}','${A}',NULL);
   INSERT INTO protocol_positions(market_uuid,wallet_id,outcome_index,shares_atomic) SELECT m.id,w.id,0,1000000 FROM protocol_markets m CROSS JOIN protocol_wallets w WHERE w.address IN('${addr("b")}','${addr("c")}');
   INSERT INTO protocol_claims(market_uuid,wallet_id,amount_atomic,chain_id,tx_hash,log_index,created_at) SELECT m.id,w.id,1,84532,'${hash("d")}',row_number() OVER()::int,now() FROM protocol_markets m CROSS JOIN protocol_wallets w;
   INSERT INTO protocol_refunds SELECT * FROM protocol_claims;`);
      for (const table of ["protocol_positions", "protocol_claims", "protocol_refunds"]) {
        assert.equal((await asUser(db, A, `SELECT * FROM ${table}`)).rows.length, 1);
        assert.equal((await asUser(db, B, `SELECT * FROM ${table}`)).rows.length, 1);
      }
      await db.exec(
        `INSERT INTO protocol_orders(order_id,market_uuid,user_id,maker,taker,outcome_index,side,price_atomic,shares_atomic,nonce,expiration,signature,signed_order) SELECT '0x'||lpad(row_number() OVER()::text,64,'0'),m.id,w.user_id,w.address,'${zero}',0,'BUY',500000,1000000,0,now()+interval '1 hour','test-only','{}' FROM protocol_markets m CROSS JOIN protocol_wallets w`,
      );
      assert.equal((await asUser(db, A, "SELECT * FROM protocol_orders")).rows.length, 1);
      assert.equal((await asUser(db, B, "SELECT * FROM protocol_orders")).rows.length, 1);
      assert.equal(
        (await asUser(db, A, "SELECT get_my_protocol_portfolio() p")).rows[0].p.positions.length,
        1,
      );
      await db.exec(`UPDATE protocol_wallets SET verified_at=NULL WHERE address='${addr("a")}'`);
      for (const table of ["protocol_positions", "protocol_claims", "protocol_refunds"])
        assert.equal((await asUser(db, A, `SELECT * FROM ${table}`)).rows.length, 0);
      assert.equal(
        (await asUser(db, A, "SELECT get_my_protocol_portfolio() p")).rows[0].p.positions.length,
        0,
      );
    },
  );
  await t.test("approval-gated aggregate SQL compiles locally without exposing rows", async () => {
    const sql = await readFile(
      new URL("docs/audit/sql/production-reconciliation-counts.requires-approval.sql", root),
      "utf8",
    );
    const result = await db.exec(sql);
    assert.ok(result);
    for (const name of [
      "production-reconciliation-counts.executed.sql",
      "production-reconciliation-coverage.executed.sql",
    ]) {
      const executed = await readFile(new URL("docs/audit/sql/" + name, root), "utf8");
      assert.ok(await db.exec(executed));
    }
  });
  await t.test("expired lease prevents event and checkpoint changes", async () => {
    const owner = "30000000-0000-0000-0000-000000000003";
    await db.exec(
      `INSERT INTO protocol_job_leases VALUES(84532,'indexer','${owner}',now()-interval '1 second')`,
    );
    const tx = nextHash();
    await assert.rejects(
      db.query(
        `SELECT apply_leased_protocol_event($1,84532,10,$2,$3,0,$4,'MarketClosed','{"marketId":"1"}'::jsonb,now())`,
        [owner, hash("a"), tx, registry],
      ),
      /Job lease expired/,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM protocol_chain_events WHERE tx_hash=$1", [tx]))
        .rows[0].n,
      0,
    );
    await assert.rejects(
      db.query(`SELECT advance_protocol_checkpoint($1,84532,NULL,10,$2)`, [owner, hash("a")]),
      /Job lease expired/,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM protocol_indexer_checkpoints")).rows[0].n,
      0,
    );
  });
});

test("browser connection no longer writes unproven wallet telemetry", async () => {
  const sync = await readFile(new URL("src/lib/web3/sync-wallet.ts", root), "utf8");
  const hook = await readFile(new URL("src/hooks/use-wallet-sync.ts", root), "utf8");
  assert.doesNotMatch(sync, /from\s*\(|supabase|fetch\s*\(/);
  assert.doesNotMatch(hook, /syncConnectedWallet|upsert|fetch\s*\(/);
  assert.match(hook, /removeQueries/);
});
