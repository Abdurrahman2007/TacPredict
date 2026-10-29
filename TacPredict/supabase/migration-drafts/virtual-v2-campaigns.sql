-- ADDITIVE REVIEW DRAFT ONLY; not an applied migration. Requires virtual-v1.sql.
BEGIN;
CREATE TABLE public.virtual_campaign_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_id text NOT NULL REFERENCES public.virtual_deployments(id),
 month date NOT NULL CHECK (extract(day FROM month)=1),
 version integer NOT NULL CHECK (version>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','cancelled')),
 configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(deployment_id,month,version)
);
ALTER TABLE public.virtual_campaign_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.virtual_campaign_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.virtual_campaign_drafts TO authenticated;
CREATE POLICY virtual_campaign_admin_read ON public.virtual_campaign_drafts FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='admin'));
-- No public claim endpoint or user balance mutation. Service-only draft + audit in one transaction.
CREATE FUNCTION public.virtual_save_campaign_draft(_deployment text,_month date,_version integer,_config jsonb,_actor uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 INSERT INTO public.virtual_campaign_drafts(deployment_id,month,version,configuration,created_by)
 VALUES(_deployment,_month,_version,_config,_actor) RETURNING id INTO v_id;
 INSERT INTO public.virtual_admin_audit(actor,action,details)
 VALUES(_actor,'campaign.draft.saved',jsonb_build_object('id',v_id,'deployment',_deployment,'month',_month,'version',_version));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.virtual_save_campaign_draft(text,date,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.virtual_save_campaign_draft(text,date,integer,jsonb,uuid) TO service_role;
GRANT ALL ON public.virtual_campaign_drafts TO service_role;
COMMIT;
