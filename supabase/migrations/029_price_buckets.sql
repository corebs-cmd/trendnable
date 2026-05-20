-- 029_price_buckets.sql
-- Adds mint/loose condition price buckets to daily_snapshots so the mobile app
-- can show condition breakdowns (U2) and accurate "recent sales" counts (U1).
-- Also adds exclusive_type to skus for variant badge chips (U4).

-- ── 1. daily_snapshots — price bucket columns ─────────────────────────────────

alter table daily_snapshots
  add column if not exists price_mint        numeric(10,2),
  add column if not exists price_mint_count  int,
  add column if not exists price_loose       numeric(10,2),
  add column if not exists price_loose_count int;

-- ── 2. skus — exclusive_type for variant badges ───────────────────────────────

alter table skus
  add column if not exists exclusive_type text;

-- Backfill from candidates that were promoted
update skus s
set exclusive_type = dc.evidence_json->>'exclusive_type'
from discovery_candidates dc
where lower(dc.name) = lower(s.name)
  and dc.evidence_json->>'exclusive_type' is not null
  and s.exclusive_type is null;

-- ── 3. Rebuild v_hot_skus to expose new columns ───────────────────────────────

drop view if exists v_hot_skus;

create view v_hot_skus as
select
  s.id,
  s.name,
  s.short,
  s.series,
  s.category_id,
  s.fandom_id,
  s.fandom_ids,
  s.created_at,
  s.card_variant,
  s.card_grader,
  s.card_grade,
  s.is_featured,
  s.force_featured_until,
  s.pop_number,
  s.exclusive_type,
  h.hot_score,
  h.delta_24h,
  h.momentum,
  h.velocity_score,
  h.volume_score,
  h.confirmation_score,
  h.freshness_score,
  h.updated_at                                            as scores_updated_at,
  d.listing_count,
  d.price_low,
  coalesce(s.price_override, d.price_median)              as price_median,
  d.price_high,
  d.price_mint,
  d.price_mint_count,
  d.price_loose,
  d.price_loose_count,
  d.snapshot_date,
  n.narrative,
  coalesce(s.image_url, img.url)                          as image_url,
  s.ebay_query,
  s.ebay_url,
  s.mercari_url,
  s.popnbeats_url
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
left join lateral (
  select pi.url
  from product_images pi
  where pi.sku_id = s.id
    and pi.is_canonical = true
  limit 1
) img on true
where s.is_active = true;

grant select on v_hot_skus to anon, authenticated;
