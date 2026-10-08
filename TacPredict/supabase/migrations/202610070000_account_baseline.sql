-- Fresh, user-owned Supabase account foundation. No USDC transfers or grants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text CHECK (char_length(display_name) <= 80),
 balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
 streak integer NOT NULL DEFAULT 0 CHECK (streak >= 0),
 last_check_in date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.points_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 amount integer NOT NULL, balance_after integer NOT NULL CHECK (balance_after >= 0),
 kind text NOT NULL, reference_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS points_transactions_user_created_idx ON public.points_transactions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.predictions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 market_id text NOT NULL, market_title text NOT NULL,
 outcome_id text NOT NULL, outcome_label text NOT NULL,
 amount integer NOT NULL CHECK (amount > 0),
 probability numeric NOT NULL CHECK (probability BETWEEN 0 AND 1),
 potential_return numeric NOT NULL CHECK (potential_return >= 0),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','cancelled')),
 payout numeric, resolved_at timestamptz,
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS predictions_user_created_idx ON public.predictions(user_id,created_at DESC);
DO $$ BEGIN
 CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.user_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role public.app_role NOT NULL DEFAULT 'user', UNIQUE(user_id,role)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles,public.points_transactions,public.predictions,public.user_roles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.profiles,public.points_transactions,public.predictions,public.user_roles TO authenticated;
DROP POLICY IF EXISTS "Account reads own profile" ON public.profiles;
CREATE POLICY "Account reads own profile" ON public.profiles FOR SELECT TO authenticated USING (id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Account reads own points" ON public.points_transactions;
CREATE POLICY "Account reads own points" ON public.points_transactions FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Account reads own predictions" ON public.predictions;
CREATE POLICY "Account reads own predictions" ON public.predictions FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Account reads own role" ON public.user_roles;
CREATE POLICY "Account reads own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE OR REPLACE FUNCTION public.handle_new_tac_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.profiles(id,display_name)
 VALUES(NEW.id,left(coalesce(NEW.raw_user_meta_data->>'full_name',NEW.raw_user_meta_data->>'name',''),80))
 ON CONFLICT (id) DO NOTHING;
 -- Role and balance NEVER come from user-editable metadata.
 INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,'user') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_tac_account() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tac_account_created ON auth.users;
CREATE TRIGGER tac_account_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_tac_account();
INSERT INTO public.profiles(id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id,role) SELECT id,'user'::public.app_role FROM auth.users ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role,_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT _user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role,uuid) TO authenticated;
COMMIT;
