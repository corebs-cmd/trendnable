-- Migration 024: multi-fandom support
-- Adds fandom_ids text[] so one SKU can belong to multiple fandoms.
-- fandom_id is kept as "primary fandom" (= fandom_ids[1]) for FK integrity.
-- The app and admin switch to fandom_ids for filtering/display.

alter table skus add column if not exists fandom_ids text[] not null default '{}';

-- Seed fandom_ids from existing fandom_id (only rows not yet populated)
update skus
set fandom_ids = ARRAY[fandom_id]
where fandom_id is not null
  and fandom_ids = '{}';

-- Rebuild view to expose fandom_ids
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

-- Update promote_candidate_to_sku to also set fandom_ids on new SKUs
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
begin
  select * into c
  from discovery_candidates
  where id = candidate_id and status = 'new';

  if not found then
    return 'ERROR: candidate not found or not in new status';
  end if;

  if exists (
    select 1 from skus
    where lower(name) = lower(c.name) and is_active = true
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
  end if;

  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  if c.category_id = 'funko' and pop_num is not null then
    if exists (
      select 1 from skus
      where pop_number = pop_num
        and category_id = 'funko'
        and is_active = true
    ) then
      update discovery_candidates
      set status = 'rejected', reviewed_at = now()
      where id = candidate_id;
      return 'ERROR: duplicate Pop number — active Funko SKU with #' || pop_num || ' already exists';
    end if;
  end if;

  if c.fandom_id is not null then
    select id into valid_fandom from fandoms where id = c.fandom_id;
    if valid_fandom is null then
      c.fandom_id := null;
    end if;
  end if;

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

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
