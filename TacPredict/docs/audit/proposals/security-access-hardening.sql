-- REVIEW DRAFT ONLY. Outside supabase/migrations intentionally. NOT applied to production.
-- Requires exact-project/schema preflight, isolated tests, reviewed compatibility and explicit approval.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.get_my_protocol_portfolio()'::regprocedure) IS DISTINCT FROM '621bfe0d0ce12b28ae3409e0082e554a' THEN RAISE EXCEPTION 'Portfolio function drift: review current source before applying'; END IF;
END $preflight$;
-- Retire unverified connection telemetry. Never reinterpret these balances as collateral.
REVOKE ALL ON public.users,public.wallets,public.protocol_orderbook FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.protocol_market_metrics FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.protocol_market_metrics TO anon,authenticated;
ALTER VIEW public.protocol_orderbook SET(security_invoker=true);
-- REVOKE table privileges alone does not remove independently granted column privileges.
DO $revoke$ DECLARE r record; BEGIN
 FOR r IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
 AND table_name IN('users','wallets','protocol_orderbook','protocol_market_metrics') LOOP
 EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM PUBLIC,anon,authenticated',
 r.column_name,r.column_name,r.column_name,r.column_name,r.table_name);
 END LOOP;
END $revoke$;
DROP POLICY IF EXISTS users_select_anon ON public.users;
DROP POLICY IF EXISTS users_insert_anon ON public.users;
DROP POLICY IF EXISTS users_update_anon ON public.users;
DROP POLICY IF EXISTS wallets_select_anon ON public.wallets;
DROP POLICY IF EXISTS wallets_insert_anon ON public.wallets;
DROP POLICY IF EXISTS wallets_update_anon ON public.wallets;
-- Wallet linkage is insufficient without verified ownership; RESTRICTIVE guards compose with existing policies.
DROP POLICY IF EXISTS verified_wallet_read_guard ON public.protocol_wallets;
CREATE POLICY verified_wallet_read_guard ON public.protocol_wallets AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND verified_at IS NOT NULL);
DO $privacy$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['protocol_positions','protocol_claims','protocol_refunds'] LOOP
 EXECUTE format('DROP POLICY IF EXISTS verified_wallet_read_guard ON public.%I',t);
 EXECUTE format('CREATE POLICY verified_wallet_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.id=wallet_id AND w.user_id=(SELECT auth.uid()) AND w.verified_at IS NOT NULL))',t);
 END LOOP;
END $privacy$;
DROP POLICY IF EXISTS verified_order_owner_read_guard ON public.protocol_orders;
CREATE POLICY verified_order_owner_read_guard ON public.protocol_orders AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.address=maker AND w.user_id=(SELECT auth.uid()) AND w.verified_at IS NOT NULL));
-- Prevent newly created postgres-owned public objects inheriting anonymous write/EXECUTE grants.
-- Does not modify existing RPC grants; public RPCs must always be explicitly granted.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated;
-- PostgreSQL global PUBLIC EXECUTE cannot be undone by a per-schema revoke.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_my_protocol_portfolio() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH owned AS (
 SELECT p.*,w.address,m.api_market_id,m.onchain_id,m.chain_id,m.title,m.status AS market_status,m.outcome_count,o.label,o.token_id,o.last_price_atomic,o.payout_weight,
 coalesce(sum(p.shares_atomic*coalesce(o.payout_weight,0)) OVER(PARTITION BY p.market_uuid,p.wallet_id ORDER BY p.outcome_index ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),0) AS cumulative,
 coalesce(sum(p.shares_atomic*coalesce(o.payout_weight,0)) OVER(PARTITION BY p.market_uuid,p.wallet_id ORDER BY p.outcome_index ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous
 FROM public.protocol_positions p JOIN public.protocol_wallets w ON w.id=p.wallet_id AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL JOIN public.protocol_markets m ON m.id=p.market_uuid JOIN public.protocol_market_outcomes o ON o.market_uuid=p.market_uuid AND o.outcome_index=p.outcome_index
 ) SELECT jsonb_build_object('positions',coalesce(jsonb_agg(jsonb_build_object('id',id,'marketId',api_market_id,'marketUuid',market_uuid,'onchainId',onchain_id::text,'chainId',chain_id,'title',title,'status',market_status,'positionStatus',status,'outcome',label,'outcomeIndex',outcome_index,'tokenId',token_id::text,'wallet',address,'sharesAtomic',shares_atomic::text,'lastPriceAtomic',last_price_atomic::text,'valueAtomic',CASE WHEN last_price_atomic IS NULL THEN NULL ELSE trunc(shares_atomic*last_price_atomic/1000000)::text END,'claimableAtomic',CASE WHEN market_status IN('RESOLVED','VOID') AND payout_weight IS NOT NULL THEN (trunc(cumulative/CASE WHEN market_status='VOID' THEN outcome_count ELSE 1 END)-trunc(previous/CASE WHEN market_status='VOID' THEN outcome_count ELSE 1 END))::text ELSE '0' END,'updatedAt',updated_at)),'[]'::jsonb)) FROM owned;
$$;

COMMIT;
