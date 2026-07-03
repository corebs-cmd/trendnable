-- _validate_collection_pulse_queries.sql
--
-- Paste each block into the Supabase SQL editor to validate §4 scoring against
-- real data before wiring into the edge function.
-- Replace :uid with a real user_id that owns > 10 SKUs.
--
-- SCHEMA CORRECTIONS vs. the build spec (§5.7 — flagging changes to data contract):
--   hot_index.momentum uses 'up'|'down'|'flat', NOT 'rising'|'falling'|'cooling'.
--   - Spec §4b (standout):  h.momentum = 'rising'  → corrected to h.momentum = 'up'
--   - Spec §4d (declining): h.momentum in ('falling','cooling') → corrected to h.momentum = 'down'
--   This is a schema-level fact, not a threshold change — no data contract alteration.

-- ── Set your test user id here ────────────────────────────────────────────────
-- Replace the string below before running.
do $$ begin
  perform set_config('app.test_uid', 'YOUR_USER_UUID_HERE', true);
end $$;

-- ── 4a. Value-weighted heat score + aggregate delta ───────────────────────────
-- Expected output: one row with heat_score 0-100 and a signed delta_24h.
-- Sanity check: if user owns high-value hot items, heat_score should be high.
with latest as (
  select distinct on (sku_id) sku_id, price_median
  from daily_snapshots
  order by sku_id, snapshot_date desc
)
select
  round(
    coalesce(
      sum(h.hot_score * l.price_median * uc.qty)
        / nullif(sum(l.price_median * uc.qty), 0),
      0
    ),
    1
  )                                          as heat_score,
  round(
    coalesce(
      sum(h.delta_24h * l.price_median * uc.qty)
        / nullif(sum(l.price_median * uc.qty), 0),
      0
    ),
    1
  )                                          as delta_24h,
  round(sum(l.price_median * uc.qty), 2)    as total_value,
  count(*)                                   as sku_count
from user_collections uc
join hot_index h  on h.sku_id = uc.sku_id
join latest    l  on l.sku_id = uc.sku_id
where uc.user_id = current_setting('app.test_uid')::uuid
  and uc.sku_id is not null;


-- ── 4a continued — verdict band check ────────────────────────────────────────
-- Confirm the right verdict string is produced for the computed heat_score.
-- >= 65 → hot, 40-64 → warming, < 40 → cooling
with latest as (
  select distinct on (sku_id) sku_id, price_median
  from daily_snapshots
  order by sku_id, snapshot_date desc
),
heat as (
  select
    coalesce(
      sum(h.hot_score * l.price_median * uc.qty)
        / nullif(sum(l.price_median * uc.qty), 0),
      0
    ) as score
  from user_collections uc
  join hot_index h on h.sku_id = uc.sku_id
  join latest    l on l.sku_id = uc.sku_id
  where uc.user_id = current_setting('app.test_uid')::uuid
    and uc.sku_id is not null
)
select
  round(score, 1) as heat_score,
  case
    when score >= 65 then 'hot'
    when score >= 40 then 'warming'
    else                  'cooling'
  end as verdict
from heat;


-- ── 4b. Standout — highest rising item with >= 14 tracked days ────────────────
-- CORRECTION: h.momentum = 'up' (not 'rising' — see schema note at top of file)
-- Expected: 0 or 1 row. If null, summary should not name an item.
select
  uc.sku_id,
  s.name,
  s.image_url,
  h.hot_score,
  h.delta_24h,
  (select count(*) from daily_snapshots d where d.sku_id = uc.sku_id) as days_tracked
from user_collections uc
join hot_index h on h.sku_id = uc.sku_id
join skus      s on s.id     = uc.sku_id
where uc.user_id = current_setting('app.test_uid')::uuid
  and uc.sku_id is not null
  and h.momentum = 'up'                                -- corrected from 'rising'
  and (select count(*) from daily_snapshots d where d.sku_id = uc.sku_id) >= 14
order by h.hot_score desc, h.delta_24h desc
limit 1;


-- ── 4c. Sell signal — NEAR PEAK (with >= 14 snapshot floor) ──────────────────
-- Items that are hot (>= 80) and trading at >= 90% of their 90-day high.
-- urgency = price_median / peak_90d (0.90 to 1.00 range; higher = more urgent).
-- Minimum-history guard added per §5.6: only SKUs with >= 14 daily snapshots.
with latest as (
  select distinct on (sku_id) sku_id, price_median
  from daily_snapshots
  order by sku_id, snapshot_date desc
),
peak as (
  select sku_id, max(price_high) as peak_price
  from daily_snapshots
  where snapshot_date >= now() - interval '90 days'
  group by sku_id
),
snap_count as (
  select sku_id, count(*) as n
  from daily_snapshots
  group by sku_id
)
select
  uc.sku_id,
  s.name,
  l.price_median,
  p.peak_price                                       as peak_90d,
  round((l.price_median / nullif(p.peak_price, 0))::numeric, 3) as urgency,
  sc.n                                               as snapshot_count
