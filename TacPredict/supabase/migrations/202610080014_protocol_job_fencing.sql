-- Base-only operational fencing. Privileged jobs never bypass finalized-event rules.
BEGIN;
CREATE TABLE public.protocol_job_leases (
 chain_id bigint NOT NULL REFERENCES public.protocol_deployments(chain_id) CHECK(chain_id IN(8453,84532)),
 job text NOT NULL CHECK(job IN('indexer','matcher')), owner uuid NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(chain_id,job)
);
CREATE TABLE public.protocol_job_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain_id bigint NOT NULL REFERENCES public.protocol_deployments(chain_id),
 job text NOT NULL CHECK(job IN('indexer','matcher')), started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 status text NOT NULL DEFAULT 'RUNNING' CHECK(status IN('RUNNING','SUCCESS','FAILED','SKIPPED')),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.protocol_job_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protocol_job_leases,public.protocol_job_runs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.protocol_job_leases,public.protocol_job_runs TO service_role;
CREATE FUNCTION public.acquire_protocol_job_lease(_chain bigint,_job text,_owner uuid,_seconds integer DEFAULT 180) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer; BEGIN
 IF _job NOT IN('indexer','matcher') OR _seconds<30 OR _seconds>300 OR NOT EXISTS(SELECT 1 FROM public.protocol_deployments WHERE chain_id=_chain AND verified) THEN RAISE EXCEPTION 'Invalid job/deployment'; END IF;
 INSERT INTO public.protocol_job_leases VALUES(_chain,_job,_owner,clock_timestamp()+make_interval(secs=>_seconds))
 ON CONFLICT(chain_id,job) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE protocol_job_leases.expires_at<=clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
CREATE FUNCTION public.renew_protocol_job_lease(_chain bigint,_job text,_owner uuid,_seconds integer DEFAULT 180) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer; BEGIN
 IF _seconds<30 OR _seconds>300 THEN RAISE EXCEPTION 'Invalid lease duration'; END IF;
 UPDATE public.protocol_job_leases SET expires_at=clock_timestamp()+make_interval(secs=>_seconds) WHERE chain_id=_chain AND job=_job AND owner=_owner AND expires_at>clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
CREATE FUNCTION public.release_protocol_job_lease(_chain bigint,_job text,_owner uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DELETE FROM public.protocol_job_leases WHERE chain_id=_chain AND job=_job AND owner=_owner; $$;
CREATE FUNCTION public.assert_protocol_job_lease(_chain bigint,_job text,_owner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.protocol_job_leases WHERE chain_id=_chain AND job=_job AND owner=_owner AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job lease expired or superseded'; END IF;
END $$;
CREATE FUNCTION public.apply_leased_protocol_event(_owner uuid,_chain bigint,_block numeric,_block_hash text,_tx text,_log integer,_contract text,_event text,_payload jsonb,_timestamp timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM public.assert_protocol_job_lease(_chain,'indexer',_owner); RETURN public.apply_protocol_event(_chain,_block,_block_hash,_tx,_log,_contract,_event,_payload,_timestamp); END $$;
CREATE FUNCTION public.advance_protocol_checkpoint(_owner uuid,_chain bigint,_expected_block numeric,_block numeric,_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous numeric; BEGIN
 PERFORM public.assert_protocol_job_lease(_chain,'indexer',_owner);
 SELECT block_number INTO previous FROM public.protocol_indexer_checkpoints WHERE chain_id=_chain FOR UPDATE;
 IF previous IS DISTINCT FROM _expected_block OR (_expected_block IS NOT NULL AND _block<=_expected_block) OR _block<0 THEN RAISE EXCEPTION 'Stale checkpoint update'; END IF;
 INSERT INTO public.protocol_indexer_checkpoints(chain_id,block_number,block_hash,updated_at) VALUES(_chain,_block,_hash,clock_timestamp()) ON CONFLICT(chain_id) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,updated_at=excluded.updated_at;
END $$;
CREATE FUNCTION public.finish_protocol_job_run(_id uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF _status NOT IN('SUCCESS','FAILED','SKIPPED') THEN RAISE EXCEPTION 'Invalid final job status'; END IF;
 UPDATE public.protocol_job_runs SET status=_status,finished_at=clock_timestamp() WHERE id=_id AND status='RUNNING'; END $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('acquire_protocol_job_lease','renew_protocol_job_lease','release_protocol_job_lease','assert_protocol_job_lease','apply_leased_protocol_event','advance_protocol_checkpoint','finish_protocol_job_run') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
COMMIT;
