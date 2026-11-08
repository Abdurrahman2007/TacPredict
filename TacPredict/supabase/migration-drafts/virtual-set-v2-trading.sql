-- TacPredict virtual set v2: on-chain trading tables (Base mainnet, virtual USDC).
-- Run once in the Supabase SQL editor. Safe to run again (everything is "if not exists").
-- Only the server (service role) reads or writes these tables. Nothing here is exposed to the browser.

begin;

-- One row per on-chain Up/Down window market (BTC, ETH, BNB, SOL x 5m, 15m).
-- `key` is the same id the page already uses for a window: reference-<asset>-<startMs>-<minutes>.
create table if not exists public.vset_markets (
  key             text primary key,
  asset           text        not null check (asset in ('bitcoin','ethereum','solana','bnb')),
  minutes         integer     not null check (minutes in (5, 15)),
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  open_at         timestamptz not null,
  market_id       bigint,
  create_tx       text,
  split_tx        text,
  inventory_ready boolean     not null default false,
  strike          double precision,
  end_price       double precision,
  outcome         smallint    check (outcome in (0, 1)),
  voided          boolean     not null default false,
  propose_tx      text,
  proposed_at     timestamptz,
  finalize_tx     text,
  resolved        boolean     not null default false,
  redeem_sent_at  timestamptz,
  redeemed        boolean     not null default false,
  failed          boolean     not null default false,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists vset_markets_window on public.vset_markets (asset, minutes, start_at);
create index if not exists vset_markets_open on public.vset_markets (resolved, end_at);
create unique index if not exists vset_markets_market_id on public.vset_markets (market_id) where market_id is not null;

-- Every instant buy or sell, read back from the Exchange contract (TradeExecuted events).
-- Amounts are raw 6-decimal units. `account` is the trader (never the market maker).
create table if not exists public.vset_fills (
  tx_hash      text        not null,
  log_index    integer     not null,
  market_id    bigint      not null,
  market_key   text,
  account      text        not null,
  side         text        not null check (side in ('buy', 'sell')),
  outcome      smallint    not null check (outcome in (0, 1)),
  price_ppm    bigint      not null,
  shares       bigint      not null,
  usdc         bigint      not null,
  block_number bigint      not null,
  created_at   timestamptz not null default now(),
  primary key (tx_hash, log_index)
);
create index if not exists vset_fills_account on public.vset_fills (account, created_at desc);
create index if not exists vset_fills_market on public.vset_fills (market_id);

-- One-time welcome boxes handed out on chain (the contract also enforces once per wallet).
create table if not exists public.vset_boxes (
  account    text primary key,
  amount     bigint      not null,
  tx_hash    text        not null,
  created_at timestamptz not null default now()
);

-- Which asset/duration pages people are looking at right now. The keeper only prepares markets for these,
-- so nothing is created (and no gas is spent) while nobody is trading.
create table if not exists public.vset_hot (
  asset   text        not null check (asset in ('bitcoin','ethereum','solana','bnb')),
  minutes integer     not null check (minutes in (5, 15)),
  seen_at timestamptz not null default now(),
  primary key (asset, minutes)
);

-- Single-row keeper state: a lock so two runs never send transactions at once, and the last block already indexed.
create table if not exists public.vset_keeper (
  id           integer primary key default 1 check (id = 1),
  locked_until timestamptz not null default 'epoch',
  scan_block   bigint,
  updated_at   timestamptz not null default now()
);
insert into public.vset_keeper (id) values (1) on conflict (id) do nothing;

-- Locked down: the browser (anon / signed-in users) gets nothing. The server uses the service role.
alter table public.vset_markets enable row level security;
alter table public.vset_fills   enable row level security;
alter table public.vset_hot     enable row level security;
alter table public.vset_boxes   enable row level security;
alter table public.vset_keeper  enable row level security;
revoke all on public.vset_markets, public.vset_fills, public.vset_hot, public.vset_keeper, public.vset_boxes from anon, authenticated;

commit;

-- ---------------------------------------------------------------------------------------------------------------
-- STEP 2 (separate run): call the keeper every minute from Supabase itself.
-- 1) Pick a long random string and use the SAME value here and as the Cloudflare secret VSET_KEEPER_TRIGGER_SECRET.
-- 2) Replace PUT_THE_SAME_RANDOM_SECRET_HERE below, then run this block.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'tacpredict-v2-keeper',
--   '* * * * *',
--   $$ select net.http_post(
--        url     := 'https://tacpredict.fun/api/v2/keeper',
--        headers := jsonb_build_object('Authorization', 'Bearer PUT_THE_SAME_RANDOM_SECRET_HERE', 'Content-Type', 'application/json'),
--        body    := '{}'::jsonb,
--        timeout_milliseconds := 55000
--      ); $$
-- );
--
-- To stop it later:  select cron.unschedule('tacpredict-v2-keeper');