from user_collections uc
join hot_index  h  on h.sku_id  = uc.sku_id
join latest     l  on l.sku_id  = uc.sku_id
join peak       p  on p.sku_id  = uc.sku_id
join skus       s  on s.id      = uc.sku_id
join snap_count sc on sc.sku_id = uc.sku_id
where uc.user_id = current_setting('app.test_uid')::uuid
  and uc.sku_id is not null
  and h.hot_score >= 80
  and l.price_median >= 0.90 * p.peak_price
  and sc.n >= 14                                     -- §5.6 history floor
order by urgency desc;


-- ── 4d. Sell signal — DECLINING (with >= 14 snapshot floor) ──────────────────
-- Items with down momentum whose current price is below 30-day average.
-- CORRECTION: h.momentum = 'down' (not 'falling','cooling' — see schema note)
-- urgency = (avg_30d - price_median) / avg_30d — how far below average (0→∞; normalize later)
with latest as (
  select distinct on (sku_id) sku_id, price_median
  from daily_snapshots
  order by sku_id, snapshot_date desc
),
avg30 as (
  select sku_id, avg(price_median) as avg_median
  from daily_snapshots
  where snapshot_date >= now() - interval '30 days'
  group by sku_id
),
snap_count as (
  select sku_id, count(*) as n
  from daily_snapshots
  group by sku_id
),
-- Down-days: consecutive days at or below the 30d avg (for narration facts)
down_days as (
  select ds.sku_id, count(*) as cnt
  from daily_snapshots ds
  join avg30 a on a.sku_id = ds.sku_id
  where ds.snapshot_date >= now() - interval '14 days'
    and ds.price_median < a.avg_median
  group by ds.sku_id
)
select
  uc.sku_id,
  s.name,
  l.price_median,
  round(a.avg_median::numeric, 2)                    as avg_30d,
  round(((a.avg_median - l.price_median) / nullif(a.avg_median, 0))::numeric, 4) as urgency,
  coalesce(dd.cnt, 0)                                as down_days,
  sc.n                                               as snapshot_count
from user_collections uc
join hot_index  h  on h.sku_id  = uc.sku_id
join latest     l  on l.sku_id  = uc.sku_id
join avg30      a  on a.sku_id  = uc.sku_id
join skus       s  on s.id      = uc.sku_id
join snap_count sc on sc.sku_id = uc.sku_id
left join down_days dd on dd.sku_id = uc.sku_id
where uc.user_id = current_setting('app.test_uid')::uuid
  and uc.sku_id is not null
  and h.momentum = 'down'                            -- corrected from 'falling','cooling'
  and l.price_median < a.avg_median
  and sc.n >= 14                                     -- §5.6 history floor
order by urgency desc;


-- ── 4e. flagged union + ranking ───────────────────────────────────────────────
-- Deduplicates across 4c and 4d (near_peak wins when both match).
-- Normalizes each rule's urgency within its group to 0-1.
-- Returns top 5 ranked by normalized urgency desc.
with latest as (
  select distinct on (sku_id) sku_id, price_median
  from daily_snapshots
  order by sku_id, snapshot_date desc
),
peak as (
  select sku_id, max(price_high) as peak_price
  from daily_snapshots
  where snapshot_date >= now() - interval '90 days'
  group by sku_id
),
avg30 as (
  select sku_id, avg(price_median) as avg_median
  from daily_snapshots
  where snapshot_date >= now() - interval '30 days'
  group by sku_id
),
snap_count as (
  select sku_id, count(*) as n
  from daily_snapshots
  group by sku_id
),
near_peak as (
  select
    uc.sku_id,
    'near_peak'::text                                             as reason,
    (l.price_median / nullif(p.peak_price, 0))                   as raw_urgency,
    l.price_median, p.peak_price as peak_90d, null::numeric      as avg_30d,
    0                                                            as down_days
  from user_collections uc
  join hot_index  h  on h.sku_id = uc.sku_id
  join latest     l  on l.sku_id = uc.sku_id
  join peak       p  on p.sku_id = uc.sku_id
  join snap_count sc on sc.sku_id = uc.sku_id
  where uc.user_id = current_setting('app.test_uid')::uuid
    and uc.sku_id is not null
    and h.hot_score >= 80
    and l.price_median >= 0.90 * p.peak_price
    and sc.n >= 14
),
declining as (
  select
    uc.sku_id,
    'declining'::text                                             as reason,
    ((a.avg_median - l.price_median) / nullif(a.avg_median, 0)) as raw_urgency,
    l.price_median, null::numeric as peak_90d, a.avg_median      as avg_30d,
    (select count(*) from daily_snapshots ds2
       join avg30 a2 on a2.sku_id = ds2.sku_id
       where ds2.sku_id = uc.sku_id
         and ds2.snapshot_date >= now() - interval '14 days'
         and ds2.price_median < a2.avg_median)                   as down_days
  from user_collections uc
  join hot_index  h  on h.sku_id = uc.sku_id
  join latest     l  on l.sku_id = uc.sku_id
  join avg30      a  on a.sku_id = uc.sku_id
  join snap_count sc on sc.sku_id = uc.sku_id
  where uc.user_id = current_setting('app.test_uid')::uuid
    and uc.sku_id is not null
    and h.momentum = 'down'
    and l.price_median < a.avg_median
    and sc.n >= 14
),
-- near_peak wins when both rules match the same sku
merged as (
  select * from near_peak
  union all
  select d.* from declining d
  where d.sku_id not in (select sku_id from near_peak)
),
-- Normalize urgency within each reason group to 0-1
normalized as (
  select
    m.*,
    case
      when max(m.raw_urgency) over (partition by m.reason)
         = min(m.raw_urgency) over (partition by m.reason)
      then 1.0
      else (m.raw_urgency - min(m.raw_urgency) over (partition by m.reason))
         / nullif(
             max(m.raw_urgency) over (partition by m.reason)
             - min(m.raw_urgency) over (partition by m.reason),
             0
           )
    end as urgency
  from merged m
)
select
  n.sku_id,
  s.name,
  s.image_url,
  n.reason,
  round(n.urgency::numeric, 4)            as urgency,
  round(n.price_median::numeric, 2)       as price_median,
  round(n.peak_90d::numeric, 2)           as peak_90d,
  round(n.avg_30d::numeric, 2)            as avg_30d,
  n.down_days::int                        as down_days
