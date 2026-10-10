-- Native-only welcome qualification. No synthetic or legacy reward events count.
BEGIN;
CREATE TABLE public.protocol_reward_credits (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 campaign text NOT NULL DEFAULT 'native-welcome-usdc-v1' CHECK(campaign='native-welcome-usdc-v1'),
 amount_usdc numeric(20,6) NOT NULL DEFAULT 15 CHECK(amount_usdc=15),
 withdrawal_enabled boolean NOT NULL DEFAULT false CHECK(withdrawal_enabled=false),
 qualified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.protocol_reward_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protocol_reward_credits FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.protocol_reward_credits TO authenticated;
GRANT ALL ON public.protocol_reward_credits TO service_role;
CREATE POLICY own_native_reward_credit ON public.protocol_reward_credits FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION public.get_my_native_reward_tasks() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); account_ok boolean; x_ok boolean; funding numeric:=0; buys integer:=0; eligible boolean; credit numeric:=0; credited_at timestamptz; launched boolean;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u AND (a.email_confirmed_at IS NOT NULL OR a.phone_confirmed_at IS NOT NULL OR EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=u AND i.provider IN('google','x','twitter','web3','ethereum','farcaster')))) INTO account_ok;
 SELECT EXISTS(SELECT 1 FROM auth.identities WHERE user_id=u AND provider IN('x','twitter')) INTO x_ok;
 -- One contribution >=5 USDC (not repeated sub-threshold recycling). Complete-set funding, finalized by the trusted indexer, owned wallet proof mandatory.
 SELECT coalesce(max((e.payload->>'collateral')::numeric),0)/1000000 INTO funding
 FROM public.protocol_chain_events e JOIN public.protocol_deployments d ON d.chain_id=e.chain_id AND d.verified
 JOIN public.protocol_wallets w ON w.address=lower(e.payload->>'account') AND w.user_id=u AND w.verified_at IS NOT NULL
 JOIN public.protocol_transactions t ON t.chain_id=e.chain_id AND t.tx_hash=e.tx_hash AND t.status='FINALIZED'
 WHERE e.chain_id=8453 AND e.event_name='PositionCreated' AND lower(e.contract_address)=lower(d.positions)
 AND lower(d.collateral_token)='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
 -- One order counts once regardless of partial fills. Self trades / owned aliases excluded.
 SELECT count(DISTINCT tr.buy_order_id) INTO buys FROM public.protocol_trades tr
 JOIN public.protocol_deployments d ON d.chain_id=tr.chain_id AND d.verified
 JOIN public.protocol_transactions t ON t.chain_id=tr.chain_id AND t.tx_hash=tr.tx_hash AND t.status='FINALIZED'
 JOIN public.protocol_wallets w ON w.address=tr.buyer AND w.user_id=u AND w.verified_at IS NOT NULL
 WHERE tr.chain_id=8453 AND tr.usdc_atomic>0 AND tr.buy_order_id IS NOT NULL AND tr.buyer<>tr.seller
 AND NOT EXISTS(SELECT 1 FROM public.protocol_wallets seller WHERE seller.address=tr.seller AND seller.user_id=u)
 AND lower(d.collateral_token)='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
 eligible:=account_ok AND x_ok AND funding>=5 AND buys>=4;
 IF eligible THEN INSERT INTO public.protocol_reward_credits(user_id) VALUES(u) ON CONFLICT(user_id) DO NOTHING; END IF;
 SELECT amount_usdc,qualified_at INTO credit,credited_at FROM public.protocol_reward_credits WHERE user_id=u;
 SELECT EXISTS(SELECT 1 FROM public.protocol_deployments WHERE chain_id=8453 AND verified AND trading_enabled) INTO launched;
 RETURN jsonb_build_object('ok',true,'account_created',account_ok,'x_connected',x_ok,'deposit_usdc',funding,'predictions',buys,'eligible',eligible,'locked_credit',coalesce(credit,0),'qualified_at',credited_at,'withdrawal_enabled',false,'offer',15,'asset','USDC','launch_ready',launched,'server_time',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.get_my_native_reward_tasks() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_native_reward_tasks() TO authenticated;
CREATE FUNCTION public.get_my_protocol_activity() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'title',a.title,'marketId',a.market_id,'amountAtomic',a.amount::text,'txHash',a.tx_hash,'chainId',a.chain_id,'timestamp',a.ts) ORDER BY a.ts DESC),'[]'::jsonb) FROM (
 SELECT tr.id::text,CASE WHEN w.address=tr.buyer THEN 'Bought shares' ELSE 'Sold shares' END AS kind,m.title,m.api_market_id AS market_id,tr.usdc_atomic AS amount,tr.tx_hash,tr.chain_id,tr.timestamp AS ts
 FROM public.protocol_trades tr JOIN public.protocol_markets m ON m.id=tr.market_uuid JOIN public.protocol_wallets w ON w.address IN(tr.buyer,tr.seller) AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL WHERE tr.chain_id=8453
 UNION ALL
 SELECT c.id::text,'Claimed USDC',m.title,m.api_market_id,c.amount_atomic,c.tx_hash,c.chain_id,c.created_at FROM public.protocol_claims c JOIN public.protocol_markets m ON m.id=c.market_uuid JOIN public.protocol_wallets w ON w.id=c.wallet_id AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL WHERE c.chain_id=8453
 UNION ALL
 SELECT r.id::text,'Redeemed void shares',m.title,m.api_market_id,r.amount_atomic,r.tx_hash,r.chain_id,r.created_at FROM public.protocol_refunds r JOIN public.protocol_markets m ON m.id=r.market_uuid JOIN public.protocol_wallets w ON w.id=r.wallet_id AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL WHERE r.chain_id=8453
 ORDER BY ts DESC LIMIT 50
 ) a WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_my_protocol_activity() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_protocol_activity() TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.protocol_reward_credits;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
