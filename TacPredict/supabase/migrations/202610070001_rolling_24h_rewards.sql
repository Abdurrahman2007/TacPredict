-- Apply to the existing Supabase project as an administrator.
-- Virtual TAC Points only. This migration does not create or transfer USDC.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_reward_at timestamptz;
-- Exact historical timestamps are preferred over the old calendar-date field.
UPDATE public.profiles p SET last_reward_at = t.claimed_at
FROM (SELECT user_id, max(created_at) AS claimed_at FROM public.points_transactions
      WHERE kind = 'daily_check_in' GROUP BY user_id) t
WHERE p.id = t.user_id AND p.last_reward_at IS NULL;
-- Rare date-only legacy accounts use the end of that UTC day conservatively.
-- This can extend their first migration cooldown by up to one day.
UPDATE public.profiles SET last_reward_at = ((last_check_in + 1)::timestamp AT TIME ZONE 'UTC')
WHERE last_reward_at IS NULL AND last_check_in IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_reward_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _uid uuid := auth.uid(); _p public.profiles; _now timestamptz := clock_timestamp(); _next_streak integer;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Sign in first.'); END IF;
  SELECT * INTO _p FROM public.profiles WHERE id = _uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Account not found.'); END IF;
  _next_streak := CASE WHEN _p.last_reward_at IS NOT NULL AND _now <= _p.last_reward_at + interval '48 hours' THEN _p.streak + 1 ELSE 1 END;
  RETURN jsonb_build_object('ok', true, 'version', 'rolling24h-v1', 'cooldown_hours', 24,
    'server_time', _now, 'last_reward_at', _p.last_reward_at,
    'available_at', CASE WHEN _p.last_reward_at IS NULL THEN NULL ELSE _p.last_reward_at + interval '24 hours' END,
    'next_reward', 100 + LEAST(_next_streak - 1, 6) * 10);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_reward_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reward_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _uid uuid := auth.uid(); _p public.profiles; _now timestamptz; _streak integer; _reward integer; _balance integer;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Sign in first.'); END IF;
  -- Serializes simultaneous claims for the same account.
  SELECT * INTO _p FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Account not found.'); END IF;
  _now := clock_timestamp();
  IF _p.last_reward_at IS NOT NULL AND _now < _p.last_reward_at + interval '24 hours' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Your next reward unlocks 24 hours after your last claim.',
      'available_at', _p.last_reward_at + interval '24 hours', 'server_time', _now);
  END IF;
  _streak := CASE WHEN _p.last_reward_at IS NOT NULL AND _now <= _p.last_reward_at + interval '48 hours' THEN _p.streak + 1 ELSE 1 END;
  _reward := 100 + LEAST(_streak - 1, 6) * 10;
  UPDATE public.profiles SET balance = balance + _reward, last_reward_at = _now,
    last_check_in = (_now AT TIME ZONE 'UTC')::date, streak = _streak, updated_at = _now
    WHERE id = _uid RETURNING balance INTO _balance;
  INSERT INTO public.points_transactions(user_id, amount, kind, balance_after)
    VALUES (_uid, _reward, 'daily_check_in', _balance);
  RETURN jsonb_build_object('ok', true, 'reward', _reward, 'balance', _balance, 'streak', _streak,
    'available_at', _now + interval '24 hours', 'server_time', _now);
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_daily_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;
COMMIT;
