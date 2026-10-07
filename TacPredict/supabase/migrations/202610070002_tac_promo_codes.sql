-- Admin-managed, hashed codes. Virtual TAC only; no USDC payouts.
BEGIN;
CREATE TABLE IF NOT EXISTS public.tac_promo_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_hash text NOT NULL UNIQUE CHECK (length(code_hash)=64),
 amount integer NOT NULL CHECK (amount > 0 AND amount <= 1000000),
 starts_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 max_redemptions integer NOT NULL CHECK (max_redemptions > 0),
 redeemed_count integer NOT NULL DEFAULT 0,
 enabled boolean NOT NULL DEFAULT true,
 CHECK (expires_at > starts_at),
 CHECK (redeemed_count >= 0 AND redeemed_count <= max_redemptions)
);
CREATE TABLE IF NOT EXISTS public.tac_promo_redemptions (
 campaign_id uuid NOT NULL REFERENCES public.tac_promo_codes(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 amount integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.tac_promo_attempts (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 window_started_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE public.tac_promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tac_promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tac_promo_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tac_promo_codes, public.tac_promo_redemptions, public.tac_promo_attempts FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_tac_promo_status()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('version','tac-promo-v1','asset','TAC');
$$;
REVOKE EXECUTE ON FUNCTION public.get_tac_promo_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tac_promo_status() TO authenticated;
CREATE OR REPLACE FUNCTION public.redeem_tac_promo(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE _uid uuid := auth.uid(); _now timestamptz := clock_timestamp(); _attempts public.tac_promo_attempts; _campaign public.tac_promo_codes; _balance integer;
BEGIN
 IF _uid IS NULL THEN RETURN jsonb_build_object('ok',false,'message','Sign in first.'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid) THEN RETURN jsonb_build_object('ok',false,'message','Account unavailable.'); END IF;
 INSERT INTO public.tac_promo_attempts(user_id) VALUES(_uid) ON CONFLICT DO NOTHING;
 SELECT * INTO _attempts FROM public.tac_promo_attempts WHERE user_id=_uid FOR UPDATE;
 IF _now >= _attempts.window_started_at + interval '1 hour' THEN
   UPDATE public.tac_promo_attempts SET attempts=1,window_started_at=_now WHERE user_id=_uid;
 ELSIF _attempts.attempts >= 10 THEN
   RETURN jsonb_build_object('ok',false,'message','Too many attempts. Try again later.');
 ELSE UPDATE public.tac_promo_attempts SET attempts=attempts+1 WHERE user_id=_uid;
 END IF;
 IF _code IS NULL OR length(trim(_code)) NOT BETWEEN 6 AND 64 OR trim(_code) !~ '^[A-Za-z0-9_-]+$' THEN
   RETURN jsonb_build_object('ok',false,'message','Invalid or unavailable code.');
 END IF;
 SELECT * INTO _campaign FROM public.tac_promo_codes WHERE code_hash=encode(sha256(convert_to(upper(trim(_code)),'UTF8')),'hex') FOR UPDATE;
 IF NOT FOUND OR NOT _campaign.enabled OR _now < _campaign.starts_at OR _now >= _campaign.expires_at OR _campaign.redeemed_count >= _campaign.max_redemptions THEN
   RETURN jsonb_build_object('ok',false,'message','Invalid or unavailable code.');
 END IF;
 IF EXISTS(SELECT 1 FROM public.tac_promo_redemptions WHERE campaign_id=_campaign.id AND user_id=_uid) THEN
   RETURN jsonb_build_object('ok',false,'message','Code already redeemed.');
 END IF;
 UPDATE public.profiles SET balance=balance+_campaign.amount,updated_at=_now WHERE id=_uid RETURNING balance INTO _balance;
 INSERT INTO public.tac_promo_redemptions(campaign_id,user_id,amount,created_at) VALUES(_campaign.id,_uid,_campaign.amount,_now);
 UPDATE public.tac_promo_codes SET redeemed_count=redeemed_count+1 WHERE id=_campaign.id;
 INSERT INTO public.points_transactions(user_id,amount,kind,balance_after) VALUES(_uid,_campaign.amount,'promo_code',_balance);
 RETURN jsonb_build_object('ok',true,'amount',_campaign.amount,'message',_campaign.amount::text || ' TAC added.');
END $$;
REVOKE EXECUTE ON FUNCTION public.redeem_tac_promo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.redeem_tac_promo(text) TO authenticated;
COMMIT;
-- Admin/SQL console only, never run this with a client-visible service key:
-- INSERT INTO public.tac_promo_codes(code_hash,amount,expires_at,max_redemptions)
-- VALUES(encode(sha256(convert_to(upper('YOUR-CUSTOM-CODE'),'UTF8')),'hex'),100,now()+interval '7 days',1000);
