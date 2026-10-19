-- Owner approved aggregate-only read on this continuation. No mutations authorized.
-- Existing project only: lmqaiqvwcytmgwgwyfwx. No user/address/payload rows are returned.
-- Read-only discrepancy COUNTS are not independent proof of complete canonical chain coverage.
-- Approved finalized anchor must be refreshed/reviewed before execution; never infer current chain truth from this file.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
WITH checkpoint AS (
 SELECT chain_id,block_number,block_hash,updated_at FROM public.protocol_indexer_checkpoints WHERE chain_id=8453
), scope AS (
 SELECT e.* FROM public.protocol_chain_events e JOIN checkpoint c ON c.chain_id=e.chain_id
 WHERE e.block_number<=c.block_number AND c.block_number<=52813606
), missing_parent AS (
 SELECT e.chain_id,e.tx_hash,e.log_index FROM scope e
 LEFT JOIN public.protocol_markets m ON m.chain_id=e.chain_id AND m.onchain_id=(e.payload->>'marketId')::numeric
 WHERE e.event_name IN('MarketClosed','ResolutionFinalized','PositionCreated','CompleteSetMerged','PositionRedeemed','OrderFilled','TradeExecuted','ResolutionProposed','ResolutionDisputed','DisputeFinalized','MetadataPublished') AND m.id IS NULL
), missing_trade AS (
 SELECT e.tx_hash FROM scope e LEFT JOIN public.protocol_trades t ON t.chain_id=e.chain_id AND t.tx_hash=e.tx_hash AND t.log_index=e.log_index
 WHERE e.event_name='TradeExecuted' AND t.id IS NULL
), mismatched_trade AS (
 SELECT e.tx_hash FROM scope e JOIN public.protocol_trades t ON t.chain_id=e.chain_id AND t.tx_hash=e.tx_hash AND t.log_index=e.log_index
 JOIN public.protocol_markets m ON m.id=t.market_uuid
 WHERE e.event_name='TradeExecuted' AND (m.chain_id<>e.chain_id OR m.onchain_id<>(e.payload->>'marketId')::numeric
 OR t.price_atomic<>(e.payload->>'price')::numeric OR t.shares_atomic<>(e.payload->>'shares')::numeric OR t.usdc_atomic<>(e.payload->>'usdcAmount')::numeric
 OR t.buyer IS DISTINCT FROM lower(e.payload->>'buyer') OR t.seller IS DISTINCT FROM lower(e.payload->>'seller')
 OR t.outcome_index<>(e.payload->>'outcome')::smallint OR t.buy_order_id IS DISTINCT FROM e.payload->>'buyOrderId' OR t.sell_order_id IS DISTINCT FROM e.payload->>'sellOrderId')
), missing_redemption AS (
 SELECT e.tx_hash FROM scope e
 LEFT JOIN public.protocol_claims c ON c.chain_id=e.chain_id AND c.tx_hash=e.tx_hash AND c.log_index=e.log_index
 LEFT JOIN public.protocol_refunds r ON r.chain_id=e.chain_id AND r.tx_hash=e.tx_hash AND r.log_index=e.log_index
 WHERE e.event_name='PositionRedeemed' AND CASE WHEN (e.payload->>'voided')::boolean THEN r.id IS NULL ELSE c.id IS NULL END
), mismatched_redemption AS (
 SELECT e.tx_hash FROM scope e
 JOIN (SELECT false AS voided,* FROM public.protocol_claims UNION ALL SELECT true AS voided,* FROM public.protocol_refunds) r
 ON r.chain_id=e.chain_id AND r.tx_hash=e.tx_hash AND r.log_index=e.log_index
 JOIN public.protocol_markets m ON m.id=r.market_uuid JOIN public.protocol_wallets w ON w.id=r.wallet_id
 WHERE e.event_name='PositionRedeemed' AND (r.voided IS DISTINCT FROM (e.payload->>'voided')::boolean OR m.chain_id<>e.chain_id
 OR m.onchain_id<>(e.payload->>'marketId')::numeric OR r.amount_atomic<>(e.payload->>'collateral')::numeric OR w.address IS DISTINCT FROM lower(e.payload->>'account'))
)
SELECT jsonb_build_object(
 'mode','READ_ONLY_AGGREGATE_COUNTS_NOT_CHAIN_PROOF',
 'checkpoint',(SELECT jsonb_build_object('chainId',chain_id,'blockNumber',block_number::text,'blockHash',block_hash,'updatedAt',updated_at,'withinReviewedFinalizedAnchor',block_number<=52813606) FROM checkpoint),
 'scopedRawEventCount',(SELECT count(*)::text FROM scope),
 'missingMarketParents',(SELECT count(*)::text FROM missing_parent),
 'missingTradeProjections',(SELECT count(*)::text FROM missing_trade),
 'mismatchedTradeProjections',(SELECT count(*)::text FROM mismatched_trade),
 'missingPrincipalClaimOrRefundProjections',(SELECT count(*)::text FROM missing_redemption),
 'mismatchedPrincipalClaimOrRefundProjections',(SELECT count(*)::text FROM mismatched_redemption),
 'boundWalletsWithoutVerifiedAt',(SELECT count(*)::text FROM public.protocol_wallets WHERE user_id IS NOT NULL AND verified_at IS NULL),
 'orphanTradeProjections',(SELECT count(*)::text FROM public.protocol_trades t JOIN checkpoint c ON c.chain_id=t.chain_id JOIN public.protocol_transactions pt ON pt.chain_id=t.chain_id AND pt.tx_hash=t.tx_hash WHERE pt.block_number<=c.block_number AND c.block_number<=52813606 AND NOT EXISTS(SELECT 1 FROM scope e WHERE e.chain_id=t.chain_id AND e.tx_hash=t.tx_hash AND e.log_index=t.log_index AND e.event_name='TradeExecuted')),
 'launchAuthorized',false
) AS reconciliation_counts;
COMMIT;
