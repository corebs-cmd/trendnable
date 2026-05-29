-- 035_rls_public_tables.sql
-- Enables RLS on all public catalog tables.
-- Read-only tables get a SELECT policy for anon + authenticated.
-- Pipeline-internal tables get RLS with no public policy (service_role bypasses RLS).

-- ── Read-only public catalog tables ──────────────────────────────────────────
-- These are intentionally readable by the app (anon key). No public writes.

alter table skus                    enable row level security;
alter table daily_snapshots         enable row level security;
alter table hot_index               enable row level security;
alter table sku_narratives          enable row level security;
alter table product_images          enable row level security;
alter table categories              enable row level security;
alter table fandoms                 enable row level security;
alter table marketplaces            enable row level security;
alter table marketplace_sku_mappings enable row level security;
alter table product_catalog         enable row level security;

-- Public SELECT policies
create policy "public read" on skus                     for select using (true);
create policy "public read" on daily_snapshots          for select using (true);
create policy "public read" on hot_index                for select using (true);
create policy "public read" on sku_narratives           for select using (true);
create policy "public read" on product_images           for select using (true);
create policy "public read" on categories               for select using (true);
create policy "public read" on fandoms                  for select using (true);
create policy "public read" on marketplaces             for select using (true);
create policy "public read" on marketplace_sku_mappings for select using (true);
create policy "public read" on product_catalog          for select using (true);

-- ── Pipeline-internal tables ──────────────────────────────────────────────────
-- No public access needed. Service_role (used by all edge functions) bypasses RLS.

alter table catalog_price_snapshots enable row level security;
alter table weekly_signals          enable row level security;
