import { createLocalPostgresDatabase } from "./local-postgres-database.mjs";
import { readFile } from "node:fs/promises";
import { PGlite } from "../sql-runtime/node_modules/@electric-sql/pglite/dist/index.js";
const root = new URL("../../../", import.meta.url);
const A = "10000000-0000-0000-0000-000000000001",
  B = "20000000-0000-0000-0000-000000000002";
const addr = (n) => "0x" + n.repeat(40),
  hash = (n) => "0x" + n.repeat(64),
  zero = addr("0");
const registry = addr("1"),
  factory = addr("2"),
  positions = addr("3"),
  exchange = addr("4"),
  oracle = addr("5");
let serial = 0;
const nextHash = () => "0x" + (++serial).toString(16).padStart(64, "0");
async function fixture() {
  const db = process.env.TACP_LOCAL_PG_SOCKET ? await createLocalPostgresDatabase() : new PGlite();
  try {
    await db.exec(`DO $$BEGIN CREATE ROLE anon;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
 DO $$BEGIN CREATE ROLE authenticated;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
 DO $$BEGIN CREATE ROLE service_role BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb);
 CREATE TABLE auth.identities(user_id uuid,provider text,identity_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE public.user_roles(user_id uuid,role text);
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
 INSERT INTO auth.users VALUES('${A}','{}'),('${B}','{}');`);
    for (const name of [
      "202610080004_native_usdc_protocol.sql",
      "202610080006_native_protocol_hardening.sql",
      "202610080009_chain_aware_native_ids.sql",
      "202610080011_indexer_scope_and_evidence.sql",
      "202610080012_exact_indexed_void_claims.sql",
      "202610080014_protocol_job_fencing.sql",
      "202610120020_web3_wallets_users.sql",
    ]) {
      // Test fixture uses core gen_random_uuid; pgcrypto is not needed by these tested paths.
      const sql = await readFile(new URL("supabase/migrations/" + name, root), "utf8");
      await db.exec(sql.replace(/create extension if not exists "pgcrypto";/i, ""));
    }
    for (const n of ["security-access-hardening.sql", "indexer-atomic-projection-guard.sql"])
      await db.exec(await readFile(new URL("docs/audit/proposals/" + n, root), "utf8"));
    await db.query(
      `INSERT INTO protocol_deployments(chain_id,collateral_token,registry,factory,positions,exchange,oracle,settlement,deployment_block,code_hashes,verified,trading_enabled) VALUES(84532,'0x036cbd53842c5426634e7929541ec2318f3dcf7e',$1,$2,$3,$4,$5,$6,1,'{}',true,true)`,
      [registry, factory, positions, exchange, oracle, addr("6")],
    );
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
async function event(
  db,
  name,
  payload,
  { tx = nextHash(), log = 0, contract, chain = 84532, blockHash = hash("a") } = {},
) {
  contract ??=
    name === "MarketCreated" || name === "MarketClosed" || name === "ResolutionFinalized"
      ? registry
      : name === "MetadataPublished"
        ? factory
        : ["OrderFilled", "OrderCancelled", "NonceInvalidated", "TradeExecuted"].includes(name)
          ? exchange
          : name.startsWith("Transfer") ||
              ["PositionCreated", "CompleteSetMerged", "PositionRedeemed"].includes(name)
            ? positions
            : oracle;
  return (
    await db.query(
      "SELECT public.apply_protocol_event($1,10,$2,$3,$4,$5,$6,$7::jsonb,now()) AS applied",
      [chain, blockHash, tx, log, contract, name, JSON.stringify(payload)],
    )
  ).rows[0].applied;
}
const creation = {
  marketId: "1",
  questionId: hash("1"),
  conditionId: hash("2"),
  metadataHash: hash("3"),
  rulesHash: hash("4"),
  sourceHash: hash("5"),
  outcomeCount: 2,
  oracle,
  openAt: "1700000000",
  closeAt: "2000000000",
  resolveAfter: "2000000000",
  resolutionDeadline: "2000200000",
  tokenIds: ["101", "102"],
};
const trade = {
  marketId: "1",
  buyer: addr("a"),
  seller: addr("b"),
  outcome: 0,
  price: "500000",
  shares: "1000000",
  usdcAmount: "500000",
  buyOrderId: hash("b"),
  sellOrderId: hash("c"),
};
async function asUser(db, user, query) {
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${user}';`);
  try {
    return await db.query(query);
  } finally {
    await db.exec("RESET ROLE;RESET request.jwt.claim.sub;");
  }
}

export {
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
};
