-- Owner approved read-only aggregate reconciliation continuation. No user/address/payload rows.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object(
 'mode','READ_ONLY_COVERAGE_COUNTS_NOT_CHAIN_PROOF',
 'observedAt',clock_timestamp(),
 'transactionReadOnly',current_setting('transaction_read_only'),
 'migrationLedgerPresent',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
 'marketCount',(SELECT count(*)::text FROM public.protocol_markets WHERE chain_id=8453),
 'tradeCount',(SELECT count(*)::text FROM public.protocol_trades WHERE chain_id=8453),
 'principalClaimCount',(SELECT count(*)::text FROM public.protocol_claims WHERE chain_id=8453),
 'principalRefundCount',(SELECT count(*)::text FROM public.protocol_refunds WHERE chain_id=8453),
 'rawEventCounts',(SELECT coalesce(jsonb_agg(jsonb_build_object('eventName',event_name,'count',n) ORDER BY event_name),'[]'::jsonb) FROM (SELECT event_name,count(*)::text n FROM public.protocol_chain_events WHERE chain_id=8453 GROUP BY event_name) e),
 'indexerRunCountsLast24Hours',(SELECT coalesce(jsonb_agg(jsonb_build_object('status',status,'count',n) ORDER BY status),'[]'::jsonb) FROM (SELECT status,count(*)::text n FROM public.protocol_job_runs WHERE chain_id=8453 AND job='indexer' AND started_at>=now()-interval '24 hours' GROUP BY status) j),
 'launchAuthorized',false
) AS reconciliation_coverage;
COMMIT;
