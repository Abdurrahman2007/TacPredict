BEGIN;
CREATE OR REPLACE FUNCTION public.prepare_protocol_market(_hash text,_rules_hash text,_source_hash text,_document jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin role required'; END IF;
 IF _document IS NULL OR jsonb_typeof(_document)<>'object' OR NOT (_document ?& ARRAY['title','description','category','outcomes','rules','source','sourceUrl']) THEN RAISE EXCEPTION 'Incomplete terms'; END IF;
 IF jsonb_typeof(_document->'outcomes')<>'array' OR coalesce(_document->>'category','') NOT IN('Crypto','Sports','News','Technology','Business','Culture','Other') OR coalesce(char_length(_document->>'title'),0) NOT BETWEEN 5 AND 200 OR coalesce(char_length(_document->>'description'),0)<20 OR coalesce(char_length(_document->>'rules'),0)<20 OR coalesce(char_length(_document->>'source'),0)<3 OR coalesce(_document->>'sourceUrl','') !~ '^https://' THEN RAISE EXCEPTION 'Invalid terms'; END IF;
 IF jsonb_array_length(_document->'outcomes') NOT BETWEEN 2 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(_document->'outcomes') x WHERE jsonb_typeof(x)<>'string' OR char_length(x#>>'{}') NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Invalid outcomes'; END IF;
 INSERT INTO public.protocol_market_metadata(metadata_hash,document,rules_hash,source_hash,approved,created_by) VALUES(_hash,_document,_rules_hash,_source_hash,true,auth.uid());
 INSERT INTO public.protocol_audit_logs(actor,action,target) VALUES(auth.uid(),'MARKET_METADATA_PREPARED',_hash); RETURN _hash;
END $$;
CREATE FUNCTION public.get_protocol_metadata(_hash text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT document FROM public.protocol_market_metadata WHERE metadata_hash=_hash AND approved; $$;
REVOKE ALL ON FUNCTION public.get_protocol_metadata(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_protocol_metadata(text) TO anon,authenticated;
COMMIT;
