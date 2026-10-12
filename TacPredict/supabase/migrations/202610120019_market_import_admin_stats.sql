-- Admin importer stats: Validated (=REVIEWED), categories, published remains locked at 0.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_market_import_admin() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin MFA required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'policy',(
    SELECT jsonb_build_object(
      'discovery_enabled',p.discovery_enabled,
      'auto_publish',false,
      'categories',p.categories,
      'page_offset',p.page_offset,
      'last_success_at',p.last_success_at,
      'last_error',p.last_error,
      'interval_minutes',15,
      'updated_at',p.updated_at
    ) FROM public.market_import_policy p WHERE id
  ),
  'counts',(
    SELECT jsonb_build_object(
      'discovered',count(*),
      'validated',count(*) FILTER(WHERE status='REVIEWED'),
      'reviewRequired',count(*) FILTER(WHERE status='REVIEW_REQUIRED'),
      'rejected',count(*) FILTER(WHERE status='REJECTED'),
      'previews',count(*) FILTER(WHERE status='PREVIEW'),
      'published',0
    ) FROM public.market_candidates
  ),
  'runs',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT id,status,started_at,finished_at,discovered,rejected,ai_reviewed,error FROM public.market_agent_runs ORDER BY started_at DESC LIMIT 12) x),
  'candidates',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
    SELECT id,source,source_market_id,title,category,outcomes,close_at,source_url,proposed_rules,status,validation,fingerprint,discovered_at,updated_at
    FROM public.market_candidates ORDER BY discovered_at DESC LIMIT 50
  ) x)
 );
END $$;
REVOKE ALL ON FUNCTION public.get_market_import_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_market_import_admin() TO authenticated,service_role;
COMMIT;
