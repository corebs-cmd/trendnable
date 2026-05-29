-- 034_price_guide.sql
-- Adds price_guide column to skus (Funko Price Guide value from funkypriceguide.com).
-- Rebuilds v_hot_skus so price_median uses reconciled price when guide data exists:
--   • Within $10 of guide  → use our market price as-is
--   • Outside $10          → weighted blend (65% market, 35% guide)
-- price_override still wins over everything.

-- ── 1. Add price_guide column ─────────────────────────────────────────────────

alter table skus add column if not exists price_guide numeric(10,2);
alter table skus add column if not exists price_guide_updated_at timestamptz;

-- ── 2. Reconciliation function ────────────────────────────────────────────────

create or replace function reconcile_price(market_price numeric, guide_price numeric)
returns numeric
language plpgsql immutable as $$
begin
  -- No guide data: trust market price entirely
  if guide_price is null or guide_price <= 0 then
    return market_price;
  end if;

  -- Within $10 range: market data is consistent with guide, use it as-is
  if abs(market_price - guide_price) <= 10 then
    return market_price;
  end if;

  -- Outside range: weighted blend favouring market (more recent, real sales)
  -- but anchored by guide to avoid extreme outliers
  return round((market_price * 0.65 + guide_price * 0.35)::numeric, 2);
end;
$$;

-- ── 3. Rebuild v_hot_skus with reconciled price ───────────────────────────────

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
  s.price_guide,
  s.price_guide_updated_at,
  h.hot_score,
  h.delta_24h,
  h.momentum,
  h.velocity_score,
  h.volume_score,
  h.confirmation_score,
  h.freshness_score,
  h.updated_at                                                        as scores_updated_at,
  d.listing_count,
  d.price_low,
  -- price_override wins; otherwise reconcile market vs guide (Funko only)
  coalesce(
    s.price_override,
    case
      when s.category_id = 'funko' then reconcile_price(d.price_median, s.price_guide)
      else d.price_median
    end
  )                                                                   as price_median,
  d.price_high,
  d.price_mint,
  d.price_mint_count,
  d.price_loose,
  d.price_loose_count,
  d.snapshot_date,
  n.narrative,
  coalesce(s.image_url, img.url)                                      as image_url,
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
