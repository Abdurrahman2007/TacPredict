-- EXISTING project only: lmqaiqvwcytmgwgwyfwx. Verify project ref in connection/dashboard first.
-- Metadata-only. NO migration, DDL, DML, application RPC calls, payloads, user rows or credentials.
-- Run as a role allowed to inspect metadata. Missing catalog privileges are a blocker, not proof of absence.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object('database',current_database(),'inspectionRole',current_user,
 'transactionReadOnly',current_setting('transaction_read_only'),'serverVersion',current_setting('server_version')) AS connection_metadata;
-- Export version/name only. Never export migration statements that might embed configuration values.
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
-- All PUBLIC relations, not just protocol_%: includes users/wallets and legacy reward tables.
SELECT c.relname AS relation,c.relkind,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS rls_forced,
 pg_get_userbyid(c.relowner) AS owner,c.reloptions,
 md5(CASE WHEN c.relkind IN('v','m') THEN pg_get_viewdef(c.oid,true) ELSE '' END) AS view_definition_md5
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') ORDER BY c.relname;
SELECT table_name,column_name,data_type,udt_name,numeric_precision,numeric_scale,is_nullable
FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
-- Expand ACLs including PUBLIC, not only grants visible through information_schema role_table_grants.
SELECT c.relname AS relation,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
 a.privilege_type,a.is_grantable
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') ORDER BY c.relname,grantee,a.privilege_type;
SELECT table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
WHERE table_schema='public' ORDER BY table_name,column_name,grantee,privilege_type;
SELECT c.relname AS relation,r.rolname AS api_role,
 has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
 has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
 has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete,
 has_table_privilege(r.oid,c.oid,'TRUNCATE') AS can_truncate
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f')
AND r.rolname IN('anon','authenticated','service_role') ORDER BY c.relname,r.rolname;
SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,
 l.lanname AS language,p.prosecdef AS security_definer,p.provolatile,p.proconfig AS settings,p.proacl AS acl,
 md5(p.prosrc) AS prosrc_md5,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.prokind IN('f','p') ORDER BY p.proname,p.oid;
SELECT n.nspname AS schema,pg_get_userbyid(n.nspowner) AS owner,n.nspacl,
 has_schema_privilege('anon',n.oid,'CREATE') AS anon_create,
 has_schema_privilege('authenticated',n.oid,'CREATE') AS authenticated_create
FROM pg_namespace n WHERE n.nspname IN('public','auth','supabase_migrations');
SELECT rolname,rolsuper,rolinherit,rolbypassrls FROM pg_roles
WHERE rolname IN('anon','authenticated','service_role','authenticator') OR oid IN
 (SELECT DISTINCT relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public');
SELECT pg_get_userbyid(roleid) AS inherited_role,pg_get_userbyid(member) AS member,admin_option
FROM pg_auth_members WHERE member IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','authenticator'));
SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname AS schema,d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE n.nspname='public' OR d.defaclnamespace=0;
SELECT c.relname AS relation,x.conname,x.contype,pg_get_constraintdef(x.oid) AS definition
FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY c.relname,x.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
SELECT c.relname AS relation,t.tgname,t.tgenabled,p.oid::regprocedure::text AS routine
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
SELECT pubname,schemaname,tablename FROM pg_publication_tables WHERE schemaname='public' ORDER BY pubname,tablename;
-- NO calls to register_my_protocol_wallet/get_my_native_reward_tasks: they may INSERT despite read-like names.
-- Do not run policy tests by changing production user identity. Use isolated staging for user A/B enforcement.
COMMIT;
