-- Metadata-only discovery. No financial tables, contract roles or balances are changed.
BEGIN;
CREATE TABLE public.market_import_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), discovery_enabled boolean NOT NULL DEFAULT true,
 auto_publish boolean NOT NULL DEFAULT false CHECK(NOT auto_publish),
 categories text[] NOT NULL DEFAULT ARRAY['Crypto','Sports','News','Technology','Business','Culture'],
 page_offset integer NOT NULL DEFAULT 0 CHECK(page_offset>=0),
 lease_id uuid, lease_until timestamptz, last_success_at timestamptz,
 last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.market_import_policy(id) VALUES(true);
CREATE TABLE public.market_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL CHECK(source IN('polymarket','coingecko')),
 source_market_id text NOT NULL, fingerprint text NOT NULL UNIQUE,
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 200), description text NOT NULL DEFAULT '',
 category text NOT NULL, outcomes jsonb NOT NULL CHECK(jsonb_typeof(outcomes)='array' AND jsonb_array_length(outcomes) BETWEEN 2 AND 8),
 close_at timestamptz NOT NULL, source_url text NOT NULL CHECK(source_url ~ '^https://'),
 proposed_rules text NOT NULL, validation jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL CHECK(status IN('REVIEW_REQUIRED','REJECTED','REVIEWED','PREVIEW')),
 preview_document jsonb, discovered_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,source_market_id), CHECK(preview_document IS NULL OR source='coingecko' AND status='PREVIEW')
);
CREATE TABLE public.market_agent_runs (
 id uuid PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 status text NOT NULL CHECK(status IN('RUNNING','SUCCESS','PARTIAL','FAILED')),
 discovered integer NOT NULL DEFAULT 0, rejected integer NOT NULL DEFAULT 0,
 ai_reviewed boolean NOT NULL DEFAULT false, error text
);
ALTER TABLE public.market_import_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_agent_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_import_policy,public.market_candidates,public.market_agent_runs FROM anon,authenticated;
GRANT ALL ON public.market_import_policy,public.market_candidates,public.market_agent_runs TO service_role;
CREATE FUNCTION public.claim_market_import_run(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.market_import_policy; BEGIN
 UPDATE public.market_import_policy SET lease_id=_id,lease_until=now()+interval '3 minutes' WHERE id AND discovery_enabled AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO p;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.market_agent_runs(id,status) VALUES(_id,'RUNNING');
 RETURN jsonb_build_object('offset',p.page_offset,'categories',p.categories);
END $$;
CREATE FUNCTION public.finish_market_import_run(_id uuid,_status text,_discovered integer,_rejected integer,_ai boolean,_error text,_offset integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.market_import_policy SET lease_until=NULL,lease_id=NULL,page_offset=_offset,last_success_at=CASE WHEN _status IN('SUCCESS','PARTIAL') THEN now() ELSE last_success_at END,last_error=_error,updated_at=now() WHERE id AND lease_id=_id;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.market_agent_runs SET status=_status,discovered=_discovered,rejected=_rejected,ai_reviewed=_ai,error=_error,finished_at=now() WHERE id=_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_market_import_run(uuid),public.finish_market_import_run(uuid,text,integer,integer,boolean,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_market_import_run(uuid),public.finish_market_import_run(uuid,text,integer,integer,boolean,text,integer) TO service_role;

CREATE FUNCTION public.persist_market_candidates(_items jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; n integer:=0; BEGIN
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)>23 THEN RAISE EXCEPTION 'Bounded batch required'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(_items) LOOP
  BEGIN
  INSERT INTO public.market_candidates(source,source_market_id,fingerprint,title,description,category,outcomes,close_at,source_url,proposed_rules,status,validation,preview_document)
  VALUES(c->>'source',c->>'source_market_id',c->>'fingerprint',c->>'title',c->>'description',c->>'category',c->'outcomes',(c->>'close_at')::timestamptz,c->>'source_url',c->>'proposed_rules',c->>'status',c->'validation',CASE WHEN c->'preview_document'='null'::jsonb THEN NULL ELSE c->'preview_document' END)
  ON CONFLICT(source,source_market_id) DO UPDATE SET
   updated_at=now(),
   preview_document=CASE WHEN market_candidates.source='coingecko' THEN market_candidates.preview_document || jsonb_build_object('observedPrice',EXCLUDED.preview_document->'observedPrice','observedAt',EXCLUDED.preview_document->'observedAt') ELSE market_candidates.preview_document END,
   validation=CASE WHEN market_candidates.validation->'aiReview'='null'::jsonb AND EXCLUDED.validation->'aiReview'<>'null'::jsonb THEN market_candidates.validation || jsonb_build_object('aiReview',EXCLUDED.validation->'aiReview') ELSE market_candidates.validation END;
  n:=n+1;
  EXCEPTION WHEN unique_violation THEN NULL; END;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.persist_market_candidates(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_market_candidates(jsonb) TO service_role;

CREATE FUNCTION public.get_market_previews() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(x.preview_document),'[]'::jsonb) FROM (SELECT preview_document FROM public.market_candidates WHERE source='coingecko' AND status='PREVIEW' AND preview_document IS NOT NULL AND close_at>now() AND updated_at>now()-interval '18 hours' ORDER BY updated_at DESC LIMIT 3) x;
$$;
REVOKE ALL ON FUNCTION public.get_market_previews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_market_previews() TO anon,authenticated,service_role;
CREATE FUNCTION public.get_market_import_admin() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin MFA required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('policy',(SELECT to_jsonb(p)-'lease_id' FROM public.market_import_policy p WHERE id), 'counts',(SELECT jsonb_build_object('discovered',count(*),'rejected',count(*) FILTER(WHERE status='REJECTED'),'reviewRequired',count(*) FILTER(WHERE status='REVIEW_REQUIRED'),'previews',count(*) FILTER(WHERE status='PREVIEW'),'published',0) FROM public.market_candidates),'runs',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM public.market_agent_runs ORDER BY started_at DESC LIMIT 10) x),'candidates',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT id,source,source_market_id,title,category,close_at,source_url,proposed_rules,status,validation,discovered_at FROM public.market_candidates ORDER BY discovered_at DESC LIMIT 40) x));
END $$;
CREATE FUNCTION public.set_market_import_enabled(_enabled boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin MFA required' USING ERRCODE='42501'; END IF;
 UPDATE public.market_import_policy SET discovery_enabled=_enabled,updated_at=now() WHERE id;
 INSERT INTO public.protocol_audit_logs(actor,action,target) VALUES(auth.uid(),CASE WHEN _enabled THEN 'IMPORTER_ENABLED' ELSE 'IMPORTER_PAUSED' END,'market-import-policy');
 RETURN _enabled;
END $$;
CREATE FUNCTION public.review_market_candidate(_id uuid,_reject boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin MFA required' USING ERRCODE='42501'; END IF;
 UPDATE public.market_candidates SET status=CASE WHEN _reject THEN 'REJECTED' ELSE 'REVIEWED' END,updated_at=now() WHERE id=_id AND source='polymarket';
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.protocol_audit_logs(actor,action,target) VALUES(auth.uid(),CASE WHEN _reject THEN 'IMPORT_CANDIDATE_REJECTED' ELSE 'IMPORT_CANDIDATE_REVIEWED' END,_id::text);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.get_market_import_admin(),public.set_market_import_enabled(boolean),public.review_market_candidate(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_market_import_admin(),public.set_market_import_enabled(boolean),public.review_market_candidate(uuid,boolean) TO authenticated;
COMMIT;