from normalized n
join skus s on s.id = n.sku_id
order by n.urgency desc
limit 5;


-- ── 4f. Momentum driver (§5.2) ────────────────────────────────────────────────
-- Positive momentum contribution = max(0, delta_24h) * price_median * qty.
-- §5.7: using max(0, delta_24h) rather than velocity_score — delta_24h is
-- directional (captures actual hot-score movement), velocity_score is non-negative
-- and would inflate all groups equally. If fandom_id coverage is sparse
-- (< 40% of owned SKUs have a fandom), group by category_id instead.
with latest as (
  select distinct on (sku_id) sku_id, price_median
  from daily_snapshots
  order by sku_id, snapshot_date desc
),
contributions as (
  select
    uc.sku_id,
    s.fandom_id,
    s.category_id,
    greatest(0, h.delta_24h::numeric) * l.price_median * uc.qty as pos_contrib
  from user_collections uc
  join hot_index h on h.sku_id = uc.sku_id
  join latest    l on l.sku_id = uc.sku_id
  join skus      s on s.id     = uc.sku_id
  where uc.user_id = current_setting('app.test_uid')::uuid
    and uc.sku_id is not null
),
total_positive as (
  select sum(pos_contrib) as total from contributions where pos_contrib > 0
),
-- Fandom grouping
fandom_groups as (
  select
    s.fandom_id                                  as group_key,
    f.label                                      as group_label,
    sum(c.pos_contrib)                           as group_contrib,
    count(distinct c.sku_id) filter (where c.fandom_id is not null) as fandom_covered
  from contributions c
  join skus s on s.id = c.sku_id
  left join fandoms f on f.id = s.fandom_id
  where c.fandom_id is not null
    and c.pos_contrib > 0
  group by s.fandom_id, f.label
),
-- Category grouping (fallback)
category_groups as (
  select
    s.category_id                                as group_key,
    cat.label                                    as group_label,
    sum(c.pos_contrib)                           as group_contrib
  from contributions c
  join skus       s   on s.id  = c.sku_id
  join categories cat on cat.id = s.category_id
  where c.pos_contrib > 0
  group by s.category_id, cat.label
),
-- Items with a fandom (for coverage check)
fandom_coverage as (
  select
    count(*) filter (where fandom_id is not null) as with_fandom,
    count(*)                                      as total
  from contributions
)
-- Show both groupings so we can decide which to use in the edge function
select
  'fandom' as dimension,
  fg.group_key,
  fg.group_label,
  round((fg.group_contrib / nullif(tp.total, 0) * 100)::numeric, 1) as share_pct,
  fg.group_contrib,
  tp.total as total_positive,
  fc.with_fandom::float / nullif(fc.total, 0)   as fandom_coverage_ratio
from fandom_groups fg
cross join total_positive tp
cross join fandom_coverage fc
union all
select
  'category',
  cg.group_key,
  cg.group_label,
  round((cg.group_contrib / nullif(tp.total, 0) * 100)::numeric, 1),
  cg.group_contrib,
  tp.total,
  null
from category_groups cg
cross join total_positive tp
order by dimension, group_contrib desc;
