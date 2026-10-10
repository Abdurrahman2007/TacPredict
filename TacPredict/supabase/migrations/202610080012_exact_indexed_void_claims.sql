BEGIN;
CREATE OR REPLACE FUNCTION public.get_my_protocol_portfolio() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH owned AS (
 SELECT p.*,w.address,m.api_market_id,m.onchain_id,m.chain_id,m.title,m.status AS market_status,m.outcome_count,o.label,o.token_id,o.last_price_atomic,o.payout_weight,
 coalesce(sum(p.shares_atomic*coalesce(o.payout_weight,0)) OVER(PARTITION BY p.market_uuid,p.wallet_id ORDER BY p.outcome_index ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),0) AS cumulative,
 coalesce(sum(p.shares_atomic*coalesce(o.payout_weight,0)) OVER(PARTITION BY p.market_uuid,p.wallet_id ORDER BY p.outcome_index ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous
 FROM public.protocol_positions p JOIN public.protocol_wallets w ON w.id=p.wallet_id AND w.user_id=auth.uid() JOIN public.protocol_markets m ON m.id=p.market_uuid JOIN public.protocol_market_outcomes o ON o.market_uuid=p.market_uuid AND o.outcome_index=p.outcome_index
 ) SELECT jsonb_build_object('positions',coalesce(jsonb_agg(jsonb_build_object('id',id,'marketId',api_market_id,'marketUuid',market_uuid,'onchainId',onchain_id::text,'chainId',chain_id,'title',title,'status',market_status,'positionStatus',status,'outcome',label,'outcomeIndex',outcome_index,'tokenId',token_id::text,'wallet',address,'sharesAtomic',shares_atomic::text,'lastPriceAtomic',last_price_atomic::text,'valueAtomic',CASE WHEN last_price_atomic IS NULL THEN NULL ELSE trunc(shares_atomic*last_price_atomic/1000000)::text END,'claimableAtomic',CASE WHEN market_status IN('RESOLVED','VOID') AND payout_weight IS NOT NULL THEN (trunc(cumulative/CASE WHEN market_status='VOID' THEN outcome_count ELSE 1 END)-trunc(previous/CASE WHEN market_status='VOID' THEN outcome_count ELSE 1 END))::text ELSE '0' END,'updatedAt',updated_at)),'[]'::jsonb)) FROM owned;
$$;
COMMIT;
