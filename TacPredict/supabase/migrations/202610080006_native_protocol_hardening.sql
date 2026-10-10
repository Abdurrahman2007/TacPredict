BEGIN;
CREATE OR REPLACE FUNCTION public.apply_protocol_event(_chain bigint,_block numeric,_block_hash text,_tx text,_log integer,_contract text,_event text,_payload jsonb,_timestamp timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.protocol_deployments; m public.protocol_markets; meta public.protocol_market_metadata; w uuid; inserted integer; i integer; p numeric; owner_address text; token numeric; delta numeric; outcome smallint; BEGIN
 SELECT * INTO d FROM public.protocol_deployments WHERE chain_id=_chain AND verified;
 IF d.chain_id IS NULL OR _block<d.deployment_block OR lower(_contract) NOT IN(lower(d.registry),lower(d.factory),lower(d.positions),lower(d.exchange),lower(d.oracle),lower(d.settlement)) THEN RAISE EXCEPTION 'Unverified deployment/emitter'; END IF;
 IF _event NOT IN('MarketCreated','MarketClosed','ResolutionFinalized','TransferSingle','TransferBatch','PositionCreated','CompleteSetMerged','PositionRedeemed','OrderFilled','OrderCancelled','NonceInvalidated','TradeExecuted','ResolutionProposed','ResolutionDisputed','DisputeFinalized','BondWithdrawn','MetadataPublished') THEN RAISE EXCEPTION 'Unsupported protocol event'; END IF;
 IF _tx !~ '^0x[0-9a-f]{64}$' OR _block_hash !~ '^0x[0-9a-f]{64}$' OR _log<0 OR jsonb_typeof(_payload)<>'object' OR octet_length(_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid event'; END IF;
 IF (_event IN('MarketCreated','MarketClosed','ResolutionFinalized') AND lower(_contract)<>lower(d.registry)) OR (_event IN('TransferSingle','TransferBatch','PositionCreated','CompleteSetMerged','PositionRedeemed') AND lower(_contract)<>lower(d.positions)) OR (_event IN('OrderFilled','OrderCancelled','NonceInvalidated','TradeExecuted') AND lower(_contract)<>lower(d.exchange)) OR (_event IN('ResolutionProposed','ResolutionDisputed','DisputeFinalized','BondWithdrawn') AND lower(_contract)<>lower(d.oracle)) OR (_event='MetadataPublished' AND lower(_contract)<>lower(d.factory)) THEN RAISE EXCEPTION 'Wrong event emitter'; END IF;
 INSERT INTO public.protocol_chain_events VALUES(_chain,_tx,_log,_block,_block_hash,lower(_contract),_event,_payload,now()) ON CONFLICT DO NOTHING; GET DIAGNOSTICS inserted=ROW_COUNT; IF inserted=0 THEN RETURN false; END IF;
 INSERT INTO public.protocol_transactions VALUES(_chain,_tx,_block,_block_hash,lower(_contract),'FINALIZED') ON CONFLICT DO NOTHING;
 IF _event='MarketCreated' THEN
  SELECT * INTO meta FROM public.protocol_market_metadata WHERE metadata_hash=_payload->>'metadataHash' AND approved AND rules_hash=_payload->>'rulesHash' AND source_hash=_payload->>'sourceHash';
  INSERT INTO public.protocol_markets(chain_id,onchain_id,question_id,condition_id,metadata_hash,title,description,category,subcategory,image_url,tags,oracle,resolution_source,source_url,rules,rules_hash,source_hash,outcome_count,status,open_at,close_at,resolve_after,resolution_deadline,created_at,published)
  VALUES(_chain,(_payload->>'marketId')::numeric,_payload->>'questionId',_payload->>'conditionId',_payload->>'metadataHash',coalesce(meta.document->>'title','Unpublished on-chain market'),coalesce(meta.document->>'description',''),coalesce(meta.document->>'category','Other'),meta.document->>'subcategory',meta.document->>'image',coalesce(ARRAY(SELECT jsonb_array_elements_text(meta.document->'tags')),'{}'),lower(_payload->>'oracle'),coalesce(meta.document->>'source',''),coalesce(meta.document->>'sourceUrl',''),coalesce(meta.document->>'rules',''),_payload->>'rulesHash',_payload->>'sourceHash',(_payload->>'outcomeCount')::smallint,'UPCOMING',to_timestamp((_payload->>'openAt')::double precision),to_timestamp((_payload->>'closeAt')::double precision),to_timestamp((_payload->>'resolveAfter')::double precision),to_timestamp((_payload->>'resolutionDeadline')::double precision),_timestamp,meta.metadata_hash IS NOT NULL) RETURNING * INTO m;
  FOR i IN 0..m.outcome_count-1 LOOP INSERT INTO public.protocol_market_outcomes(market_uuid,outcome_index,label,token_id) VALUES(m.id,i,coalesce(meta.document->'outcomes'->>i,'Outcome '||i),(_payload->'tokenIds'->>i)::numeric); END LOOP;
  INSERT INTO public.protocol_market_rules VALUES(m.id,m.rules_hash,m.rules);
  INSERT INTO public.protocol_market_sources(market_uuid,source_url,source_hash) VALUES(m.id,m.source_url,m.source_hash);
  RETURN true;
 END IF;
 IF _event IN('TransferSingle','TransferBatch') THEN
  -- ERC1155 self-transfers emit logs but leave both balances unchanged.
  IF lower(_payload->>'from')=lower(_payload->>'to') THEN RETURN true; END IF;
  FOR i IN 0..(CASE WHEN _event='TransferSingle' THEN 0 ELSE jsonb_array_length(_payload->'ids')-1 END) LOOP
   token=CASE WHEN _event='TransferSingle' THEN (_payload->>'id')::numeric ELSE (_payload->'ids'->>i)::numeric END;
   delta=CASE WHEN _event='TransferSingle' THEN (_payload->>'value')::numeric ELSE (_payload->'values'->>i)::numeric END;
   SELECT pm.* INTO m FROM public.protocol_markets pm JOIN public.protocol_market_outcomes o ON o.market_uuid=pm.id WHERE pm.chain_id=_chain AND o.token_id=token;
   IF m.id IS NULL THEN RAISE EXCEPTION 'Unindexed outcome token'; END IF;
   SELECT outcome_index INTO outcome FROM public.protocol_market_outcomes WHERE market_uuid=m.id AND token_id=token;
   FOREACH owner_address IN ARRAY ARRAY[lower(_payload->>'from'),lower(_payload->>'to')] LOOP
    IF owner_address<>'0x0000000000000000000000000000000000000000' THEN
     INSERT INTO public.protocol_wallets(address) VALUES(owner_address) ON CONFLICT DO NOTHING; SELECT id INTO w FROM public.protocol_wallets WHERE address=owner_address;
     INSERT INTO public.protocol_positions(market_uuid,wallet_id,outcome_index) VALUES(m.id,w,outcome) ON CONFLICT DO NOTHING;
     UPDATE public.protocol_positions SET shares_atomic=shares_atomic+CASE WHEN owner_address=lower(_payload->>'from') THEN -delta ELSE delta END,updated_at=_timestamp WHERE market_uuid=m.id AND wallet_id=w AND outcome_index=outcome;
    END IF;
   END LOOP;
  END LOOP; RETURN true;
 END IF;
 SELECT * INTO m FROM public.protocol_markets WHERE chain_id=_chain AND onchain_id=(_payload->>'marketId')::numeric;
 IF _event IN('OrderCancelled','NonceInvalidated') THEN
  UPDATE public.protocol_orders SET status='CANCELLED' WHERE (_event='OrderCancelled' AND order_id=_payload->>'orderId') OR (_event='NonceInvalidated' AND maker=lower(_payload->>'maker') AND nonce<(_payload->>'nonce')::numeric); RETURN true;
 END IF;
 IF m.id IS NULL THEN RETURN true; END IF;
 IF _event='PositionCreated' THEN UPDATE public.protocol_markets SET open_interest_atomic=open_interest_atomic+(_payload->>'collateral')::numeric WHERE id=m.id;
 ELSIF _event='CompleteSetMerged' THEN UPDATE public.protocol_markets SET open_interest_atomic=open_interest_atomic-(_payload->>'collateral')::numeric WHERE id=m.id;
 ELSIF _event='PositionRedeemed' THEN
  p=(_payload->>'collateral')::numeric; UPDATE public.protocol_markets SET open_interest_atomic=open_interest_atomic-p WHERE id=m.id;
  SELECT id INTO w FROM public.protocol_wallets WHERE address=lower(_payload->>'account');
  IF (_payload->>'voided')::boolean THEN INSERT INTO public.protocol_refunds(market_uuid,wallet_id,amount_atomic,chain_id,tx_hash,log_index,created_at) VALUES(m.id,w,p,_chain,_tx,_log,_timestamp); ELSE INSERT INTO public.protocol_claims(market_uuid,wallet_id,amount_atomic,chain_id,tx_hash,log_index,created_at) VALUES(m.id,w,p,_chain,_tx,_log,_timestamp); END IF;
  UPDATE public.protocol_positions SET status=CASE WHEN (_payload->>'voided')::boolean THEN 'REFUNDED' ELSE 'CLAIMED' END WHERE market_uuid=m.id AND wallet_id=w;
 ELSIF _event='TradeExecuted' THEN
  INSERT INTO public.protocol_trades(market_uuid,chain_id,tx_hash,log_index,buy_order_id,sell_order_id,buyer,seller,outcome_index,price_atomic,shares_atomic,usdc_atomic,timestamp) VALUES(m.id,_chain,_tx,_log,_payload->>'buyOrderId',_payload->>'sellOrderId',lower(_payload->>'buyer'),lower(_payload->>'seller'),(_payload->>'outcome')::smallint,(_payload->>'price')::numeric,(_payload->>'shares')::numeric,(_payload->>'usdcAmount')::numeric,_timestamp);
  UPDATE public.protocol_market_outcomes SET last_price_atomic=(_payload->>'price')::numeric WHERE market_uuid=m.id AND outcome_index=(_payload->>'outcome')::smallint;
  INSERT INTO public.protocol_market_prices VALUES(m.id,(_payload->>'outcome')::smallint,(_payload->>'price')::numeric,_timestamp,_tx,_log);
 ELSIF _event='OrderFilled' THEN UPDATE public.protocol_orders SET filled_atomic=(_payload->>'totalFilled')::numeric,status=CASE WHEN (_payload->>'totalFilled')::numeric>=shares_atomic THEN 'FILLED' ELSE 'PARTIAL' END WHERE order_id=_payload->>'orderId';
 ELSIF _event='MarketClosed' THEN UPDATE public.protocol_markets SET status='CLOSED' WHERE id=m.id;
 ELSIF _event='ResolutionProposed' THEN
  INSERT INTO public.protocol_resolutions(market_uuid,proposer,proposed_outcome,voided,evidence_hash,source_hash,source_timestamp,proposed_at,challenge_deadline,status) VALUES(m.id,lower(_payload->>'proposer'),(_payload->>'outcome')::smallint,(_payload->>'voided')::boolean,_payload->>'evidenceHash',_payload->>'sourceHash',to_timestamp((_payload->>'sourceTimestamp')::double precision),_timestamp,to_timestamp((_payload->>'challengeDeadline')::double precision),'PROPOSED');
  INSERT INTO public.protocol_resolution_evidence(market_uuid,evidence_hash,source_url,source_timestamp) VALUES(m.id,_payload->>'evidenceHash',m.source_url,to_timestamp((_payload->>'sourceTimestamp')::double precision));
  UPDATE public.protocol_markets SET status='RESOLVING' WHERE id=m.id;
 ELSIF _event='ResolutionDisputed' THEN
  INSERT INTO public.protocol_disputes(market_uuid,disputer,alternative,evidence_hash,voided,created_at) VALUES(m.id,lower(_payload->>'disputer'),(_payload->>'alternative')::smallint,_payload->>'evidenceHash',(_payload->>'voided')::boolean,_timestamp);
  UPDATE public.protocol_resolutions SET status='DISPUTED' WHERE market_uuid=m.id;
 ELSIF _event='ResolutionFinalized' THEN
  FOR i IN 0..jsonb_array_length(_payload->'weights')-1 LOOP UPDATE public.protocol_market_outcomes SET payout_weight=(_payload->'weights'->>i)::numeric WHERE market_uuid=m.id AND outcome_index=i; END LOOP;
  UPDATE public.protocol_markets SET status=CASE WHEN (_payload->>'voided')::boolean THEN 'VOID' ELSE 'RESOLVED' END WHERE id=m.id;
  UPDATE public.protocol_positions SET status='CLOSED' WHERE market_uuid=m.id AND status='OPEN';
  UPDATE public.protocol_resolutions SET status=CASE WHEN (_payload->>'voided')::boolean THEN 'VOID' ELSE 'FINAL' END,finalized_at=_timestamp WHERE market_uuid=m.id;
  UPDATE public.protocol_disputes SET status='FINAL' WHERE market_uuid=m.id;
 END IF; RETURN true;
END $$;
ALTER TABLE public.protocol_refunds ADD CONSTRAINT protocol_refunds_market_fk FOREIGN KEY(market_uuid) REFERENCES public.protocol_markets(id);
ALTER TABLE public.protocol_refunds ADD CONSTRAINT protocol_refunds_wallet_fk FOREIGN KEY(wallet_id) REFERENCES public.protocol_wallets(id);
CREATE FUNCTION public.get_protocol_market_activity(_market_id text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT coalesce(jsonb_agg(jsonb_build_object('txHash',t.tx_hash,'chainId',t.chain_id,'outcome',o.label,'priceAtomic',t.price_atomic::text,'sharesAtomic',t.shares_atomic::text,'usdcAtomic',t.usdc_atomic::text,'timestamp',t.timestamp) ORDER BY t.timestamp DESC),'[]'::jsonb) FROM (SELECT t.* FROM public.protocol_trades t JOIN public.protocol_markets m ON m.id=t.market_uuid WHERE m.market_id=_market_id AND m.published ORDER BY t.timestamp DESC LIMIT 50) t JOIN public.protocol_market_outcomes o ON o.market_uuid=t.market_uuid AND o.outcome_index=t.outcome_index; $$;
REVOKE ALL ON FUNCTION public.get_protocol_market_activity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_protocol_market_activity(text) TO anon,authenticated;
COMMIT;
