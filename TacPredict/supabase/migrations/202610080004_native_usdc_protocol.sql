-- Non-destructive native USDC protocol read models. Financial writes are indexer-only.
BEGIN;
CREATE TABLE IF NOT EXISTS public.protocol_deployments (
 chain_id bigint PRIMARY KEY CHECK(chain_id IN(8453,84532)),
 collateral_token text NOT NULL CHECK(collateral_token ~ '^0x[0-9a-fA-F]{40}$'),
 registry text NOT NULL, factory text NOT NULL, positions text NOT NULL, exchange text NOT NULL, oracle text NOT NULL, settlement text NOT NULL,
 deployment_block numeric(78,0) NOT NULL CHECK(deployment_block>=0),
 code_hashes jsonb NOT NULL, verified boolean NOT NULL DEFAULT false,
 trading_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(chain_id<>8453 OR lower(collateral_token)='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'),
 CHECK(chain_id<>84532 OR lower(collateral_token)='0x036cbd53842c5426634e7929541ec2318f3dcf7e')
);
CREATE TABLE IF NOT EXISTS public.protocol_market_metadata (
 metadata_hash text PRIMARY KEY CHECK(metadata_hash ~ '^0x[0-9a-f]{64}$'),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object'),
 rules_hash text NOT NULL CHECK(rules_hash ~ '^0x[0-9a-f]{64}$'),
 source_hash text NOT NULL CHECK(source_hash ~ '^0x[0-9a-f]{64}$'),
 approved boolean NOT NULL DEFAULT false, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.protocol_markets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chain_id bigint NOT NULL REFERENCES public.protocol_deployments(chain_id),
 onchain_id numeric(78,0) NOT NULL CHECK(onchain_id>0),
 market_id text GENERATED ALWAYS AS ('TACP-' || CASE WHEN length(onchain_id::text)<6 THEN lpad(onchain_id::text,6,'0') ELSE onchain_id::text END) STORED,
 question_id text NOT NULL, condition_id text NOT NULL, metadata_hash text NOT NULL,
 title text NOT NULL, description text NOT NULL DEFAULT '', category text NOT NULL CHECK(category IN('Crypto','Sports','News','Technology','Business','Culture','Other')),
 subcategory text, image_url text, tags text[] NOT NULL DEFAULT '{}',
 oracle text NOT NULL, resolution_source text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '', rules text NOT NULL DEFAULT '',
 rules_hash text NOT NULL, source_hash text NOT NULL, outcome_count smallint NOT NULL CHECK(outcome_count BETWEEN 2 AND 8),
 status text NOT NULL CHECK(status IN('DRAFT','UPCOMING','OPEN','CLOSED','RESOLVING','RESOLVED','SETTLED','VOID','CANCELLED')),
 open_at timestamptz NOT NULL, close_at timestamptz NOT NULL, resolve_after timestamptz NOT NULL, resolution_deadline timestamptz NOT NULL,
 created_at timestamptz NOT NULL, published boolean NOT NULL DEFAULT false,
 open_interest_atomic numeric(78,0) NOT NULL DEFAULT 0 CHECK(open_interest_atomic>=0),
 liquidity_atomic numeric(78,0) CHECK(liquidity_atomic>=0),
 UNIQUE(chain_id,onchain_id), UNIQUE(chain_id,condition_id), CHECK(close_at>open_at), CHECK(resolve_after>=close_at), CHECK(resolution_deadline>resolve_after)
);
CREATE TABLE IF NOT EXISTS public.protocol_market_outcomes (
 market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id), outcome_index smallint NOT NULL CHECK(outcome_index BETWEEN 0 AND 7),
 label text NOT NULL, token_id numeric(78,0) CHECK(token_id>=0), last_price_atomic numeric(78,0) CHECK(last_price_atomic BETWEEN 0 AND 1000000),
 payout_weight numeric(78,0), PRIMARY KEY(market_uuid,outcome_index), UNIQUE(market_uuid,token_id)
);
CREATE TABLE IF NOT EXISTS public.protocol_market_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),source_url text NOT NULL,source_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS public.protocol_market_rules (market_uuid uuid PRIMARY KEY REFERENCES public.protocol_markets(id),rules_hash text NOT NULL,rules text NOT NULL);
CREATE TABLE IF NOT EXISTS public.protocol_wallets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), address text NOT NULL UNIQUE CHECK(address ~ '^0x[0-9a-f]{40}$'),
 user_id uuid REFERENCES auth.users(id), verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.protocol_positions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),wallet_id uuid NOT NULL REFERENCES public.protocol_wallets(id),
 outcome_index smallint NOT NULL, shares_atomic numeric(78,0) NOT NULL DEFAULT 0 CHECK(shares_atomic>=0),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','CLOSED','CLAIMED','REFUNDED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(market_uuid,wallet_id,outcome_index), FOREIGN KEY(market_uuid,outcome_index) REFERENCES public.protocol_market_outcomes(market_uuid,outcome_index)
);
CREATE TABLE IF NOT EXISTS public.protocol_orders (
 order_id text PRIMARY KEY CHECK(order_id ~ '^0x[0-9a-f]{64}$'), market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),
 user_id uuid REFERENCES auth.users(id), maker text NOT NULL, taker text NOT NULL, outcome_index smallint NOT NULL,
 side text NOT NULL CHECK(side IN('BUY','SELL')),price_atomic numeric(78,0) NOT NULL CHECK(price_atomic>0 AND price_atomic<1000000),
 shares_atomic numeric(78,0) NOT NULL CHECK(shares_atomic>0),filled_atomic numeric(78,0) NOT NULL DEFAULT 0 CHECK(filled_atomic>=0 AND filled_atomic<=shares_atomic),
 nonce numeric(78,0) NOT NULL CHECK(nonce>=0),expiration timestamptz NOT NULL,signature text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','PARTIAL','FILLED','CANCELLED','EXPIRED')),
 signed_order jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(market_uuid,outcome_index) REFERENCES public.protocol_market_outcomes(market_uuid,outcome_index)
);
CREATE TABLE IF NOT EXISTS public.protocol_transactions (
 chain_id bigint NOT NULL,tx_hash text NOT NULL CHECK(tx_hash ~ '^0x[0-9a-f]{64}$'),block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL,contract_address text NOT NULL,status text NOT NULL DEFAULT 'FINALIZED' CHECK(status='FINALIZED'),
 PRIMARY KEY(chain_id,tx_hash)
);
CREATE TABLE IF NOT EXISTS public.protocol_chain_events (
 chain_id bigint NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL CHECK(log_index>=0),block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL,contract_address text NOT NULL,event_name text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chain_id,tx_hash,log_index)
);
CREATE TABLE IF NOT EXISTS public.protocol_trades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),
 chain_id bigint NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,buy_order_id text,sell_order_id text,
 buyer text NOT NULL,seller text NOT NULL,outcome_index smallint NOT NULL,price_atomic numeric(78,0) NOT NULL CHECK(price_atomic>0 AND price_atomic<1000000),
 shares_atomic numeric(78,0) NOT NULL CHECK(shares_atomic>0),usdc_atomic numeric(78,0) NOT NULL CHECK(usdc_atomic>0),timestamp timestamptz NOT NULL,
 UNIQUE(chain_id,tx_hash,log_index), FOREIGN KEY(chain_id,tx_hash) REFERENCES public.protocol_transactions(chain_id,tx_hash)
);
CREATE TABLE IF NOT EXISTS public.protocol_market_prices (market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),outcome_index smallint NOT NULL,price_atomic numeric(78,0) NOT NULL CHECK(price_atomic BETWEEN 0 AND 1000000),observed_at timestamptz NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,PRIMARY KEY(market_uuid,tx_hash,log_index));
CREATE TABLE IF NOT EXISTS public.protocol_resolutions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),market_uuid uuid NOT NULL UNIQUE REFERENCES public.protocol_markets(id),proposer text NOT NULL,proposed_outcome smallint NOT NULL,
 voided boolean NOT NULL DEFAULT false,evidence_hash text NOT NULL,source_hash text NOT NULL,source_timestamp timestamptz NOT NULL,
 proposed_at timestamptz NOT NULL,challenge_deadline timestamptz NOT NULL,finalized_at timestamptz,status text NOT NULL CHECK(status IN('PROPOSED','DISPUTED','FINAL','VOID'))
);
CREATE TABLE IF NOT EXISTS public.protocol_resolution_evidence (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),evidence_hash text NOT NULL,source_url text NOT NULL,source_timestamp timestamptz,document jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.protocol_disputes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),disputer text NOT NULL,alternative smallint NOT NULL,evidence_hash text NOT NULL,voided boolean NOT NULL,created_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','FINAL')));
CREATE TABLE IF NOT EXISTS public.protocol_claims (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),market_uuid uuid NOT NULL REFERENCES public.protocol_markets(id),wallet_id uuid NOT NULL REFERENCES public.protocol_wallets(id),amount_atomic numeric(78,0) NOT NULL CHECK(amount_atomic>=0),chain_id bigint NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,created_at timestamptz NOT NULL,UNIQUE(chain_id,tx_hash,log_index));
CREATE TABLE IF NOT EXISTS public.protocol_refunds (LIKE public.protocol_claims INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.protocol_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),kind text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz);
CREATE TABLE IF NOT EXISTS public.protocol_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor uuid,action text NOT NULL,target text,payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.protocol_indexer_checkpoints (chain_id bigint PRIMARY KEY REFERENCES public.protocol_deployments(chain_id),block_number numeric(78,0) NOT NULL,block_hash text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS protocol_markets_discovery_idx ON public.protocol_markets(published,category,close_at);
CREATE INDEX IF NOT EXISTS protocol_prices_time_idx ON public.protocol_market_prices(market_uuid,observed_at);
CREATE INDEX IF NOT EXISTS protocol_trades_time_idx ON public.protocol_trades(market_uuid,timestamp);
CREATE INDEX IF NOT EXISTS protocol_positions_wallet_idx ON public.protocol_positions(wallet_id);
CREATE INDEX IF NOT EXISTS protocol_orders_book_idx ON public.protocol_orders(market_uuid,outcome_index,status,price_atomic);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['protocol_deployments','protocol_market_metadata','protocol_markets','protocol_market_outcomes','protocol_market_sources','protocol_market_rules','protocol_wallets','protocol_positions','protocol_orders','protocol_transactions','protocol_chain_events','protocol_trades','protocol_market_prices','protocol_resolutions','protocol_resolution_evidence','protocol_disputes','protocol_claims','protocol_refunds','protocol_notifications','protocol_audit_logs','protocol_indexer_checkpoints'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON public.protocol_deployments,public.protocol_markets,public.protocol_market_outcomes,public.protocol_market_sources,public.protocol_market_rules,public.protocol_trades,public.protocol_market_prices,public.protocol_resolutions,public.protocol_resolution_evidence,public.protocol_disputes TO anon,authenticated;
CREATE POLICY "Verified deployments only" ON public.protocol_deployments FOR SELECT TO anon,authenticated USING(verified);
CREATE POLICY "Published native markets" ON public.protocol_markets FOR SELECT TO anon,authenticated USING(published);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['protocol_market_outcomes','protocol_market_sources','protocol_market_rules','protocol_trades','protocol_market_prices','protocol_resolutions','protocol_resolution_evidence','protocol_disputes'] LOOP
  EXECUTE format('CREATE POLICY "Published market rows" ON public.%I FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM public.protocol_markets m WHERE m.id=market_uuid AND m.published))',t);
 END LOOP;
END $$;
GRANT SELECT ON public.protocol_wallets,public.protocol_positions,public.protocol_orders,public.protocol_claims,public.protocol_refunds,public.protocol_notifications TO authenticated;
CREATE POLICY "Own verified wallets" ON public.protocol_wallets FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY "Own verified positions" ON public.protocol_positions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.id=wallet_id AND w.user_id=(SELECT auth.uid())));
CREATE POLICY "Own signed orders" ON public.protocol_orders FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY "Own claims" ON public.protocol_claims FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.id=wallet_id AND w.user_id=(SELECT auth.uid())));
CREATE POLICY "Own refunds" ON public.protocol_refunds FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.protocol_wallets w WHERE w.id=wallet_id AND w.user_id=(SELECT auth.uid())));
CREATE POLICY "Own notifications" ON public.protocol_notifications FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
GRANT SELECT ON public.protocol_market_metadata,public.protocol_audit_logs TO authenticated;
CREATE POLICY "Admin metadata" ON public.protocol_market_metadata FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=(SELECT auth.uid()) AND role='admin'));
CREATE POLICY "Admin audit" ON public.protocol_audit_logs FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=(SELECT auth.uid()) AND role='admin'));
CREATE VIEW public.protocol_market_metrics WITH(security_invoker=true) AS
 SELECT m.id AS market_uuid,coalesce(sum(t.usdc_atomic),0)::text AS volume_atomic,
 coalesce(sum(t.usdc_atomic) FILTER(WHERE t.timestamp>now()-interval '24 hours'),0)::text AS volume_24h_atomic,
 (SELECT count(DISTINCT address) FROM (SELECT buyer AS address FROM public.protocol_trades WHERE market_uuid=m.id UNION SELECT seller FROM public.protocol_trades WHERE market_uuid=m.id) a) AS traders,
 m.open_interest_atomic::text,m.liquidity_atomic::text
 FROM public.protocol_markets m LEFT JOIN public.protocol_trades t ON t.market_uuid=m.id GROUP BY m.id;
