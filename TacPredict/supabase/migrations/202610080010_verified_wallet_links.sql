BEGIN;
CREATE TABLE public.protocol_wallet_link_challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),address text NOT NULL CHECK(address ~ '^0x[0-9a-f]{40}$'),message text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.protocol_wallet_link_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protocol_wallet_link_challenges FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.protocol_wallet_link_challenges TO service_role;
CREATE FUNCTION public.consume_protocol_wallet_link(_challenge uuid,_user uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.protocol_wallet_link_challenges; BEGIN
 UPDATE public.protocol_wallet_link_challenges SET used_at=now() WHERE id=_challenge AND user_id=_user AND used_at IS NULL AND expires_at>now() RETURNING * INTO c;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Expired or used challenge'; END IF;
 INSERT INTO public.protocol_wallets(address,user_id,verified_at) VALUES(c.address,_user,now()) ON CONFLICT(address) DO UPDATE SET user_id=excluded.user_id,verified_at=now() WHERE protocol_wallets.user_id IS NULL OR protocol_wallets.user_id=_user;
 IF NOT EXISTS(SELECT 1 FROM public.protocol_wallets WHERE address=c.address AND user_id=_user) THEN RAISE EXCEPTION 'Wallet already linked to another account'; END IF;
 UPDATE public.protocol_orders SET user_id=_user WHERE maker=c.address AND user_id IS NULL;
 RETURN c.address;
END $$;
REVOKE ALL ON FUNCTION public.consume_protocol_wallet_link(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_protocol_wallet_link(uuid,uuid) TO service_role;
-- Return an already-proven account wallet first; editable user metadata is never trusted.
CREATE OR REPLACE FUNCTION public.register_my_protocol_wallet() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT address INTO a FROM public.protocol_wallets WHERE user_id=auth.uid() AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1;
 IF a IS NOT NULL THEN RETURN a; END IF;
 SELECT lower(coalesce(identity_data->>'address',identity_data->>'sub')) INTO a FROM auth.identities WHERE user_id=auth.uid() AND provider IN('web3','ethereum') AND coalesce(identity_data->>'address',identity_data->>'sub') ~ '^0x[0-9a-fA-F]{40}$' LIMIT 1;
 IF a IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.protocol_wallets(address,user_id,verified_at) VALUES(a,auth.uid(),now()) ON CONFLICT(address) DO UPDATE SET user_id=excluded.user_id,verified_at=now() WHERE protocol_wallets.user_id IS NULL OR protocol_wallets.user_id=auth.uid();
 IF NOT EXISTS(SELECT 1 FROM public.protocol_wallets WHERE address=a AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Wallet already linked'; END IF;
 RETURN a;
END $$;
COMMIT;
