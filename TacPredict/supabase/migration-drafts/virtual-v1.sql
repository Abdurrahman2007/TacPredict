-- REVIEW DRAFT ONLY. Not in migrations/; do not run on production.
-- Requires existing protocol_wallets + verified wallet auth. No existing table or RLS policy is altered.
BEGIN;
CREATE TABLE public.virtual_deployments (
 id text PRIMARY KEY, chain_id integer NOT NULL CHECK(chain_id IN (8453,84532,31337)),
 engine text NOT NULL CHECK(engine ~ '^0x[0-9a-f]{40}$'), code_hash text NOT NULL,
 start_block numeric(78,0) NOT NULL CHECK(start_block>=0), checkpoint numeric(78,0) NOT NULL,
 checkpoint_hash text, finalized_block numeric(78,0) NOT NULL DEFAULT -1, finalized_hash text,
 lease_fence uuid, lease_until timestamptz,
 CHECK(checkpoint >= start_block-1 AND finalized_block <= checkpoint), UNIQUE(chain_id,engine)
);
CREATE TABLE public.virtual_blocks (
 deployment_id text NOT NULL REFERENCES public.virtual_deployments(id), number numeric(78,0) NOT NULL,
 hash text NOT NULL, parent_hash text NOT NULL, timestamp numeric(78,0) NOT NULL,
 canonical boolean NOT NULL DEFAULT true, PRIMARY KEY(deployment_id,hash)
);
CREATE UNIQUE INDEX virtual_canonical_block ON public.virtual_blocks(deployment_id,number) WHERE canonical;
CREATE TABLE public.virtual_chain_events (
 deployment_id text NOT NULL REFERENCES public.virtual_deployments(id), block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL, tx_hash text NOT NULL, log_index integer NOT NULL CHECK(log_index>=0),
 wallet text CHECK(wallet ~ '^0x[0-9a-f]{40}$'), market_id text,
 event jsonb NOT NULL, canonical boolean NOT NULL DEFAULT true,
 PRIMARY KEY(deployment_id,block_hash,tx_hash,log_index)
);
CREATE UNIQUE INDEX virtual_canonical_event ON public.virtual_chain_events(deployment_id,tx_hash,log_index) WHERE canonical;
CREATE INDEX virtual_wallet_events ON public.virtual_chain_events(deployment_id,wallet,block_number,log_index) WHERE canonical;
CREATE INDEX virtual_market_events ON public.virtual_chain_events(deployment_id,market_id,block_number,log_index) WHERE canonical;
CREATE TABLE public.virtual_transactions (
 deployment_id text NOT NULL REFERENCES public.virtual_deployments(id), tx_hash text NOT NULL,
 wallet text NOT NULL CHECK(wallet ~ '^0x[0-9a-f]{40}$'), status text NOT NULL CHECK(status IN('pending','confirmed','finalized','reverted','reorged','invalid')),
 intent jsonb NOT NULL, block_number numeric(78,0), block_hash text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(deployment_id,tx_hash,wallet)
);
CREATE TABLE public.virtual_points_versions (
 month date NOT NULL CHECK(extract(day FROM month)=1), version text NOT NULL, formula jsonb NOT NULL,
 config_hash text NOT NULL, approved boolean NOT NULL DEFAULT false, PRIMARY KEY(month,version)
);
CREATE TABLE public.virtual_points_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), month date NOT NULL, version text NOT NULL,
 deployment_id text NOT NULL REFERENCES public.virtual_deployments(id), cutoff_block numeric(78,0) NOT NULL,
 cutoff_hash text NOT NULL, input_digest text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved')),
 FOREIGN KEY(month,version) REFERENCES public.virtual_points_versions(month,version), UNIQUE(deployment_id,month,version)
);
CREATE TABLE public.virtual_points_candidates (
 snapshot_id uuid NOT NULL REFERENCES public.virtual_points_snapshots(id), wallet text NOT NULL,
 inputs jsonb NOT NULL, score numeric(78,0), flags jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(snapshot_id,wallet)
);
CREATE TABLE public.virtual_admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor uuid, action text NOT NULL,
 details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.virtual_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_points_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_points_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_points_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY virtual_own_events ON public.virtual_chain_events FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.address=wallet AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL)
);
CREATE POLICY virtual_own_transactions ON public.virtual_transactions FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.address=wallet AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL)
);
CREATE POLICY virtual_own_points ON public.virtual_points_candidates FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.address=wallet AND w.user_id=auth.uid() AND w.verified_at IS NOT NULL)
);
GRANT SELECT ON public.virtual_chain_events, public.virtual_transactions, public.virtual_points_candidates TO authenticated;
REVOKE ALL ON public.virtual_deployments,public.virtual_blocks,public.virtual_chain_events,public.virtual_transactions,
 public.virtual_points_versions,public.virtual_points_snapshots,public.virtual_points_candidates,public.virtual_admin_audit FROM anon;
