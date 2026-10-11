-- Metadata discovery only; this does not enable trading or give the agent a signer.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE OR REPLACE FUNCTION public.persist_market_candidates(_items jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; n integer:=0; BEGIN
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)>33 THEN RAISE EXCEPTION 'Bounded batch required'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(_items) LOOP
  BEGIN
  INSERT INTO public.market_candidates(source,source_market_id,fingerprint,title,description,category,outcomes,close_at,source_url,proposed_rules,status,validation,preview_document)
  VALUES(c->>'source',c->>'source_market_id',c->>'fingerprint',c->>'title',c->>'description',c->>'category',c->'outcomes',(c->>'close_at')::timestamptz,c->>'source_url',c->>'proposed_rules',c->>'status',c->'validation',CASE WHEN c->'preview_document'='null'::jsonb THEN NULL ELSE c->'preview_document' END)
  ON CONFLICT(source,source_market_id) DO UPDATE SET
   updated_at=now(),
   category=CASE WHEN market_candidates.source='polymarket' AND market_candidates.status='REVIEW_REQUIRED' THEN EXCLUDED.category ELSE market_candidates.category END,
   preview_document=CASE WHEN market_candidates.source='coingecko' THEN market_candidates.preview_document || jsonb_build_object('observedPrice',EXCLUDED.preview_document->'observedPrice','observedAt',EXCLUDED.preview_document->'observedAt') ELSE market_candidates.preview_document END,
   validation=CASE WHEN (market_candidates.validation->'aiReview' IS NULL OR market_candidates.validation->'aiReview'='null'::jsonb OR market_candidates.validation->'aiReview'->>'unavailable'='true') AND EXCLUDED.validation->'aiReview'<>'null'::jsonb THEN market_candidates.validation || jsonb_build_object('aiReview',EXCLUDED.validation->'aiReview') ELSE market_candidates.validation END;
  n:=n+1;
  EXCEPTION WHEN unique_violation THEN NULL; END;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.persist_market_candidates(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_market_candidates(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_market_event_drafts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(x.document),'[]'::jsonb) FROM (
 SELECT jsonb_build_object('id','event-'||id::text,'title',title,'category',category,'outcomes',outcomes,'closeAt',close_at,'sourceUrl',source_url,'status','DISCOVERED','source','Polymarket Gamma','updatedAt',updated_at) AS document
 FROM public.market_candidates WHERE source='polymarket' AND status IN('REVIEW_REQUIRED','REVIEWED') AND close_at>now()+interval '1 hour' AND updated_at>now()-interval '24 hours'
 ORDER BY updated_at DESC,discovered_at DESC LIMIT 30) x;
$$;
REVOKE ALL ON FUNCTION public.get_market_event_drafts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_market_event_drafts() TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.request_market_discovery() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text; request_id bigint; BEGIN
 SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='tacpredict_market_discovery_scheduler' LIMIT 1;
 IF secret IS NULL THEN RAISE EXCEPTION 'Scheduler credential is not installed'; END IF;
 SELECT net.http_post(url:='https://tacpredict.fun/api/agent/scheduled',headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=120000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.request_market_discovery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_market_discovery() TO service_role;
COMMIT;
