-- Trendnable Database Schema v1
-- Run in order: Supabase SQL Editor or migrations system

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Categories ──────────────────────────────────────────────────────────────
create table categories (
  id          text primary key,
  label       text not null,
  short       text not null,
  type        text not null check (type in ('figure','card','box','car')),
  created_at  timestamptz default now()
);

-- ── Fandoms ─────────────────────────────────────────────────────────────────
create table fandoms (
  id          text primary key,
  label       text not null,
  created_at  timestamptz default now()
);

-- ── SKUs ────────────────────────────────────────────────────────────────────
create table skus (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  short           text,
  series          text,
  category_id     text references categories(id),
  fandom_id       text references fandoms(id),
  ebay_query      text,
  manufacturer_url text,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_skus_category on skus(category_id);
create index idx_skus_fandom   on skus(fandom_id);

-- ── Product images ──────────────────────────────────────────────────────────
create table product_images (
  id          uuid primary key default gen_random_uuid(),
  sku_id      text references skus(id) on delete cascade,
  url         text not null,
  source      text not null check (source in ('manufacturer','ebay','manual')),
  is_canonical boolean default false,
  created_at  timestamptz default now()
);

create index idx_product_images_sku on product_images(sku_id);

-- ── Daily snapshots (pipeline output) ──────────────────────────────────────
create table daily_snapshots (
  id              uuid primary key default gen_random_uuid(),
  sku_id          text references skus(id) on delete cascade,
  snapshot_date   date not null,
  listing_count   int,
  price_low       numeric,
  price_median    numeric,
  price_high      numeric,
  velocity_score  int,
  created_at      timestamptz default now(),
  unique (sku_id, snapshot_date)
);

create index idx_snapshots_sku_date on daily_snapshots(sku_id, snapshot_date desc);

-- ── Weekly signals ──────────────────────────────────────────────────────────
create table weekly_signals (
  id              uuid primary key default gen_random_uuid(),
  sku_id          text references skus(id) on delete cascade,
  week_start      date not null,
  reddit_mentions int default 0,
  watch_count     int default 0,
  ebay_watchers   int default 0,
  created_at      timestamptz default now(),
  unique (sku_id, week_start)
);

-- ── LLM signals / narratives ────────────────────────────────────────────────
create table sku_narratives (
  id          uuid primary key default gen_random_uuid(),
  sku_id      text references skus(id) on delete cascade,
  narrative   text not null,
  model       text,
  created_at  timestamptz default now()
);

create index idx_narratives_sku on sku_narratives(sku_id, created_at desc);

-- ── Hot index (materialized view approximation) ─────────────────────────────
create table hot_index (
  sku_id          text primary key references skus(id) on delete cascade,
  hot_score       int not null default 0,
  delta_24h       int not null default 0,
  momentum        text check (momentum in ('up','down','flat')),
  velocity_score  int default 0,
  volume_score    int default 0,
  confirmation_score int default 0,
  freshness_score int default 0,
  updated_at      timestamptz default now()
);

-- ── Marketplaces ─────────────────────────────────────────────────────────────
create table marketplaces (
  id          text primary key,
  name        text not null,
  url_template text
);

create table marketplace_sku_mappings (
  id              uuid primary key default gen_random_uuid(),
  sku_id          text references skus(id) on delete cascade,
  marketplace_id  text references marketplaces(id),
  listing_url     text,
  current_price   numeric,
  listing_count   int,
  updated_at      timestamptz default now(),
  unique (sku_id, marketplace_id)
);

-- ── Users ────────────────────────────────────────────────────────────────────
create table users (
  id                        uuid primary key references auth.users(id) on delete cascade,
  email                     text,
  name                      text,
  avatar_url                text,
  is_premium                boolean default false,
  premium_expires_at        timestamptz,
  followed_fandoms          text[] default '{}',
  followed_categories       text[] default '{}',
  notification_digest_enabled boolean default true,
  notification_digest_time  text default '08:00',
  public_profile_enabled    boolean default false,
  push_token                text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

alter table users enable row level security;
create policy "users_own_row" on users
  for all using (auth.uid() = id);

-- ── User subscriptions ───────────────────────────────────────────────────────
create table user_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references users(id) on delete cascade,
  plan                  text check (plan in ('monthly','annual')),
  status                text check (status in ('active','cancelled','expired')),
  revenuecat_id         text,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  created_at            timestamptz default now()
);

alter table user_subscriptions enable row level security;
create policy "subscriptions_own_row" on user_subscriptions
  for all using (auth.uid() = user_id);

-- ── User watchlists ──────────────────────────────────────────────────────────
create table user_watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  sku_id      text references skus(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (user_id, sku_id)
);

alter table user_watchlists enable row level security;
create policy "watchlist_own_row" on user_watchlists
  for all using (auth.uid() = user_id);

-- ── User collections ─────────────────────────────────────────────────────────
create table user_collections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  sku_id          text references skus(id) on delete cascade,
  qty             int not null default 1 check (qty > 0),
  purchased_price numeric not null,
  purchase_date   date,
  condition       text,
  notes           text,
  for_sale        boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table user_collections enable row level security;
create policy "collections_own_row" on user_collections
  for all using (auth.uid() = user_id);

create index idx_collections_user on user_collections(user_id);

-- ── User collection summary (denormalized for performance) ──────────────────
create table user_collection_summary (
  user_id         uuid primary key references users(id) on delete cascade,
  total_items     int default 0,
  total_skus      int default 0,
  total_cost      numeric default 0,
  estimated_value numeric default 0,
  updated_at      timestamptz default now()
);

alter table user_collection_summary enable row level security;
create policy "summary_own_row" on user_collection_summary
  for all using (auth.uid() = user_id);

-- ── User profile links (external stores) ────────────────────────────────────
create table user_profile_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  platform    text not null,  -- 'ebay','whatnot','mercari',etc.
  url         text not null,
  created_at  timestamptz default now()
);

