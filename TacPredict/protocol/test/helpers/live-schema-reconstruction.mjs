/** Private snapshot -> isolated local PG only. No production connector, .env, network or signer. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createLocalPostgresDatabase } from "./local-postgres-database.mjs";
const ident = (s) => {
  if (typeof s !== "string" || !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(s))
    throw Error("Unsupported metadata identifier");
  return '"' + s + '"';
};
const policyIdent = (s) => {
  if (typeof s !== "string" || !s.length || s.includes("\0") || Buffer.byteLength(s) > 63)
    throw Error("Unsupported policy name");
  return '"' + s.replaceAll('"', '""') + '"';
};
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const rights = {
  r: "SELECT",
  a: "INSERT",
  w: "UPDATE",
  d: "DELETE",
  D: "TRUNCATE",
  x: "REFERENCES",
  t: "TRIGGER",
  m: "MAINTAIN",
  X: "EXECUTE",
  U: "USAGE",
  C: "CREATE",
};
function aclEntries(text) {
  if (!text) return null;
  return text
    .replace(/^\{|\}$/g, "")
    .split(",")
    .filter(Boolean)
    .map((x) => {
      const m = x.replaceAll('"', "").match(/^([^=]*)=([^/]*)\/(.+)$/);
      if (!m) throw Error("Unsupported ACL representation");
      return { role: m[1] || "PUBLIC", rights: m[2] };
    });
}
const role = (s) => (s === "PUBLIC" ? "PUBLIC" : ident(s));
async function applyAcl(db, object, text, knownRoles, column) {
  for (const r of ["PUBLIC", ...knownRoles])
    await db.exec(`REVOKE ALL ON ${object} FROM ${role(r)}`);
  const entries = aclEntries(text);
  if (entries === null) {
    if (object.startsWith("FUNCTION ")) await db.exec(`GRANT EXECUTE ON ${object} TO PUBLIC`);
    return;
  }
  for (const e of entries)
    for (let i = 0; i < e.rights.length; i++) {
      const c = e.rights[i];
      if (c === "*") continue;
      if (!rights[c]) throw Error("Unknown ACL privilege");
      const opt = e.rights[i + 1] === "*" ? " WITH GRANT OPTION" : "";
      await db.exec(
        `GRANT ${rights[c]}${column ? " (" + ident(column) + ")" : ""} ON ${object} TO ${role(e.role)}${opt}`,
      );
    }
}
export async function reconstructLiveSchema(file) {
  if (!process.env.TACP_LOCAL_PG_SOCKET)
    throw Error("Private ephemeral PostgreSQL runner required");
  const bytes = await readFile(file);
  if (bytes.length > 2 * 1024 * 1024) throw Error("Oversized metadata snapshot");
  const snapshot = JSON.parse(bytes),
    j = snapshot.metadata;
  if (
    j?.mode !== "SCHEMA_AND_SOURCE_ALLOWLISTED_FUNCTIONS_ONLY" ||
    j.transactionReadOnly !== "on" ||
    j.userRowsExported !== false ||
    snapshot.withheldExpressionPaths?.length
  )
    throw Error("Unscreened/incomplete metadata snapshot");
  const db = await createLocalPostgresDatabase();
  try {
    const roles = new Set([
      "anon",
      "authenticated",
      "service_role",
      "supabase_admin",
      "authenticator",
      "dashboard_user",
    ]);
    for (const x of [...j.relations, ...j.schemas, ...j.functions, ...j.defaultAcls]) {
      if (x.owner && !x.owner.startsWith("pg_") && x.owner !== "postgres") roles.add(x.owner);
      for (const e of aclEntries(x.acl) || [])
        if (e.role !== "PUBLIC" && e.role !== "postgres" && !e.role.startsWith("pg_"))
          roles.add(e.role);
    }
    for (const name of roles) {
      ident(name);
      const rr = j.apiRoles.find((r) => r.name === name);
      await db.exec(
        `DO $$ BEGIN CREATE ROLE ${ident(name)} NOLOGIN ${rr?.bypassRls ? "BYPASSRLS" : "NOBYPASSRLS"}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    }
    await db.exec(
      `CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE TABLE auth.identities(user_id uuid,provider text,identity_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;SET check_function_bodies=off;`,
    );
    for (const e of j.enums)
      await db.exec(
        `CREATE TYPE public.${ident(e.name)} AS ENUM (${e.labels.map(literal).join(",")})`,
      );
    const tables = j.relations.filter((r) => ["r", "p"].includes(r.kind));
    for (const t of tables) {
      if (t.kind !== "r") throw Error("Partitioned relation needs separate reconstruction review");
      const cols = j.columns
        .filter((c) => c.table === t.name)
        .sort((a, b) => a.position - b.position)
        .map((c) => {
          if (
            !/^(?:app_role|bigint|boolean|date|integer|jsonb|numeric(?:\(\d+,\d+\))?|smallint|text(?:\[\])?|timestamp with time zone|uuid)$/.test(
              c.type,
            ) ||
            c.identity
          )
            throw Error("Unsupported column metadata");
          return `${ident(c.name)} ${c.type}${c.generated ? ` GENERATED ALWAYS AS (${c.defaultExpression}) STORED` : c.defaultExpression ? ` DEFAULT ${c.defaultExpression}` : ""}${c.notNull ? " NOT NULL" : ""}`;
        });
      await db.exec(`CREATE TABLE public.${ident(t.name)} (${cols.join(",")})`);
    }
    const imported = [];
    for (const f of j.functions) {
      if (!f.definition) continue;
      const m = f.definition.match(/\bAS\s+(\$[A-Za-z_0-9]*\$)([\s\S]*)\1\s*;?\s*$/i);
      if (
        !m ||
        createHash("sha256").update(m[2]).digest("hex") !== f.bodySha256 ||
        !f.bodyMatchesReviewedSource
      )
        throw Error("Function body hash mismatch");
      if (!["sql", "plpgsql"].includes(f.language)) throw Error("Unsupported function language");
      await db.exec(f.definition);
      imported.push(f);
    }
    for (const c of [
      ...j.constraints.filter((c) => c.type !== "f"),
      ...j.constraints.filter((c) => c.type === "f"),
    ])
      await db.exec(
        `ALTER TABLE public.${ident(c.table)} ADD CONSTRAINT ${ident(c.name)} ${c.definition}${!c.validated && !/NOT VALID$/i.test(c.definition) ? " NOT VALID" : ""}`,
      );
    const constraintIndexes = new Set(
      j.constraints.filter((c) => ["p", "u", "x"].includes(c.type)).map((c) => c.name),
    );
    for (const i of j.indexes) {
      if (!i.valid || !i.ready) throw Error("Invalid index needs review");
      if (!constraintIndexes.has(i.name)) await db.exec(i.definition);
    }
    for (const v of j.views) {
      const r = j.relations.find((r) => r.name === v.name);
      if (r.kind !== "v") throw Error("Materialized views unsupported");
      await db.exec(
        `CREATE VIEW public.${ident(v.name)}${r.options?.length ? " WITH (" + r.options.join(",") + ")" : ""} AS ${v.definition}`,
      );
    }
    await db.exec("SET check_function_bodies=on");
    for (const f of imported) await db.exec(f.definition);
    for (const p of j.policies) {
      if (!["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"].includes(p.command))
        throw Error("Unsupported policy command");
      await db.exec(
        `CREATE POLICY ${policyIdent(p.name)} ON public.${ident(p.table)} AS ${p.permissive} FOR ${p.command} TO ${p.roles.map((r) => (r === "public" ? "PUBLIC" : role(r))).join(",")}${p.using ? " USING (" + p.using + ")" : ""}${p.check ? " WITH CHECK (" + p.check + ")" : ""}`,
      );
    }
    for (const r of j.relations) {
      if (["r", "p"].includes(r.kind)) {
        await db.exec(
          `ALTER TABLE public.${ident(r.name)} ${r.rlsEnabled ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY`,
        );
        if (r.rlsForced)
          await db.exec(`ALTER TABLE public.${ident(r.name)} FORCE ROW LEVEL SECURITY`);
      }
      await applyAcl(db, `TABLE public.${ident(r.name)}`, r.acl, [...roles]);
    }
    for (const c of j.columns)
      if (c.acl) {
        for (const e of aclEntries(c.acl))
          for (let i = 0; i < e.rights.length; i++) {
            const x = e.rights[i];
            if (x === "*") continue;
            await db.exec(
              `GRANT ${rights[x]} (${ident(c.name)}) ON public.${ident(c.table)} TO ${role(e.role)}${e.rights[i + 1] === "*" ? " WITH GRANT OPTION" : ""}`,
            );
          }
      }
    for (const f of imported) {
      const rr = await db.query(
        `SELECT oid::regprocedure::text signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1 AND pg_get_function_identity_arguments(oid)=$2`,
        [f.name, f.identityArgs],
      );
      if (rr.rows.length !== 1) throw Error("Ambiguous reconstructed function");
      await applyAcl(db, "FUNCTION " + rr.rows[0].signature, f.acl, [...roles]);
    }
    for (const s of j.schemas) await applyAcl(db, "SCHEMA " + ident(s.name), s.acl, [...roles]);
    // Replay default ACLs only for the reconstructed public schema/global postgres scope.
    for (const d of j.defaultAcls) {
      if (d.schema && d.schema !== "public") continue;
      const typ = { r: "TABLES", S: "SEQUENCES", f: "FUNCTIONS", T: "TYPES" }[d.objectType];
      if (!typ) throw Error("Unsupported default ACL object");
      const base = `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(d.owner)}${d.schema ? " IN SCHEMA public" : ""}`;
      for (const r of ["PUBLIC", ...roles])
        await db.exec(`${base} REVOKE ALL ON ${typ} FROM ${role(r)}`);
      for (const e of aclEntries(d.acl) || [])
        for (let i = 0; i < e.rights.length; i++) {
          const c = e.rights[i];
          if (c === "*") continue;
          await db.exec(
            `${base} GRANT ${rights[c]} ON ${typ} TO ${role(e.role)}${e.rights[i + 1] === "*" ? " WITH GRANT OPTION" : ""}`,
          );
        }
    }
    return {
      db,
      metadata: j,
      manifest: {
        snapshotSha256: createHash("sha256").update(bytes).digest("hex"),
        tables: tables.length,
        views: j.views.length,
        policies: j.policies.length,
        sourceMatchedFunctions: imported.length,
        withheldFunctions: j.functions.filter((f) => !f.definition).map((f) => f.name),
        excludedAuthTriggers: j.triggers.filter((t) => t.schema === "auth").map((t) => t.name),
        authEmulated: true,
        fullProductionClone: false,
      },
    };
  } catch (e) {
    await db.close();
    throw e;
  }
}
