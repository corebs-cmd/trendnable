-- Migration 017: add is_featured flag to skus
-- Only one SKU should have is_featured = true at a time (enforced by app/admin logic).
-- The app uses this to pin a specific SKU as the hero card on the home screen,
-- overriding the default hot-score sort order.

alter table skus add column if not exists is_featured boolean not null default false;

-- Rebuild view to expose is_featured
drop view if exists v_hot_skus;

create view v_hot_skus as
select
  s.id,
  s.name,
  s.short,
  s.series,
  s.category_id,
  s.fandom_id,
  s.created_at,
  s.card_variant,
  s.card_grader,
  s.card_grade,
  s.is_featured,
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
  n.narrative,
  coalesce(s.image_url, img.url) as image_url,
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