alter table user_profile_links enable row level security;
create policy "profile_links_own_row" on user_profile_links
  for all using (auth.uid() = user_id);

-- ── User submissions ─────────────────────────────────────────────────────────
create table user_submissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete set null,
  submitted_name  text not null,
  category_id     text,
  fandom_id       text,
  description     text,
  ebay_url        text,
  status          text default 'pending' check (status in ('pending','approved','rejected','duplicate')),
  reviewed_at     timestamptz,
  created_at      timestamptz default now()
);

alter table user_submissions enable row level security;
create policy "submissions_own_row_insert" on user_submissions
  for insert with check (auth.uid() = user_id);
create policy "submissions_own_row_select" on user_submissions
  for select using (auth.uid() = user_id);

-- ── Discovery candidates (pipeline output) ──────────────────────────────────
create table discovery_candidates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category_id     text,
  fandom_id       text,
  evidence_json   jsonb,
  ebay_count      int,
  reddit_mentions int,
  status          text default 'new' check (status in ('new','approved','rejected','duplicate')),
  reviewed_at     timestamptz,
  created_at      timestamptz default now()
);

-- ── Seed data ────────────────────────────────────────────────────────────────
insert into categories values
  ('funko',   'Funko Pop',     'Funko',   'figure'),
  ('tcg',     'Trading Cards', 'TCG',     'card'),
  ('popmart', 'Pop Mart',      'PopMart', 'box'),
  ('hottoys', 'Hot Toys',      'HotToys', 'figure'),
  ('neca',    'NECA',          'NECA',    'figure'),
  ('hwheels', 'Hot Wheels',    'HWheels', 'car');

insert into fandoms values
  ('onepiece',  'One Piece'),
  ('demon',     'Demon Slayer'),
  ('starwars',  'Star Wars'),
  ('pokemon',   'Pokémon'),
  ('marvel',    'Marvel'),
  ('mha',       'My Hero Academia'),
  ('stranger',  'Stranger Things'),
  ('labubu',    'Labubu'),
  ('disney',    'Disney'),
  ('jjk',       'Jujutsu Kaisen');

insert into marketplaces values
  ('ebay',      'eBay',      'https://www.ebay.com/sch/i.html?_nkw={{query}}'),
  ('popnbeats', 'PopnBeats', 'https://popnbeats.com/search?q={{query}}'),
  ('mercari',   'Mercari',   'https://www.mercari.com/search/?keyword={{query}}');
