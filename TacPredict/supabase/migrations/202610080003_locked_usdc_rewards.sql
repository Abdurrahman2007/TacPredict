-- Promotional reward credits, NOT wallet funds. No withdrawal/trading RPC.
-- Only a trusted server/indexer may write independently verified USDC events.
-- No indexer or deposit/trading contract is configured by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.verified_usdc_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 event_kind text NOT NULL CHECK (event_kind IN ('deposit','prediction')),
 amount_usdc numeric(20,6) NOT NULL CHECK (amount_usdc > 0),
 chain_id integer NOT NULL CHECK (chain_id=8453),
 token_address text NOT NULL CHECK (lower(token_address)='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
 contract_address text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
 tx_hash text NOT NULL CHECK (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
 log_index integer NOT NULL CHECK (log_index>=0),
 block_number bigint NOT NULL CHECK (block_number>0),
 verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(chain_id,tx_hash,log_index)
);
CREATE INDEX IF NOT EXISTS verified_usdc_user_idx ON public.verified_usdc_events(user_id,event_kind);
CREATE TABLE IF NOT EXISTS public.locked_reward_credits (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 campaign text NOT NULL DEFAULT 'welcome-usdc-v1' CHECK (campaign='welcome-usdc-v1'),
 asset text NOT NULL DEFAULT 'USDC' CHECK (asset='USDC'),
 amount numeric(20,6) NOT NULL DEFAULT 15 CHECK (amount=15),
 withdrawal_enabled boolean NOT NULL DEFAULT false CHECK (withdrawal_enabled=false),
 qualified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.verified_usdc_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locked_reward_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_usdc_events,public.locked_reward_credits FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.verified_usdc_events,public.locked_reward_credits TO authenticated;
CREATE POLICY "Own verified USDC events" ON public.verified_usdc_events FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY "Own locked credits" ON public.locked_reward_credits FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE OR REPLACE FUNCTION public.get_user_reward_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _uid uuid:=auth.uid(); _account boolean; _x boolean; _deposits numeric; _predictions integer; _qualified boolean; _credited numeric:=0;
BEGIN
 IF _uid IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Sign in first.'); END IF;
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid) INTO _account;
 -- Verified OAuth identity, never a client-supplied username or user_metadata flag.
 SELECT EXISTS(SELECT 1 FROM auth.identities WHERE user_id=_uid AND provider IN ('x','twitter')) INTO _x;
 SELECT coalesce(sum(amount_usdc) FILTER (WHERE event_kind='deposit'),0),count(*) FILTER (WHERE event_kind='prediction')
 INTO _deposits,_predictions FROM public.verified_usdc_events WHERE user_id=_uid;
 _qualified:=_account AND _x AND _deposits>=5 AND _predictions>=4;
 IF _qualified THEN
   INSERT INTO public.locked_reward_credits(user_id) VALUES(_uid) ON CONFLICT(user_id) DO NOTHING;
 END IF;
 SELECT coalesce(amount,0) INTO _credited FROM public.locked_reward_credits WHERE user_id=_uid;
 RETURN jsonb_build_object('ok',true,'version','welcome-usdc-v1','asset','USDC','offer',15,
 'account_created',_account,'x_connected',_x,'deposit_usdc',_deposits,'predictions',_predictions,
 'eligible',_qualified,'locked_credit',coalesce(_credited,0),'withdrawal_enabled',false,'server_time',clock_timestamp());
END $$;
REVOKE EXECUTE ON FUNCTION public.get_user_reward_tasks() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_reward_tasks() TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.verified_usdc_events,public.locked_reward_credits;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