GRANT ALL ON public.virtual_deployments,public.virtual_blocks,public.virtual_chain_events,public.virtual_transactions,
 public.virtual_points_versions,public.virtual_points_snapshots,public.virtual_points_candidates TO service_role;
GRANT SELECT,INSERT ON public.virtual_admin_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.virtual_admin_audit_id_seq TO service_role;

CREATE FUNCTION public.virtual_acquire_lease(_deployment text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f uuid;
BEGIN
 UPDATE public.virtual_deployments SET lease_fence=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds'
 WHERE id=_deployment AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING lease_fence INTO f;
 IF f IS NULL THEN RAISE EXCEPTION 'Lease busy or deployment missing'; END IF;
 RETURN f;
END $$;
CREATE FUNCTION public.virtual_release_lease(_deployment text,_fence uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.virtual_deployments SET lease_fence=NULL,lease_until=NULL WHERE id=_deployment AND lease_fence=_fence;
$$;
CREATE FUNCTION public.virtual_commit_block(_deployment text,_fence uuid,_number numeric,_hash text,_parent text,_timestamp numeric,_events jsonb,_expected numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.virtual_deployments%ROWTYPE; e jsonb; tr jsonb;
BEGIN
 SELECT * INTO STRICT d FROM public.virtual_deployments WHERE id=_deployment FOR UPDATE;
 IF d.lease_fence IS NULL OR _fence IS NULL OR d.lease_until IS NULL OR d.lease_fence IS DISTINCT FROM _fence OR d.lease_until<=clock_timestamp() OR d.checkpoint<>_expected OR _number<>_expected+1
 OR (d.checkpoint_hash IS NOT NULL AND d.checkpoint_hash<>_parent) THEN RAISE EXCEPTION 'Stale fence/checkpoint/parent'; END IF;
 IF jsonb_typeof(_events)<>'array' THEN RAISE EXCEPTION 'Event array required'; END IF;
 INSERT INTO public.virtual_blocks VALUES(_deployment,_number,_hash,_parent,_timestamp,true)
 ON CONFLICT(deployment_id,hash) DO UPDATE SET canonical=true;
 FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
  IF (e->>'blockNumber')::numeric<>_number OR e->>'blockHash'<>_hash THEN RAISE EXCEPTION 'Event block mismatch'; END IF;
  INSERT INTO public.virtual_chain_events(deployment_id,block_number,block_hash,tx_hash,log_index,wallet,market_id,event,canonical)
  VALUES(_deployment,_number,_hash,e->>'txHash',(e->>'logIndex')::integer,e->>'wallet',e->>'marketId',e,true)
  ON CONFLICT(deployment_id,block_hash,tx_hash,log_index) DO UPDATE SET canonical=true;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.virtual_chain_events WHERE deployment_id=_deployment AND block_hash=_hash AND canonical
 AND event->>'name'='TradeExecuted' GROUP BY tx_hash HAVING count(*)>1) THEN RAISE EXCEPTION 'Multiple trades in transaction'; END IF;
 FOR tr IN SELECT event FROM public.virtual_chain_events WHERE deployment_id=_deployment AND block_hash=_hash AND canonical AND event->>'name'='TradeExecuted' LOOP
  UPDATE public.virtual_transactions SET status='confirmed',block_number=_number,block_hash=_hash,updated_at=now()
  WHERE deployment_id=_deployment AND tx_hash=tr->>'txHash' AND wallet=tr->>'wallet';
 END LOOP;
 UPDATE public.virtual_deployments SET checkpoint=_number,checkpoint_hash=_hash,lease_until=clock_timestamp()+interval '120 seconds' WHERE id=_deployment;
END $$;
CREATE FUNCTION public.virtual_rewind(_deployment text,_fence uuid,_number numeric,_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.virtual_deployments%ROWTYPE;
BEGIN
 SELECT * INTO STRICT d FROM public.virtual_deployments WHERE id=_deployment FOR UPDATE;
 IF d.lease_fence IS NULL OR _fence IS NULL OR d.lease_until IS NULL OR d.lease_fence IS DISTINCT FROM _fence OR d.lease_until<=clock_timestamp() OR _number<d.finalized_block OR _number>d.checkpoint OR _number<d.start_block-1
 THEN RAISE EXCEPTION 'Unsafe rewind'; END IF;
 IF _number>=d.start_block AND NOT EXISTS(SELECT 1 FROM public.virtual_blocks WHERE deployment_id=_deployment AND number=_number AND hash=_hash AND canonical)
 THEN RAISE EXCEPTION 'Unknown rewind ancestor'; END IF;
 UPDATE public.virtual_transactions SET status='reorged',updated_at=now() WHERE deployment_id=_deployment AND block_number>_number AND status IN('confirmed','finalized');
 UPDATE public.virtual_chain_events SET canonical=false WHERE deployment_id=_deployment AND block_number>_number AND canonical;
 UPDATE public.virtual_blocks SET canonical=false WHERE deployment_id=_deployment AND number>_number AND canonical;
 UPDATE public.virtual_deployments SET checkpoint=_number,checkpoint_hash=_hash,lease_until=clock_timestamp()+interval '120 seconds' WHERE id=_deployment;
END $$;
CREATE FUNCTION public.virtual_finalize_blocks(_deployment text,_fence uuid,_number numeric,_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.virtual_deployments%ROWTYPE;
BEGIN
 SELECT * INTO STRICT d FROM public.virtual_deployments WHERE id=_deployment FOR UPDATE;
 IF d.lease_fence IS NULL OR _fence IS NULL OR d.lease_until IS NULL OR d.lease_fence IS DISTINCT FROM _fence OR d.lease_until<=clock_timestamp() OR _number<d.finalized_block OR _number>d.checkpoint
 OR NOT EXISTS(SELECT 1 FROM public.virtual_blocks WHERE deployment_id=_deployment AND number=_number AND hash=_hash AND canonical)
 THEN RAISE EXCEPTION 'Finality proof mismatch'; END IF;
 UPDATE public.virtual_deployments SET finalized_block=_number,finalized_hash=_hash WHERE id=_deployment;
 UPDATE public.virtual_transactions t SET status='finalized',updated_at=now() WHERE t.deployment_id=_deployment AND t.status='confirmed' AND t.block_number<=_number
 AND EXISTS(SELECT 1 FROM public.virtual_blocks b WHERE b.deployment_id=_deployment AND b.hash=t.block_hash AND b.canonical);
END $$;
REVOKE ALL ON FUNCTION public.virtual_acquire_lease(text),public.virtual_release_lease(text,uuid),public.virtual_commit_block(text,uuid,numeric,text,text,numeric,jsonb,numeric),public.virtual_rewind(text,uuid,numeric,text),public.virtual_finalize_blocks(text,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.virtual_acquire_lease(text),public.virtual_release_lease(text,uuid),public.virtual_commit_block(text,uuid,numeric,text,text,numeric,jsonb,numeric),public.virtual_rewind(text,uuid,numeric,text),public.virtual_finalize_blocks(text,uuid,numeric,text) TO service_role;

CREATE FUNCTION public.virtual_freeze_approved() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (to_jsonb(OLD)->>'approved')::boolean IS TRUE OR to_jsonb(OLD)->>'status'='approved' THEN RAISE EXCEPTION 'Approved virtual points history is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER virtual_formula_history BEFORE UPDATE OR DELETE ON public.virtual_points_versions FOR EACH ROW EXECUTE FUNCTION public.virtual_freeze_approved();
CREATE TRIGGER virtual_snapshot_history BEFORE UPDATE OR DELETE ON public.virtual_points_snapshots FOR EACH ROW EXECUTE FUNCTION public.virtual_freeze_approved();
-- Lock the parent snapshot during every candidate mutation, so approval and edits
-- cannot race. Neither adding nor moving a row can rewrite approved history.
CREATE FUNCTION public.virtual_freeze_candidates() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE snapshot_state text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT status INTO STRICT snapshot_state FROM public.virtual_points_snapshots WHERE id=OLD.snapshot_id FOR UPDATE;
  IF snapshot_state='approved' THEN RAISE EXCEPTION 'Approved virtual points candidates are immutable'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT status INTO STRICT snapshot_state FROM public.virtual_points_snapshots WHERE id=NEW.snapshot_id FOR UPDATE;
  IF snapshot_state='approved' THEN RAISE EXCEPTION 'Approved virtual points candidates are immutable'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER virtual_candidate_history BEFORE INSERT OR UPDATE OR DELETE ON public.virtual_points_candidates FOR EACH ROW EXECUTE FUNCTION public.virtual_freeze_candidates();
COMMIT;
