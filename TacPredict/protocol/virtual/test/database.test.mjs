import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
let db;
const dep = "test:engine",
  wallet = "0x" + "2".repeat(40),
  other = "0x" + "3".repeat(40),
  user = "11111111-1111-1111-1111-111111111111";
before(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; CREATE TABLE public.protocol_wallets(address text,user_id uuid,verified_at timestamptz); GRANT SELECT ON public.protocol_wallets TO authenticated; INSERT INTO public.protocol_wallets VALUES('${wallet}','${user}',now());`,
  );
  await db.exec(
    fs.readFileSync(
      new URL("../../../supabase/migration-drafts/virtual-v1.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    "INSERT INTO public.virtual_deployments(id,chain_id,engine,code_hash,start_block,checkpoint,checkpoint_hash,finalized_block) VALUES($1,31337,$2,$3,1,0,$4,0)",
    [dep, wallet, "code", "h0"],
  );
});
after(async () => db?.close());
let fence;
test("lease fence and atomic block journal reject stale writers and duplicate trades", async () => {
  fence = (await db.query("SELECT public.virtual_acquire_lease($1) AS f", [dep])).rows[0].f;
  await assert.rejects(db.query("SELECT public.virtual_acquire_lease($1)", [dep]));
  const e = {
    name: "VirtualGrant",
    wallet,
    marketId: null,
    txHash: "tx1",
    blockHash: "h1",
    blockNumber: "1",
    logIndex: 0,
    args: { amount: "100" },
  };
  await db.query("SELECT public.virtual_commit_block($1,$2,1,$3,$4,10,$5,0)", [
    dep,
    fence,
    "h1",
    "h0",
    JSON.stringify([e]),
  ]);
  await assert.rejects(
    db.query("SELECT public.virtual_commit_block($1,$2,2,$3,$4,11,$5,0)", [
      dep,
      fence,
      "h2",
      "h1",
      "[]",
    ]),
  );
  const trades = [0, 1].map((i) => ({
    ...e,
    name: "TradeExecuted",
    marketId: "1",
    blockHash: "h2",
    blockNumber: "2",
    txHash: "tx2",
    logIndex: i,
    args: {},
  }));
  await assert.rejects(
    db.query("SELECT public.virtual_commit_block($1,$2,2,$3,$4,11,$5,1)", [
      dep,
      fence,
      "h2",
      "h1",
      JSON.stringify(trades),
    ]),
  );
  assert.equal(
    (await db.query("SELECT checkpoint FROM public.virtual_deployments WHERE id=$1", [dep])).rows[0]
      .checkpoint,
    "1",
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM public.virtual_blocks WHERE number=2")).rows[0]
      .n,
    0,
  );
});
test("RLS isolates verified wallets and forbids anonymous/client accounting writes and service RPCs", async () => {
  const e = {
    name: "VirtualGrant",
    wallet: other,
    marketId: null,
    txHash: "tx2",
    blockHash: "h2",
    blockNumber: "2",
    logIndex: 0,
    args: { amount: "999" },
  };
  await db.query("SELECT public.virtual_commit_block($1,$2,2,$3,$4,11,$5,1)", [
    dep,
    fence,
    "h2",
    "h1",
    JSON.stringify([e]),
  ]);
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false);`,
  );
  const rows = await db.query("SELECT wallet FROM public.virtual_chain_events");
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].wallet, wallet);
  await assert.rejects(
    db.exec(
      "INSERT INTO public.virtual_chain_events(deployment_id,block_number,block_hash,tx_hash,log_index,event) VALUES('x',1,'x','x',0,'{}')",
    ),
  );
  await assert.rejects(db.query("SELECT public.virtual_acquire_lease($1)", [dep]));
  await db.exec("RESET ROLE; SET ROLE anon;");
  await assert.rejects(db.exec("SELECT * FROM public.virtual_chain_events"));
  await db.exec("RESET ROLE");
});
test("rewind keeps orphaned evidence but excludes projections; finalized history cannot rewind", async () => {
  await db.query("SELECT public.virtual_rewind($1,$2,1,$3)", [dep, fence, "h1"]);
  assert.equal(
    (await db.query("SELECT canonical FROM public.virtual_chain_events WHERE block_number=2"))
      .rows[0].canonical,
    false,
  );
  await db.query("SELECT public.virtual_finalize_blocks($1,$2,1,$3)", [dep, fence, "h1"]);
  await assert.rejects(db.query("SELECT public.virtual_rewind($1,$2,0,$3)", [dep, fence, "h0"]));
  await assert.rejects(
    db.query("SELECT public.virtual_finalize_blocks($1,$2,1,$3)", [dep, fence, "wrong"]),
  );
});

test("null/expired fences cannot write; approved formula history is immutable", async () => {
  await assert.rejects(
    db.query("SELECT public.virtual_commit_block($1,NULL,2,$2,$3,12,$4,1)", [
      dep,
      "hx",
      "h1",
      "[]",
    ]),
  );
  await db.query(
    "UPDATE public.virtual_deployments SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [dep],
  );
  await assert.rejects(
    db.query("SELECT public.virtual_commit_block($1,$2,2,$3,$4,12,$5,1)", [
      dep,
      fence,
      "hx",
      "h1",
      "[]",
    ]),
  );
  await db.exec(
    "INSERT INTO public.virtual_points_versions(month,version,formula,config_hash,approved) VALUES('2026-10-01','test-only','{}','digest',true)",
  );
  await assert.rejects(
    db.exec(
      "UPDATE public.virtual_points_versions SET formula='{\"weight\":999}' WHERE version='test-only'",
    ),
  );
  await assert.rejects(
    db.exec("DELETE FROM public.virtual_points_versions WHERE version='test-only'"),
  );
});

test("approved snapshots cannot gain, lose or mutate candidate scores", async () => {
  const snapshot = (
    await db.query(
      "INSERT INTO public.virtual_points_snapshots(month,version,deployment_id,cutoff_block,cutoff_hash,input_digest) VALUES('2026-10-01','test-only',$1,1,'h1','digest') RETURNING id",
      [dep],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO public.virtual_points_candidates(snapshot_id,wallet,inputs,score) VALUES($1,$2,'{}',10)",
    [snapshot, wallet],
  );
  await db.query("UPDATE public.virtual_points_snapshots SET status='approved' WHERE id=$1", [
    snapshot,
  ]);
  await assert.rejects(
    db.query("UPDATE public.virtual_points_candidates SET score=999 WHERE snapshot_id=$1", [
      snapshot,
    ]),
  );
  await assert.rejects(
    db.query("DELETE FROM public.virtual_points_candidates WHERE snapshot_id=$1", [snapshot]),
  );
  await assert.rejects(
    db.query(
      "INSERT INTO public.virtual_points_candidates(snapshot_id,wallet,inputs,score) VALUES($1,$2,'{}',50)",
      [snapshot, other],
    ),
  );
  await assert.rejects(
    db.query("UPDATE public.virtual_points_snapshots SET status='draft' WHERE id=$1", [snapshot]),
  );
  assert.equal(
    (
      await db.query("SELECT score FROM public.virtual_points_candidates WHERE snapshot_id=$1", [
        snapshot,
      ])
    ).rows[0].score,
    "10",
  );
});