GRANT SELECT ON public.protocol_market_metrics TO anon,authenticated;
CREATE VIEW public.protocol_orderbook WITH(security_barrier=true) AS
 SELECT o.order_id,o.market_uuid,o.maker,o.taker,o.outcome_index,o.side,o.price_atomic::text,o.shares_atomic::text,o.filled_atomic::text,o.expiration,o.created_at
 FROM public.protocol_orders o JOIN public.protocol_markets m ON m.id=o.market_uuid
 WHERE m.published AND m.close_at>now() AND m.open_at<=now() AND m.status IN('UPCOMING','OPEN') AND o.status IN('OPEN','PARTIAL') AND o.expiration>now();
GRANT SELECT ON public.protocol_orderbook TO anon,authenticated;
-- Only an auth-provider-verified wallet identity can claim ownership of indexed positions.
CREATE FUNCTION public.register_my_protocol_wallet() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT lower(coalesce(identity_data->>'address',identity_data->>'sub')) INTO a FROM auth.identities
 WHERE user_id=auth.uid() AND provider IN('web3','ethereum') AND coalesce(identity_data->>'address',identity_data->>'sub') ~ '^0x[0-9a-fA-F]{40}$' LIMIT 1;
 IF a IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.protocol_wallets(address,user_id,verified_at) VALUES(a,auth.uid(),now())
 ON CONFLICT(address) DO UPDATE SET user_id=excluded.user_id,verified_at=now() WHERE protocol_wallets.user_id IS NULL OR protocol_wallets.user_id=auth.uid();
 IF NOT EXISTS(SELECT 1 FROM public.protocol_wallets WHERE address=a AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Wallet already linked'; END IF;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.register_my_protocol_wallet() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_my_protocol_wallet() TO authenticated;
CREATE FUNCTION public.prepare_protocol_market(_hash text,_rules_hash text,_source_hash text,_document jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN RAISE EXCEPTION 'Admin role required'; END IF;
 IF _document IS NULL OR NOT (_document ?& ARRAY['title','description','category','outcomes','rules','source','sourceUrl']) OR _document->>'category' NOT IN('Crypto','Sports','News','Technology','Business','Culture','Other') OR char_length(_document->>'title') NOT BETWEEN 5 AND 200 OR jsonb_array_length(_document->'outcomes') NOT BETWEEN 2 AND 8 OR char_length(_document->>'rules')<20 OR (_document->>'sourceUrl') !~ '^https://' THEN RAISE EXCEPTION 'Incomplete market terms'; END IF;
 INSERT INTO public.protocol_market_metadata(metadata_hash,document,rules_hash,source_hash,approved,created_by) VALUES(_hash,_document,_rules_hash,_source_hash,true,auth.uid());
 INSERT INTO public.protocol_audit_logs(actor,action,target) VALUES(auth.uid(),'MARKET_METADATA_PREPARED',_hash); RETURN _hash;
END $$;
REVOKE ALL ON FUNCTION public.prepare_protocol_market(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_protocol_market(text,text,text,jsonb) TO authenticated;

-- The privileged indexer validates finalized receipts, deployed bytecode, emitter and event ABI BEFORE calling this.
CREATE FUNCTION public.apply_protocol_event(_chain bigint,_block numeric,_block_hash text,_tx text,_log integer,_contract text,_event text,_payload jsonb,_timestamp timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.protocol_deployments; m public.protocol_markets; meta public.protocol_market_metadata; w uuid; inserted integer; i integer; p numeric; owner_address text; token numeric; delta numeric; outcome smallint; BEGIN
 SELECT * INTO d FROM public.protocol_deployments WHERE chain_id=_chain AND verified;
 IF d.chain_id IS NULL OR _block<d.deployment_block OR lower(_contract) NOT IN(lower(d.registry),lower(d.factory),lower(d.positions),lower(d.exchange),lower(d.oracle),lower(d.settlement)) THEN RAISE EXCEPTION 'Unverified deployment/emitter'; END IF;
 IF _event NOT IN('MarketCreated','MarketClosed','ResolutionFinalized','TransferSingle','TransferBatch','PositionCreated','CompleteSetMerged','PositionRedeemed','OrderFilled','OrderCancelled','NonceInvalidated','TradeExecuted','ResolutionProposed','ResolutionDisputed','DisputeFinalized','BondWithdrawn','MetadataPublished') THEN RAISE EXCEPTION 'Unsupported protocol event'; END IF;
 IF _tx !~ '^0x[0-9a-f]{64}$' OR _block_hash !~ '^0x[0-9a-f]{64}$' OR _log<0 OR jsonb_typeof(_payload)<>'object' OR octet_length(_payload::text)>65536 THEN RAISE EXCEPTION 'Invalid event'; END IF;
 IF (_event IN('MarketCreated','MarketClosed','ResolutionFinalized') AND lower(_contract)<>lower(d.registry)) OR (_event IN('TransferSingle','TransferBatch','PositionCreated','CompleteSetMerged','PositionRedeemed') AND lower(_contract)<>lower(d.positions)) OR (_event IN('OrderFilled','OrderCancelled','NonceInvalidated','TradeExecuted') AND lower(_contract)<>lower(d.exchange)) OR (_event IN('ResolutionProposed','ResolutionDisputed','DisputeFinalized','BondWithdrawn') AND lower(_contract)<>lower(d.oracle)) OR (_event='MetadataPublished' AND lower(_contract)<>lower(d.factory)) THEN RAISE EXCEPTION 'Wrong event emitter'; END IF;
 INSERT INTO public.protocol_chain_events VALUES(_chain,_tx,_log,_block,_block_hash,lower(_contract),_event,_payload,now()) ON CONFLICT DO NOTHING; GET DIAGNOSTICS inserted=ROW_COUNT; IF inserted=0 THEN RETURN false; END IF;
 INSERT INTO public.protocol_transactions VALUES(_chain,_tx,_block,_block_hash,lower(_contract),'FINALIZED') ON CONFLICT DO NOTHING;
 IF _event='MarketCreated' THEN
  SELECT * INTO meta FROM public.protocol_market_metadata WHERE metadata_hash=_payload->>'metadataHash' AND approved AND rules_hash=_payload->>'rulesHash' AND source_hash=_payload->>'sourceHash';
  INSERT INTO public.protocol_markets(chain_id,onchain_id,question_id,condition_id,metadata_hash,title,description,category,subcategory,image_url,tags,oracle,resolution_source,source_url,rules,rules_hash,source_hash,outcome_count,status,open_at,close_at,resolve_after,resolution_deadline,created_at,published)
  VALUES(_chain,(_payload->>'marketId')::numeric,_payload->>'questionId',_payload->>'conditionId',_payload->>'metadataHash',coalesce(meta.document->>'title','Unpublished on-chain market'),coalesce(meta.document->>'description',''),coalesce(meta.document->>'category','Other'),meta.document->>'subcategory',meta.document->>'image',coalesce(ARRAY(SELECT jsonb_array_elements_text(meta.document->'tags')),'{}'),lower(_payload->>'oracle'),coalesce(meta.document->>'source',''),coalesce(meta.document->>'sourceUrl',''),coalesce(meta.document->>'rules',''),_payload->>'rulesHash',_payload->>'sourceHash',(_payload->>'outcomeCount')::smallint,'UPCOMING',to_timestamp((_payload->>'openAt')::double precision),to_timestamp((_payload->>'closeAt')::double precision),to_timestamp((_payload->>'resolveAfter')::double precision),to_timestamp((_payload->>'resolutionDeadline')::double precision),_timestamp,meta.metadata_hash IS NOT NULL) RETURNING * INTO m;
  FOR i IN 0..m.outcome_count-1 LOOP INSERT INTO public.protocol_market_outcomes(market_uuid,outcome_index,label,token_id) VALUES(m.id,i,coalesce(meta.document->'outcomes'->>i,'Outcome '||i),(_payload->'tokenIds'->>i)::numeric); END LOOP;
  INSERT INTO public.protocol_market_rules VALUES(m.id,m.rules_hash,m.rules);
  INSERT INTO public.protocol_market_sources(market_uuid,source_url,source_hash) VALUES(m.id,m.source_url,m.source_hash);
  RETURN true;
 END IF;
 IF _event IN('TransferSingle','TransferBatch') THEN
  FOR i IN 0..(CASE WHEN _event='TransferSingle' THEN 0 ELSE jsonb_array_length(_payload->'ids')-1 END) LOOP
   token=CASE WHEN _event='TransferSingle' THEN (_payload->>'id')::numeric ELSE (_payload->'ids'->>i)::numeric END;
   delta=CASE WHEN _event='TransferSingle' THEN (_payload->>'value')::numeric ELSE (_payload->'values'->>i)::numeric END;
   SELECT pm.* INTO m FROM public.protocol_markets pm JOIN public.protocol_market_outcomes o ON o.market_uuid=pm.id WHERE pm.chain_id=_chain AND o.token_id=token;
   IF m.id IS NULL THEN RAISE EXCEPTION 'Unindexed outcome token'; END IF;
   SELECT outcome_index INTO outcome FROM public.protocol_market_outcomes WHERE market_uuid=m.id AND token_id=token;
   FOREACH owner_address IN ARRAY ARRAY[lower(_payload->>'from'),lower(_payload->>'to')] LOOP
    IF owner_address<>'0x0000000000000000000000000000000000000000' THEN
     INSERT INTO public.protocol_wallets(address) VALUES(owner_address) ON CONFLICT DO NOTHING; SELECT id INTO w FROM public.protocol_wallets WHERE address=owner_address;
     INSERT INTO public.protocol_positions(market_uuid,wallet_id,outcome_index) VALUES(m.id,w,outcome) ON CONFLICT DO NOTHING;
     UPDATE public.protocol_positions SET shares_atomic=shares_atomic+CASE WHEN owner_address=lower(_payload->>'from') THEN -delta ELSE delta END,updated_at=_timestamp WHERE market_uuid=m.id AND wallet_id=w AND outcome_index=outcome;
    END IF;
   END LOOP;
  END LOOP; RETURN true;
 END IF;
 SELECT * INTO m FROM public.protocol_markets WHERE chain_id=_chain AND onchain_id=(_payload->>'marketId')::numeric;
 IF _event IN('OrderCancelled','NonceInvalidated') THEN
  UPDATE public.protocol_orders SET status='CANCELLED' WHERE (_event='OrderCancelled' AND order_id=_payload->>'orderId') OR (_event='NonceInvalidated' AND maker=lower(_payload->>'maker') AND nonce<(_payload->>'nonce')::numeric); RETURN true;
 END IF;
 IF m.id IS NULL THEN RETURN true; END IF;
 IF _event='PositionCreated' THEN UPDATE public.protocol_markets SET open_interest_atomic=open_interest_atomic+(_payload->>'collateral')::numeric WHERE id=m.id;
 ELSIF _event='CompleteSetMerged' THEN UPDATE public.protocol_markets SET open_interest_atomic=open_interest_atomic-(_payload->>'collateral')::numeric WHERE id=m.id;
 ELSIF _event='PositionRedeemed' THEN
  p=(_payload->>'collateral')::numeric; UPDATE public.protocol_markets SET open_interest_atomic=open_interest_atomic-p WHERE id=m.id;
  SELECT id INTO w FROM public.protocol_wallets WHERE address=lower(_payload->>'account');
  IF (_payload->>'voided')::boolean THEN INSERT INTO public.protocol_refunds(market_uuid,wallet_id,amount_atomic,chain_id,tx_hash,log_index,created_at) VALUES(m.id,w,p,_chain,_tx,_log,_timestamp); ELSE INSERT INTO public.protocol_claims(market_uuid,wallet_id,amount_atomic,chain_id,tx_hash,log_index,created_at) VALUES(m.id,w,p,_chain,_tx,_log,_timestamp); END IF;
  UPDATE public.protocol_positions SET status=CASE WHEN (_payload->>'voided')::boolean THEN 'REFUNDED' ELSE 'CLAIMED' END WHERE market_uuid=m.id AND wallet_id=w;
 ELSIF _event='TradeExecuted' THEN
  INSERT INTO public.protocol_trades(market_uuid,chain_id,tx_hash,log_index,buy_order_id,sell_order_id,buyer,seller,outcome_index,price_atomic,shares_atomic,usdc_atomic,timestamp) VALUES(m.id,_chain,_tx,_log,_payload->>'buyOrderId',_payload->>'sellOrderId',lower(_payload->>'buyer'),lower(_payload->>'seller'),(_payload->>'outcome')::smallint,(_payload->>'price')::numeric,(_payload->>'shares')::numeric,(_payload->>'usdcAmount')::numeric,_timestamp);
  UPDATE public.protocol_market_outcomes SET last_price_atomic=(_payload->>'price')::numeric WHERE market_uuid=m.id AND outcome_index=(_payload->>'outcome')::smallint;
  INSERT INTO public.protocol_market_prices VALUES(m.id,(_payload->>'outcome')::smallint,(_payload->>'price')::numeric,_timestamp,_tx,_log);
 ELSIF _event='OrderFilled' THEN UPDATE public.protocol_orders SET filled_atomic=(_payload->>'totalFilled')::numeric,status=CASE WHEN (_payload->>'totalFilled')::numeric>=shares_atomic THEN 'FILLED' ELSE 'PARTIAL' END WHERE order_id=_payload->>'orderId';
 ELSIF _event='MarketClosed' THEN UPDATE public.protocol_markets SET status='CLOSED' WHERE id=m.id;
 ELSIF _event='ResolutionProposed' THEN
  INSERT INTO public.protocol_resolutions(market_uuid,proposer,proposed_outcome,voided,evidence_hash,source_hash,source_timestamp,proposed_at,challenge_deadline,status) VALUES(m.id,lower(_payload->>'proposer'),(_payload->>'outcome')::smallint,(_payload->>'voided')::boolean,_payload->>'evidenceHash',_payload->>'sourceHash',to_timestamp((_payload->>'sourceTimestamp')::double precision),_timestamp,to_timestamp((_payload->>'challengeDeadline')::double precision),'PROPOSED');
  INSERT INTO public.protocol_resolution_evidence(market_uuid,evidence_hash,source_url,source_timestamp) VALUES(m.id,_payload->>'evidenceHash',m.source_url,to_timestamp((_payload->>'sourceTimestamp')::double precision));
  UPDATE public.protocol_markets SET status='RESOLVING' WHERE id=m.id;
 ELSIF _event='ResolutionDisputed' THEN
  INSERT INTO public.protocol_disputes(market_uuid,disputer,alternative,evidence_hash,voided,created_at) VALUES(m.id,lower(_payload->>'disputer'),(_payload->>'alternative')::smallint,_payload->>'evidenceHash',(_payload->>'voided')::boolean,_timestamp);
  UPDATE public.protocol_resolutions SET status='DISPUTED' WHERE market_uuid=m.id;
 ELSIF _event='ResolutionFinalized' THEN
  FOR i IN 0..jsonb_array_length(_payload->'weights')-1 LOOP UPDATE public.protocol_market_outcomes SET payout_weight=(_payload->'weights'->>i)::numeric WHERE market_uuid=m.id AND outcome_index=i; END LOOP;
  UPDATE public.protocol_markets SET status=CASE WHEN (_payload->>'voided')::boolean THEN 'VOID' ELSE 'RESOLVED' END WHERE id=m.id;
  UPDATE public.protocol_positions SET status='CLOSED' WHERE market_uuid=m.id AND status='OPEN';
  UPDATE public.protocol_resolutions SET status=CASE WHEN (_payload->>'voided')::boolean THEN 'VOID' ELSE 'FINAL' END,finalized_at=_timestamp WHERE market_uuid=m.id;
  UPDATE public.protocol_disputes SET status='FINAL' WHERE market_uuid=m.id;
 END IF; RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apply_protocol_event(bigint,numeric,text,text,integer,text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_protocol_event(bigint,numeric,text,text,integer,text,text,jsonb,timestamptz) TO service_role;
COMMIT;
