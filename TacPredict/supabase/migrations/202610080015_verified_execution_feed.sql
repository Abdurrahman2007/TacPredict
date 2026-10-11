BEGIN;
CREATE OR REPLACE FUNCTION public.get_protocol_market_feed(_limit integer DEFAULT 150) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('markets',coalesce(jsonb_agg(row),'[]'::jsonb),'deployments',coalesce((SELECT jsonb_agg(jsonb_build_object('chainId',chain_id,'collateral',collateral_token,'registry',registry,'factory',factory,'positions',positions,'exchange',exchange,'oracle',oracle,'settlement',settlement,'tradingEnabled',trading_enabled,'codeHashes',code_hashes)) FROM public.protocol_deployments WHERE verified AND chain_id=8453),'[]'::jsonb)) FROM (
 SELECT jsonb_build_object('id',m.id,'marketId',m.api_market_id,'onchainId',m.onchain_id::text,'chainId',m.chain_id,'questionId',m.question_id,'conditionId',m.condition_id,'metadataHash',m.metadata_hash,'title',m.title,'description',m.description,'category',m.category,'subcategory',m.subcategory,'image',m.image_url,'tags',m.tags,'source',m.resolution_source,'sourceUrl',m.source_url,'rules',m.rules,'oracle',m.oracle,'status',m.status,'createdAt',m.created_at,'openAt',m.open_at,'closeAt',m.close_at,'resolveAfter',m.resolve_after,'resolutionDeadline',m.resolution_deadline,'openInterestAtomic',m.open_interest_atomic::text,'liquidityAtomic',m.liquidity_atomic::text,
 'outcomes',(SELECT jsonb_agg(jsonb_build_object('index',o.outcome_index,'label',o.label,'tokenId',o.token_id::text,'priceAtomic',o.last_price_atomic::text,'payoutWeight',o.payout_weight::text) ORDER BY o.outcome_index) FROM public.protocol_market_outcomes o WHERE o.market_uuid=m.id),
 'volumeAtomic',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE market_uuid=m.id),
 'volume24hAtomic',(SELECT coalesce(sum(usdc_atomic),0)::text FROM public.protocol_trades WHERE market_uuid=m.id AND timestamp>now()-interval '24 hours'),
 'traders',(SELECT count(DISTINCT address) FROM (SELECT buyer AS address FROM public.protocol_trades WHERE market_uuid=m.id UNION SELECT seller FROM public.protocol_trades WHERE market_uuid=m.id) a)) AS row
 FROM public.protocol_markets m JOIN public.protocol_deployments d ON d.chain_id=m.chain_id AND d.verified WHERE m.published AND m.chain_id=8453 ORDER BY m.created_at DESC LIMIT greatest(1,least(coalesce(_limit,150),250))
 ) rows;
$$;
COMMIT;
