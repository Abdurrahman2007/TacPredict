-- tacpredict_readonly_audit_flags
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object(
'orderbook', (SELECT jsonb_build_object('hasZeroTakerPredicate',position('0x0000000000000000000000000000000000000000' IN pg_get_viewdef(c.oid,true))>0,'mentionsVerifiedDeployment',position('verified' IN pg_get_viewdef(c.oid,true))>0,'mentionsTradingEnabled',position('trading_enabled' IN pg_get_viewdef(c.oid,true))>0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='protocol_orderbook'),
'eventIndexer',(SELECT jsonb_build_object('containsMissingParentSuccess',position('IF m.id IS NULL THEN RETURN true;' IN p.prosrc)>0) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='apply_protocol_event'),
'portfolio',(SELECT jsonb_build_object('mentionsVerifiedAt',position('verified_at' IN p.prosrc)>0) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_my_protocol_portfolio')
) AS audit_metadata;
COMMIT;
