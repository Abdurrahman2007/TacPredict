import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { keccak256, concatHex } from "viem";
import { previewCampaign } from "../../../src/lib/virtual/campaign.ts";
import { futureWindows, lifecyclePlan } from "../../../src/lib/virtual/lifecycle.ts";
const engine = "0x" + "a".repeat(40),
  start = Date.parse("2027-01-01T00:00:00Z") / 1000;
const draft = {
  month: "2027-01",
  startsAt: start,
  endsAt: start + 86400,
  eligibility: "Verified unique eligible accounts; manual anti-Sybil review",
  budget: "300000000",
  maxPerWallet: "100000000",
  allocations: [1, 2, 3].map((n) => ({ wallet: "0x" + String(n).repeat(40), amount: "100000000" })),
};
test("deterministic domain-bound Merkle previews and proofs, no campaign activation", () => {
  const p = previewCampaign(draft, engine, 8453, "1", start - 10);
  const q = previewCampaign(
    { ...draft, allocations: [...draft.allocations].reverse() },
    engine,
    8453,
    "1",
    start - 10,
  );
  assert.equal(p.root, q.root);
  for (const a of p.allocations) {
    let h = a.leaf;
    for (const s of a.proof) h = keccak256(concatHex([h, s].sort()));
    assert.equal(h, p.root);
  }
  assert.notEqual(p.root, previewCampaign(draft, engine, 8453, "2", start - 10).root);
  assert.notEqual(p.root, previewCampaign(draft, engine, 84532, "1", start - 10).root);
  assert.equal(p.publicClaimsEnabled, false);
});
test("reject duplicate wallets, over-budget, invalid month/times and per-user cap", () => {
  for (const d of [
    { ...draft, allocations: [draft.allocations[0], draft.allocations[0]] },
    { ...draft, budget: "1" },
    { ...draft, maxPerWallet: "1" },
    { ...draft, startsAt: start - 1 },
    { ...draft, endsAt: start + 40 * 86400 },
    { ...draft, month: "2027-13" },
    { ...draft, eligibility: "" },
  ])
    assert.throws(() => previewCampaign(d, engine, 8453, "1", start - 10));
});
test("series planner is UTC aligned, unique, bounded and supports all five assets", () => {
  for (const a of ["BTC", "ETH", "SOL", "XRP", "BNB"]) {
    const p = futureWindows(a, 300, start + 1, 3);
    assert.equal(new Set(p.map((x) => x.key)).size, 3);
    assert(p.every((x) => x.startsAt % 300 === 0 && x.startsAt > start + 1));
  }
  assert.throws(() => futureWindows("BTC", 300, start, 1000));
});
test("keeper never silently finalizes disputed/missing evidence; timeout and immutable identity", () => {
  const m = {
    id: "1",
    startsAt: 10,
    closesAt: 20,
    resolutionDeadline: 100,
    startCaptured: true,
    proposed: false,
    disputed: false,
    final: false,
    challengeUntil: null,
    startRound: null,
    closingRound: null,
  };
  assert.deepEqual(lifecyclePlan([m], 30), []);
  assert.equal(lifecyclePlan([{ ...m, closingRound: "4" }], 30)[0].action, "proposeFromFeed");
  assert.deepEqual(
    lifecyclePlan([{ ...m, proposed: true, disputed: true, challengeUntil: 25 }], 30),
    [],
  );
  assert.equal(lifecyclePlan([m], 100)[0].action, "timeoutVoid");
  assert.throws(() => lifecyclePlan([m, m], 30));
});
test("virtual-only UI routes and execution boundaries fail closed without config", () => {
  const read = (n) => fs.readFileSync(new URL("../../../" + n, import.meta.url), "utf8");
  assert(!read("src/lib/protocol/market-feed.functions.ts").includes("readProtocolRpc"));
  assert(read("src/lib/protocol/execution.ts").includes("rejectRealAssetTrading();"));
  assert(read("src/lib/pool/pool-client.ts").includes("rejectRealAssetTrading();"));
  assert(!read("src/components/wallet-funding-dialog.tsx").includes("writeContract"));
  assert(!read("src/components/prediction-amount-card.tsx").includes("NativePredictionAmountCard"));
  assert(!read("src/components/wallet-connect-button.inner.tsx").includes("useBalance"));
});
test("campaign migration preserves RLS: service-only draft writes, atomic audit, no balance table writes", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; CREATE TABLE public.protocol_wallets(address text,user_id uuid,verified_at timestamptz);CREATE TABLE public.user_roles(user_id uuid,role text); GRANT SELECT ON public.protocol_wallets,public.user_roles TO authenticated;`,
    );
    await db.exec(
      fs.readFileSync(
        new URL("../../../supabase/migration-drafts/virtual-v1.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      fs.readFileSync(
        new URL("../../../supabase/migration-drafts/virtual-v2-campaigns.sql", import.meta.url),
        "utf8",
      ),
    );
    const user = "11111111-1111-1111-1111-111111111111";
    await db.exec(
      `INSERT INTO public.virtual_deployments(id,chain_id,engine,code_hash,start_block,checkpoint,finalized_block) VALUES('review',31337,'${engine}','hash',1,0,-1);INSERT INTO public.user_roles VALUES('${user}','admin');`,
    );
    await db.exec("SET ROLE anon");
    await assert.rejects(db.exec("SELECT * FROM public.virtual_campaign_drafts"));
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE authenticated");
    await assert.rejects(
      db.exec(
        `INSERT INTO public.virtual_campaign_drafts(deployment_id,month,version,configuration,created_by) VALUES('review','2027-01-01',1,'{}','${user}')`,
      ),
    );
    await assert.rejects(
      db.exec(`SELECT public.virtual_save_campaign_draft('review','2027-01-01',1,'{}','${user}')`),
    );
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE service_role");
    await db.exec(
      `SELECT public.virtual_save_campaign_draft('review','2027-01-01',1,'{}','${user}')`,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM public.virtual_admin_audit WHERE action='campaign.draft.saved'",
        )
      ).rows[0].n,
      1,
    );
    await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${user}'`);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM public.virtual_campaign_drafts")).rows[0].n,
      1,
    );
    await db.exec("SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222'");
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM public.virtual_campaign_drafts")).rows[0].n,
      0,
    );
    await db.exec("RESET ROLE");
  } finally {
    await db.close();
  }
});

test("retired reward routes cannot request real deposits or legacy promo credits", () => {
  for (const file of [
    "src/routes/rewards.tsx",
    "src/components/locked-reward-card.tsx",
    "src/components/reward-extras.tsx",
  ]) {
    const source = fs.readFileSync(new URL("../../../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /useRewardTasks|Deposit 5 USDC|redeem_tac_promo|Future withdrawals/,
    );
  }
});
