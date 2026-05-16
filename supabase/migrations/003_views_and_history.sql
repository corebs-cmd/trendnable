-- Migration 003: hot_score column, 14-day history seed, v_hot_skus view
-- Run after 002_seed_skus.sql

-- ── 1. Add hot_score to daily_snapshots ──────────────────────────────────────
alter table daily_snapshots add column if not exists hot_score int;

-- ── 2. Backfill today's rows with current hot_score ──────────────────────────
update daily_snapshots d
set hot_score = h.hot_score
from hot_index h
where d.sku_id = h.sku_id
  and d.hot_score is null;

-- ── 3. Seed 13 days of history per SKU (trending-up pattern) ─────────────────
-- Each day back: hot_score - n, listings - n*2, price slightly lower
insert into daily_snapshots (
  sku_id, snapshot_date, hot_score,
  listing_count, price_low, price_median, price_high,
  velocity_score
)
select
  d.sku_id,
  current_date - gs.n,
  greatest(1, d.hot_score - gs.n),
  greatest(1, d.listing_count - gs.n * 2),
  round(d.price_low    * (1.0 - gs.n * 0.004), 2),
  round(d.price_median * (1.0 - gs.n * 0.004), 2),
  round(d.price_high   * (1.0 - gs.n * 0.004), 2),
  greatest(0, h.velocity_score - gs.n / 3)
from daily_snapshots d
join hot_index h on h.sku_id = d.sku_id
cross join generate_series(1, 13) as gs(n)
where d.snapshot_date = current_date
on conflict (sku_id, snapshot_date) do nothing;

-- ── 4. Create v_hot_skus view ─────────────────────────────────────────────────
create or replace view v_hot_skus as
select
  s.id,
  s.name,
  s.short,
  s.series,
  s.category_id,
  s.fandom_id,
  s.created_at,
  h.hot_score,
  h.delta_24h,
  h.momentum,
  h.velocity_score,
  h.volume_score,
  h.confirmation_score,
  h.freshness_score,
  h.updated_at          as scores_updated_at,
  d.listing_count,
  d.price_low,
  d.price_median,
  d.price_high,
  d.snapshot_date,
  n.narrative
from skus s
join hot_index h on h.sku_id = s.id
left join daily_snapshots d
  on d.sku_id = s.id
  and d.snapshot_date = (
    select max(ds2.snapshot_date)
    from daily_snapshots ds2
    where ds2.sku_id = s.id
  )
left join lateral (
  select sn.narrative
  from sku_narratives sn
  where sn.sku_id = s.id
  order by sn.created_at desc
  limit 1
) n on true
where s.is_active = true;

-- ── 5. Grant read access to PostgREST roles ────────────────────────────────
grant select on v_hot_skus to anon, authenticated;
