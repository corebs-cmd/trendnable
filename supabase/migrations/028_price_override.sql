-- 028_price_override.sql
-- Adds price_override to skus so admins can pin a price independently of
-- the pipeline. Mobile view uses COALESCE(price_override, pipeline price).
-- Also fixes promote_candidate_to_sku (026 accidentally dropped pop-number
-- dedup and fandom_ids that 024 had introduced).

-- ── 1. Add price_override column ──────────────────────────────────────────────

alter table skus add column if not exists price_override numeric(10,2);

-- ── 2. Rebuild v_hot_skus with price_override support ────────────────────────

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

-- ── 3. Fix promote_candidate_to_sku ──────────────────────────────────────────
-- Merges all gates from 024 (pop-number dedup, fandom_ids insert) and
-- 026 (deleted-SKU blocklist, price floor) into a single authoritative version.

create or replace function promote_candidate_to_sku(candidate_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  c            discovery_candidates%rowtype;
  seq          int;
  new_id       text;
  pop_num      integer;
  valid_fandom text;
  price_val    numeric;
begin
  select * into c
  from discovery_candidates
  where id = candidate_id and status = 'new';

  if not found then
    return 'ERROR: candidate not found or not in new status';
  end if;

  -- Gate 1: name on the deleted-SKU blocklist
  if exists (
    select 1 from deleted_skus where lower(name) = lower(c.name)
  ) then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: blocked — name is on the deleted-SKU blocklist: ' || c.name;
  end if;

  -- Gate 2: duplicate active SKU name
  if exists (
    select 1 from skus where lower(name) = lower(c.name) and is_active = true
  ) then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
  end if;

  -- Extract pop number early (needed for gate 3)
  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  -- Gate 3: duplicate Funko pop number
  if c.category_id = 'funko' and pop_num is not null then
    if exists (
      select 1 from skus where pop_number = pop_num and category_id = 'funko' and is_active = true
    ) then
      update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
      return 'ERROR: duplicate Pop number — active Funko SKU with #' || pop_num || ' already exists';
    end if;
  end if;

  -- Gate 4: price floor ($5 minimum)
  price_val := (c.evidence_json->>'price_median')::numeric;
  if price_val is null or price_val < 5 then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: price too low (' || coalesce(price_val::text, 'null') || ') — minimum $5: ' || c.name;
  end if;

  -- Null out fandom_id if it doesn't exist in fandoms table
  if c.fandom_id is not null then
    select id into valid_fandom from fandoms where id = c.fandom_id;
    if valid_fandom is null then
      c.fandom_id := null;
    end if;
  end if;

  -- Generate next sku-NNN id
  select count(*) + 1 into seq from skus;
  new_id := 'sku-' || lpad(seq::text, 3, '0');
  while exists (select 1 from skus where id = new_id) loop
    seq := seq + 1;
    new_id := 'sku-' || lpad(seq::text, 3, '0');
  end loop;

  insert into skus (id, name, short, series, category_id, fandom_id, fandom_ids, ebay_query, pop_number, is_active)
  values (
    new_id,
    c.name,
    coalesce(c.evidence_json->>'short', left(c.name, 18)),
    coalesce(c.evidence_json->>'series', ''),
    c.category_id,
    c.fandom_id,
    case when c.fandom_id is not null then ARRAY[c.fandom_id] else ARRAY[]::text[] end,
    coalesce(c.evidence_json->>'ebay_query', c.name),
    pop_num,
    true
  );

  update discovery_candidates set status = 'approved', reviewed_at = now() where id = candidate_id;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
