BEGIN;
CREATE FUNCTION public.get_protocol_market_feed(_limit integer DEFAULT 150) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('markets',coalesce(jsonb_agg(row),'[]'::jsonb),'deployments',coalesce((SELECT jsonb_agg(jsonb_build_object('chainId',chain_id,'collateral',collateral_token,'registry',registry,'factory',factory,'positions',positions,'exchange',exchange,'oracle',oracle,'settlement',settlement,'tradingEnabled',trading_enabled)) FROM public.protocol_deployments WHERE verified),'[]'::jsonb)) FROM (
 SELECT jsonb_build_object('id',m.id,'marketId',m.market_id,'onchainId',m.onchain_id::text,'chainId',m.chain_id,'questionId',m.question_id,'conditionId',m.condition_id,'metadataHash',m.metadata_hash,'title',m.title,'description',m.description,'category',m.category,'subcategory',m.subcategory,'image',m.image_url,'tags',m.tags,'source',m.resolution_source,'sourceUrl',m.source_url,'rules',m.rules,'oracle',m.oracle,'status',m.status,'createdAt',m.created_at,'openAt',m.open_at,'closeAt',m.close_at,'resolveAfter',m.resolve_after,'resolutionDeadline',m.resolution_deadline,'openInterestAtomic',m.open_interest_atomic::text,'liquidityAtomic',m.liquidity_atomic::text,
 'outcomes',(SELECT jsonb_agg(jsonb_build_object('index',o.outcome_index,'label',o.label,'tokenId',o.token_id::text,'priceAtomic',o.last_price_atomic::text,'payoutWeight',o.payout_weight::text) ORDER BY o.outcome_index) FROM public.protocol_market_outcomes o WHERE o.market_uuid=m.id),
 'volumeAtomic',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE market_uuid=m.id),
 'volume24hAtomic',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE market_uuid=m.id AND timestamp>now()-interval '24 hours'),
 'traders',(SELECT count(DISTINCT address) FROM (SELECT buyer AS address FROM public.protocol_trades WHERE market_uuid=m.id UNION SELECT seller FROM public.protocol_trades WHERE market_uuid=m.id) a)) AS row
 FROM public.protocol_markets m JOIN public.protocol_deployments d ON d.chain_id=m.chain_id AND d.verified WHERE m.published ORDER BY m.created_at DESC LIMIT greatest(1,least(coalesce(_limit,150),250))
 ) rows;
$$;
REVOKE ALL ON FUNCTION public.get_protocol_market_feed(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_protocol_market_feed(integer) TO anon,authenticated;
CREATE FUNCTION public.get_protocol_probability_history(_market_id text,_since timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('label',o.label,'points',coalesce((SELECT jsonb_agg(jsonb_build_object('time',extract(epoch FROM p.observed_at)*1000,'probability',p.price_atomic/10000) ORDER BY p.observed_at) FROM (SELECT * FROM public.protocol_market_prices WHERE market_uuid=o.market_uuid AND outcome_index=o.outcome_index AND observed_at>=greatest(_since,now()-interval '31 days') ORDER BY observed_at DESC LIMIT 1500) p),'[]'::jsonb)) ORDER BY o.outcome_index),'[]'::jsonb)
 FROM public.protocol_market_outcomes o JOIN public.protocol_markets m ON m.id=o.market_uuid WHERE m.published AND m.market_id=_market_id;
$$;
REVOKE ALL ON FUNCTION public.get_protocol_probability_history(text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_protocol_probability_history(text,timestamptz) TO anon,authenticated;
CREATE FUNCTION public.get_my_protocol_portfolio() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('positions',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'marketId',m.market_id,'marketUuid',m.id,'onchainId',m.onchain_id::text,'chainId',m.chain_id,'title',m.title,'status',m.status,'positionStatus',p.status,'outcome',o.label,'outcomeIndex',p.outcome_index,'tokenId',o.token_id::text,'wallet',w.address,'sharesAtomic',p.shares_atomic::text,'lastPriceAtomic',o.last_price_atomic::text,'valueAtomic',CASE WHEN o.last_price_atomic IS NULL THEN NULL ELSE trunc(p.shares_atomic*o.last_price_atomic/1000000)::text END,'claimableAtomic',CASE WHEN m.status IN('RESOLVED','VOID') AND o.payout_weight IS NOT NULL THEN trunc(p.shares_atomic*o.payout_weight/CASE WHEN m.status='VOID' THEN m.outcome_count ELSE 1 END)::text ELSE '0' END,'updatedAt',p.updated_at)),'[]'::jsonb))
 FROM public.protocol_positions p JOIN public.protocol_wallets w ON w.id=p.wallet_id AND w.user_id=auth.uid() JOIN public.protocol_markets m ON m.id=p.market_uuid JOIN public.protocol_market_outcomes o ON o.market_uuid=p.market_uuid AND o.outcome_index=p.outcome_index;
$$;
REVOKE ALL ON FUNCTION public.get_my_protocol_portfolio() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_protocol_portfolio() TO authenticated;
COMMIT;
