-- Read-only Base administrator snapshots; explicit role + AAL2. No balance writes or role grants.
BEGIN;
CREATE OR REPLACE FUNCTION public.prepare_protocol_market(_hash text,_rules_hash text,_source_hash text,_document jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'Admin MFA required' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin role required'; END IF;
 IF _document IS NULL OR jsonb_typeof(_document)<>'object' OR NOT (_document ?& ARRAY['title','description','category','outcomes','rules','source','sourceUrl']) THEN RAISE EXCEPTION 'Incomplete terms'; END IF;
 IF jsonb_typeof(_document->'outcomes')<>'array' OR coalesce(_document->>'category','') NOT IN('Crypto','Sports','News','Technology','Business','Culture','Other') OR coalesce(char_length(_document->>'title'),0) NOT BETWEEN 5 AND 200 OR coalesce(char_length(_document->>'description'),0)<20 OR coalesce(char_length(_document->>'rules'),0)<20 OR coalesce(char_length(_document->>'source'),0)<3 OR coalesce(_document->>'sourceUrl','') !~ '^https://' THEN RAISE EXCEPTION 'Invalid terms'; END IF;
 IF jsonb_array_length(_document->'outcomes') NOT BETWEEN 2 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(_document->'outcomes') x WHERE jsonb_typeof(x)<>'string' OR char_length(x#>>'{}') NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Invalid outcomes'; END IF;
 INSERT INTO public.protocol_market_metadata(metadata_hash,document,rules_hash,source_hash,approved,created_by) VALUES(_hash,_document,_rules_hash,_source_hash,true,auth.uid());
 INSERT INTO public.protocol_audit_logs(actor,action,target) VALUES(auth.uid(),'MARKET_METADATA_PREPARED',_hash); RETURN _hash;
END $$;
CREATE OR REPLACE FUNCTION public.get_protocol_admin_snapshot(_section text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; BEGIN
 IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Assigned admin and MFA required' USING ERRCODE='42501'; END IF;
 IF _section NOT IN('Dashboard','Markets','Trading','Resolution','Users','Blockchain','Treasury','Analytics','Audit','Settings') THEN RAISE EXCEPTION 'Invalid section'; END IF;
 CASE _section
 WHEN 'Dashboard' THEN
  SELECT jsonb_build_array(
   jsonb_build_object('id','markets','label','Native markets','detail',(SELECT count(*)::text FROM public.protocol_markets WHERE chain_id=8453)||' indexed markets on Base Mainnet','usdcAtoms',NULL,'observedAt',NULL),
   jsonb_build_object('id','open','label','Indexed open markets','detail',(SELECT count(*)::text FROM public.protocol_markets WHERE chain_id=8453 AND status='OPEN')||' with indexed OPEN state; time and pause restrictions still apply','usdcAtoms',NULL,'observedAt',NULL),
   jsonb_build_object('id','volume','label','Finalized trade volume','detail','All indexed Base Mainnet Exchange executions; not deposits, liquidity or rewards','usdcAtoms',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE chain_id=8453),'observedAt',NULL),
   jsonb_build_object('id','last-job','label','Latest indexer job','detail',coalesce((SELECT status FROM public.protocol_job_runs WHERE chain_id=8453 AND job='indexer' ORDER BY started_at DESC LIMIT 1),'Unavailable'),'usdcAtoms',NULL,'observedAt',(SELECT finished_at::text FROM public.protocol_job_runs WHERE chain_id=8453 AND job='indexer' ORDER BY started_at DESC LIMIT 1))
  ) INTO rows;
 WHEN 'Markets' THEN
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.at DESC),'[]'::jsonb) INTO rows FROM (
   SELECT jsonb_build_object('id',m.id::text,'label',m.market_id||' · '||m.title,'detail','On-chain ID '||m.onchain_id::text||E'\nStatus '||m.status||E'\nQuestion '||m.question_id||E'\nCondition '||m.condition_id||E'\nClose '||m.close_at::text,'usdcAtoms',m.liquidity_atomic::text,'observedAt',m.created_at::text) AS row,m.created_at AS at FROM public.protocol_markets m WHERE m.chain_id=8453
   UNION ALL SELECT jsonb_build_object('id','terms-'||md.metadata_hash,'label','Prepared terms · '||coalesce(md.document->>'title','Untitled'),'detail','Not an on-chain market or draft publication. Metadata hash '||md.metadata_hash,'usdcAtoms',NULL,'observedAt',md.created_at::text),md.created_at FROM public.protocol_market_metadata md WHERE md.approved AND NOT EXISTS(SELECT 1 FROM public.protocol_markets m WHERE m.chain_id=8453 AND m.metadata_hash=md.metadata_hash)
   ORDER BY at DESC LIMIT 50) x;
 WHEN 'Trading' THEN
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.at DESC),'[]'::jsonb) INTO rows FROM (SELECT jsonb_build_object('id',t.id::text,'label','Finalized trade · '||m.market_id,'detail','Outcome '||t.outcome_index::text||E'\nShares (atomic) '||t.shares_atomic::text||E'\nPrice (atomic USDC) '||t.price_atomic::text||E'\nTX '||t.tx_hash,'usdcAtoms',t.usdc_atomic::text,'observedAt',t.timestamp::text) AS row,t.timestamp AS at FROM public.protocol_trades t JOIN public.protocol_markets m ON m.id=t.market_uuid AND m.chain_id=8453 WHERE t.chain_id=8453 ORDER BY t.timestamp DESC LIMIT 50) x;
 WHEN 'Resolution' THEN
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.at DESC),'[]'::jsonb) INTO rows FROM (SELECT jsonb_build_object('id',r.id::text,'label',m.market_id||' · '||r.status,'detail','Outcome '||r.proposed_outcome::text||E'\nChallenge deadline '||r.challenge_deadline::text||E'\nEvidence '||r.evidence_hash||E'\nSource '||r.source_hash,'usdcAtoms',NULL,'observedAt',r.proposed_at::text) AS row,r.proposed_at AS at FROM public.protocol_resolutions r JOIN public.protocol_markets m ON m.id=r.market_uuid WHERE m.chain_id=8453 ORDER BY r.proposed_at DESC LIMIT 50) x;
 WHEN 'Users' THEN
  SELECT jsonb_build_array(jsonb_build_object('id','users','label','Registered accounts','detail',(SELECT count(*)::text FROM auth.users)||' real Supabase accounts. Counts are not wallet balances or active-trader counts.','usdcAtoms',NULL,'observedAt',NULL),jsonb_build_object('id','wallets','label','Verified wallet links','detail',(SELECT count(*)::text FROM public.protocol_wallets WHERE verified_at IS NOT NULL)||' proven wallet links. A connection alone does not establish ownership.','usdcAtoms',NULL,'observedAt',NULL)) INTO rows;
 WHEN 'Blockchain' THEN
  SELECT coalesce(jsonb_agg(x.row),'[]'::jsonb) INTO rows FROM (
   SELECT jsonb_build_object('id','checkpoint','label','Finalized checkpoint','detail',c.block_number::text||E'\nCanonical hash '||c.block_hash,'usdcAtoms',NULL,'observedAt',c.updated_at::text) AS row FROM public.protocol_indexer_checkpoints c WHERE c.chain_id=8453
   UNION ALL SELECT jsonb_build_object('id','deployment','label','Verified Base deployment','detail','Registry '||d.registry||E'\nFactory '||d.factory||E'\nPositions '||d.positions||E'\nExchange '||d.exchange||E'\nOracle '||d.oracle||E'\nSettlement '||d.settlement||E'\nDatabase trading enabled: '||d.trading_enabled::text||'. This is an indexed/config record, not a live RPC probe.','usdcAtoms',NULL,'observedAt',d.created_at::text) FROM public.protocol_deployments d WHERE d.chain_id=8453 AND d.verified
  ) x;
 WHEN 'Analytics' THEN
  SELECT jsonb_build_array(jsonb_build_object('id','volume24','label','24-hour finalized trade volume','detail','Native Base executions only','usdcAtoms',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE chain_id=8453 AND timestamp>now()-interval '24 hours'),'observedAt',NULL),jsonb_build_object('id','volume7','label','7-day finalized trade volume','detail','Native Base executions only','usdcAtoms',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE chain_id=8453 AND timestamp>now()-interval '7 days'),'observedAt',NULL)) INTO rows;
 WHEN 'Audit' THEN
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.at DESC),'[]'::jsonb) INTO rows FROM (SELECT jsonb_build_object('id',a.id::text,'label',a.action,'detail',coalesce(a.target,'No target recorded'),'usdcAtoms',NULL,'observedAt',a.created_at::text) AS row,a.created_at AS at FROM public.protocol_audit_logs a ORDER BY a.created_at DESC LIMIT 50) x;
 WHEN 'Treasury' THEN
  SELECT jsonb_build_array(jsonb_build_object('id','not-enabled','label','Treasury administration unavailable','detail','No treasury transfer or fee-sweep workflow is enabled. Available funds, claimable balances and protocol fees have not been inferred or fabricated.','usdcAtoms',NULL,'observedAt',NULL)) INTO rows;
 WHEN 'Settings' THEN
  SELECT jsonb_build_array(jsonb_build_object('id','security','label','Permission boundary','detail','Assigned Supabase admin + verified AAL2. Separate four-role administration is pending; no new role assignments were made. Contract authority still belongs to the on-chain role holders.','usdcAtoms',NULL,'observedAt',NULL)) INTO rows;
 END CASE;
 RETURN jsonb_build_object('chainId',8453,'section',_section,'rows',coalesce(rows,'[]'::jsonb),'observedAt',clock_timestamp()::text);
END $$;
REVOKE ALL ON FUNCTION public.get_protocol_admin_snapshot(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_protocol_admin_snapshot(text) TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_protocol_market(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_protocol_market(text,text,text,jsonb) TO authenticated;
COMMIT;
