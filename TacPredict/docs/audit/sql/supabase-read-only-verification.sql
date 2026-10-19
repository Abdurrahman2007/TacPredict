-- Run only via an authorized read-only database/admin connection to the EXISTING project.
-- No DDL/DML, no migration application, no auth.users rows or secret values.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_user AS inspection_role;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT table_name, column_name, data_type, udt_name, numeric_precision, numeric_scale, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND (table_name LIKE 'protocol_%' OR table_name IN ('locked_usdc_rewards','user_rewards'))
ORDER BY table_name,ordinal_position;
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'protocol_%' AND c.relkind IN ('r','p') ORDER BY c.relname;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'protocol_%'
ORDER BY tablename,policyname;
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name LIKE 'protocol_%' ORDER BY table_name,grantee,privilege_type;
SELECT p.oid::regprocedure::text AS routine, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig AS settings, p.proacl AS privileges
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE '%protocol%' OR p.proname LIKE '%reward%')
ORDER BY p.proname,p.oid;
SELECT c.relname AS table_name, x.conname AS constraint_name, x.contype AS constraint_type,
       pg_get_constraintdef(x.oid) AS definition
FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'protocol_%' ORDER BY c.relname,x.conname;
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'protocol_%'
ORDER BY tablename,indexname;
-- Project ref must separately be verified from the connection/dashboard; a DB name alone is not proof.
-- Checkpoint column metadata is above. Query actual rows only after comparing the live column names;
-- record chain/block/hash/lease status only, without payloads, users, tokens or service credentials.
COMMIT;
