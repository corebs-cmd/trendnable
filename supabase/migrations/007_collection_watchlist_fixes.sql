-- Migration 007: fix collection upsert + decouple watchlist from custom users table

-- 1. Add missing unique constraint so upsertCollectionItem ON CONFLICT works
alter table user_collections
  add constraint user_collections_user_sku_unique unique (user_id, sku_id);

-- 2. Decouple user_watchlists from custom users table so watch works
--    even before the user profile row is created.
--    Drop FK to custom users, add FK to auth.users instead.
alter table user_watchlists
  drop constraint if exists user_watchlists_user_id_fkey;

alter table user_watchlists
  add constraint user_watchlists_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
