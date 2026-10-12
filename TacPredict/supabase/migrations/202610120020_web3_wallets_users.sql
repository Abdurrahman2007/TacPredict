-- TacPredict Web3 wallet sync: users + wallets (Base Mainnet)
BEGIN;
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  chain_id integer not null default 8453,
  usdc_balance numeric(36, 6) not null default 0,
  total_trades integer not null default 0,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_wallet_address_unique unique (wallet_address),
  constraint users_wallet_address_lowercase check (wallet_address = lower(wallet_address))
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  address text not null,
  chain_id integer not null default 8453,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint wallets_address_unique unique (address),
  constraint wallets_address_lowercase check (address = lower(address))
);

create index if not exists users_last_active_idx on public.users (last_active desc);
create index if not exists wallets_user_id_idx on public.wallets (user_id);

alter table public.users enable row level security;
alter table public.wallets enable row level security;

drop policy if exists "users_select_anon" on public.users;
create policy "users_select_anon" on public.users for select to anon, authenticated using (true);
drop policy if exists "users_insert_anon" on public.users;
create policy "users_insert_anon" on public.users for insert to anon, authenticated
  with check (wallet_address = lower(wallet_address));
drop policy if exists "users_update_anon" on public.users;
create policy "users_update_anon" on public.users for update to anon, authenticated
  using (true) with check (wallet_address = lower(wallet_address));

drop policy if exists "wallets_select_anon" on public.wallets;
create policy "wallets_select_anon" on public.wallets for select to anon, authenticated using (true);
drop policy if exists "wallets_insert_anon" on public.wallets;
create policy "wallets_insert_anon" on public.wallets for insert to anon, authenticated
  with check (address = lower(address));
drop policy if exists "wallets_update_anon" on public.wallets;
create policy "wallets_update_anon" on public.wallets for update to anon, authenticated
  using (true) with check (address = lower(address));

grant select, insert, update on public.users to anon, authenticated;
grant select, insert, update on public.wallets to anon, authenticated;
COMMIT;
