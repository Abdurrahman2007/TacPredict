-- tacpredict_readonly_audit_preflight
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object('database',current_database(),'inspectionRole',current_user,'transactionReadOnly',current_setting('transaction_read_only'),'migrationTable',to_regclass('supabase_migrations.schema_migrations')::text,'projectTables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'protocol_%')) AS audit_metadata;
COMMIT;
