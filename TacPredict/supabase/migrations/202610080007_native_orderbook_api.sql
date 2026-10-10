BEGIN;
-- Orders/signatures are intentionally public so takers can independently verify and settle.
-- Never publish account UUIDs, session tokens or wallet secrets.
CREATE FUNCTION public.get_protocol_signed_orderbook(_market_id text,_outcome integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.order_id,'order',o.signed_order,'signature',o.signature,'remainingAtomic',(o.shares_atomic-o.filled_atomic)::text) ORDER BY o.created_at),'[]'::jsonb) FROM (SELECT o.* FROM public.protocol_orders o JOIN public.protocol_markets m ON m.id=o.market_uuid JOIN public.protocol_deployments d ON d.chain_id=m.chain_id AND d.verified AND d.trading_enabled WHERE m.published AND m.market_id=_market_id AND m.status IN('OPEN','UPCOMING') AND m.open_at<=now() AND m.close_at>now() AND o.outcome_index=_outcome AND o.taker='0x0000000000000000000000000000000000000000' AND o.status IN('OPEN','PARTIAL') AND o.expiration>now() ORDER BY o.created_at LIMIT 100) o;
$$;
REVOKE ALL ON FUNCTION public.get_protocol_signed_orderbook(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_protocol_signed_orderbook(text,integer) TO anon,authenticated;
COMMIT;
