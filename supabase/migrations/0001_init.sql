-- Ziidi v2 (Supabase) schema

-- Each user's own buy transactions
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock text not null,
  amount numeric not null check (amount > 0),
  price numeric not null check (price > 0),
  shares numeric not null check (shares > 0),
  txn_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.investments enable row level security;

create policy "Users can view their own investments"
  on public.investments for select
  using (auth.uid() = user_id);

create policy "Users can insert their own investments"
  on public.investments for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own investments"
  on public.investments for delete
  using (auth.uid() = user_id);

-- Live NSE prices, shared across all users. Only the Edge Function
-- (using the service_role key, which bypasses RLS) writes here.
create table if not exists public.stock_prices (
  ticker text primary key,
  name text not null,
  price numeric not null,
  change numeric not null default 0,
  volume bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.stock_prices enable row level security;

create policy "Anyone signed in can read stock prices"
  on public.stock_prices for select
  using (auth.role() = 'authenticated');

-- Single-row table tracking the last scrape, used to throttle
-- manually-triggered refreshes.
create table if not exists public.scrape_status (
  id boolean primary key default true,
  last_run_at timestamptz,
  ticker_count int,
  constraint scrape_status_singleton check (id)
);

insert into public.scrape_status (id, last_run_at, ticker_count)
values (true, null, 0)
on conflict (id) do nothing;

alter table public.scrape_status enable row level security;

create policy "Anyone signed in can read scrape status"
  on public.scrape_status for select
  using (auth.role() = 'authenticated');

-- Enable realtime updates for the tables the frontend subscribes to
alter publication supabase_realtime add table public.stock_prices;
alter publication supabase_realtime add table public.investments;
