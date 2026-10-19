import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  event,
  creation,
  trade,
  registry,
  exchange,
  positions,
  nextHash,
  hash,
  addr,
} from "./helpers/security-sql-fixture.mjs";
const enabled = Boolean(process.env.TACP_LOCAL_PG_SOCKET);
const apply = (s, tx, p = trade) =>
  s.query("SELECT apply_protocol_event(84532,10,$1,$2,0,$3,$4,$5::jsonb,now()) AS applied", [
    hash("a"),
    tx,
    exchange,
    "TradeExecuted",
    JSON.stringify(p),
  ]);
test(
  "real PostgreSQL: concurrent event replay, parent locks and lease takeover",
  { skip: !enabled },
  async (t) => {
    const db = await fixture();
    t.after(() => db.close());
    await event(db, "MarketCreated", creation);
    const a = await db.newSession(),
      b = await db.newSession();
    t.after(async () => {
      await a.close();
      await b.close();
    });
    await t.test("same canonical event raced by two sessions projects once", async () => {
      const tx = nextHash();
      const r = await Promise.all([apply(a, tx), apply(b, tx)]);
      assert.deepEqual(r.map((x) => x.rows[0].applied).sort(), [false, true]);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM protocol_trades WHERE tx_hash=$1", [tx]))
          .rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM protocol_event_projection_receipts WHERE tx_hash=$1",
            [tx],
          )
        ).rows[0].n,
        1,
      );
    });
    await t.test("same event key with different payload cannot win a second race", async () => {
      const tx = nextHash();
      const r = await Promise.allSettled([
        apply(a, tx),
        apply(b, tx, { ...trade, usdcAmount: "500001" }),
      ]);
      assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
      assert.match(
        r.find((x) => x.status === "rejected").reason.message,
        /Canonical duplicate mismatch/,
      );
    });
    await t.test(
      "aborted first writer leaves no raw event or receipt and second writer can project",
      async () => {
        const tx = nextHash();
        await a.exec("BEGIN");
        assert.equal((await apply(a, tx)).rows[0].applied, true);
        const wait = apply(b, tx);
        await a.exec("ROLLBACK");
        assert.equal((await wait).rows[0].applied, true);
        assert.equal(
          (await db.query("SELECT count(*)::int n FROM protocol_trades WHERE tx_hash=$1", [tx]))
            .rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "parent row lock prevents concurrent metadata deletion/update during projection",
      async () => {
        await a.exec("BEGIN");
        await apply(a, nextHash());
        await b.exec("SET lock_timeout='150ms'");
        await assert.rejects(
          b.exec("UPDATE protocol_markets SET title='racing change' WHERE onchain_id=1"),
          /lock timeout/,
        );
        await a.exec("ROLLBACK");
        await b.exec("RESET lock_timeout");
      },
    );
    await t.test(
      "legacy raw-only duplicate raced by two sessions cannot get completion markers",
      async () => {
        const tx = nextHash();
        await db.query(
          `INSERT INTO protocol_chain_events VALUES(84532,$1,0,10,$2,$3,'TradeExecuted',$4::jsonb,now())`,
          [tx, hash("a"), exchange, JSON.stringify(trade)],
        );
        const r = await Promise.allSettled([apply(a, tx), apply(b, tx)]);
        assert.equal(
          r.every(
            (x) =>
              x.status === "rejected" &&
              /historical projection reconciliation/.test(x.reason.message),
          ),
          true,
        );
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM protocol_event_projection_receipts WHERE tx_hash=$1",
              [tx],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test("job lease row cannot be stolen between assertion and event commit", async () => {
      const owner = "30000000-0000-0000-0000-000000000003";
      await db.query(
        `INSERT INTO protocol_job_leases VALUES(84532,'indexer',$1,now()+interval '5 minutes')`,
        [owner],
      );
      await a.exec("BEGIN");
      await a.query("SELECT assert_protocol_job_lease(84532,'indexer',$1)", [owner]);
      await b.exec("SET lock_timeout='150ms'");
      await assert.rejects(
        b.exec(
          "UPDATE protocol_job_leases SET owner='40000000-0000-0000-0000-000000000004' WHERE chain_id=84532 AND job='indexer'",
        ),
        /lock timeout/,
      );
      await a.exec("ROLLBACK");
      await b.exec("RESET lock_timeout");
    });
    await t.test(
      "failed batch transfer rolls back previous token movement in same RPC",
      async () => {
        await event(db, "TransferSingle", {
          from: addr("0"),
          to: addr("a"),
          id: "101",
          value: "10",
        });
        const tx = nextHash();
        await assert.rejects(
          event(
            db,
            "TransferBatch",
            { from: addr("a"), to: addr("b"), ids: ["101", "102"], values: ["5", "1"] },
            { tx },
          ),
          /check constraint/,
        );
        assert.equal(
          (
            await db.query(
              `SELECT shares_atomic::text v FROM protocol_positions p JOIN protocol_wallets w ON w.id=p.wallet_id WHERE w.address=$1 AND p.outcome_index=0`,
              [addr("a")],
            )
          ).rows[0].v,
          "10",
        );
        assert.equal(
          (
            await db.query("SELECT count(*)::int n FROM protocol_chain_events WHERE tx_hash=$1", [
              tx,
            ])
          ).rows[0].n,
          0,
        );
      },
    );
  },
);
