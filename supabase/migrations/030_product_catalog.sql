-- 030_product_catalog.sql
-- Canonical product catalog — every distinct real-world collectible ever seen by
-- any pipeline.  Separate from operational skus/discovery_candidates tables.
-- Backed by a trigger that preserves price_first_seen / first_seen_at on upsert.

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

create table product_catalog (
  id               uuid          primary key default gen_random_uuid(),
  fingerprint      text          not null unique,   -- category-aware dedup key
  name             text          not null,
  short            text,
  category_id      text          not null,
  fandom_id        text,
  series           text,
  -- Funko-specific
  pop_number       integer,
  variant_type     text,          -- common | chase | exclusive | gitd | flocked | metallic | ...
  exclusive_type   text,          -- convention | retailer | vaulted | grail | htf | limited | ...
  edition_size     integer,
  -- TCG-specific
  card_set         text,
  card_number      text,
  card_rarity      text,
  card_variant     text,          -- raw | graded
  card_grader      text,
  card_grade       text,
  -- Pricing
  price_first_seen numeric(10,2),
  price_latest     numeric(10,2),
  price_updated_at timestamptz,
  -- Linkage
  ebay_query       text,
  sku_id           text           references skus(id) on delete set null,
  source           text,          -- discovery | funko | spotlight | manual | backfill
  -- Timestamps
  first_seen_at    timestamptz    not null default now(),
  last_seen_at     timestamptz    not null default now()
);

create index product_catalog_category_idx   on product_catalog(category_id);
create index product_catalog_fandom_idx     on product_catalog(fandom_id);
create index product_catalog_sku_id_idx     on product_catalog(sku_id);
create index product_catalog_pop_number_idx on product_catalog(pop_number)
  where pop_number is not null;

grant select on product_catalog to anon, authenticated;
grant all    on product_catalog to service_role;

-- ── Price history for catalog entries that are not yet SKUs ──────────────────

create table catalog_price_snapshots (
  id          uuid          primary key default gen_random_uuid(),
  catalog_id  uuid          not null references product_catalog(id) on delete cascade,
  price       numeric(10,2) not null,
  source      text,
  recorded_at timestamptz   not null default now()
);

create index catalog_price_snapshots_catalog_id_idx on catalog_price_snapshots(catalog_id);

grant select on catalog_price_snapshots to anon, authenticated;
grant all    on catalog_price_snapshots to service_role;

-- ── 2. Protect first_seen fields from being overwritten on upsert ─────────────

create or replace function protect_catalog_first_seen()
returns trigger language plpgsql as $$
begin
  NEW.first_seen_at    := OLD.first_seen_at;
  if OLD.price_first_seen is not null then
    NEW.price_first_seen := OLD.price_first_seen;
  end if;
  return NEW;
end;
$$;

create trigger protect_catalog_first_seen_trigger
before update on product_catalog
for each row execute function protect_catalog_first_seen();

-- ── 3. Fingerprint helper (mirrors catalogFingerprint in pipeline-utils.ts) ───

create or replace function catalog_fingerprint(
  p_category     text,
  p_name         text,
  p_pop_number   integer default null,
  p_variant_type text    default null,
  p_card_variant text    default null,
  p_card_grader  text    default null,
  p_card_grade   text    default null
) returns text language sql immutable as $$
  select case p_category
    when 'funko' then
      'funko-'
      || coalesce(p_pop_number::text, regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'))
      || '-' || coalesce(lower(p_variant_type), 'common')
    when 'tcg' then
      'tcg-'     || regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')
      || '-'     || coalesce(lower(p_card_variant), 'raw')
      || case when p_card_grader is not null then '-' || lower(p_card_grader) else '' end
      || case when p_card_grade  is not null then '-' || lower(p_card_grade)  else '' end
    else
      p_category || '-' || regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')
  end
$$;

-- ── 4. Backfill from active SKUs ──────────────────────────────────────────────

insert into product_catalog (
  fingerprint, name, short, category_id, fandom_id, series,
  pop_number, variant_type, exclusive_type,
  card_variant, card_grader, card_grade,
  ebay_query,
  price_first_seen, price_latest, price_updated_at,
  sku_id, source, first_seen_at, last_seen_at
)
select
  catalog_fingerprint(
    s.category_id, s.name, s.pop_number,
    case s.category_id
      when 'tcg'   then s.card_variant   -- 'raw' | 'graded' | null
      when 'funko' then
        case
          when s.exclusive_type in ('chase', 'gitd') then s.exclusive_type
          when s.exclusive_type is not null          then 'exclusive'
          else 'common'
        end
      else 'common'
    end,
    s.card_variant, s.card_grader, s.card_grade
  ),
  s.name,
  s.short,
  s.category_id,
  s.fandom_id,
  s.series,
  s.pop_number,
  case s.category_id
    when 'tcg'   then s.card_variant
    when 'funko' then
      case
        when s.exclusive_type in ('chase', 'gitd') then s.exclusive_type
        when s.exclusive_type is not null          then 'exclusive'
        else 'common'
      end
    else 'common'
  end,
  s.exclusive_type,
  s.card_variant, s.card_grader, s.card_grade,
  s.ebay_query,
  d.price_median,
  d.price_median,
  case when d.snapshot_date is not null
    then (d.snapshot_date::text || 'T00:00:00Z')::timestamptz
    else null
  end,
  s.id,
  'backfill',
  s.created_at,
  s.created_at
from skus s
left join lateral (
  select price_median, snapshot_date
  from daily_snapshots
  where sku_id = s.id
  order by snapshot_date desc
  limit 1
) d on true
where s.is_active = true
on conflict (fingerprint) do nothing;

-- For TCG: variant_type derives from card_variant (raw/graded), not exclusive_type.
-- Fix any TCG rows that got 'common' from the SKU backfill above.
UPDATE product_catalog
SET variant_type = CASE
  WHEN card_variant IS NOT NULL THEN card_variant
  ELSE NULL
END
WHERE category_id = 'tcg';

-- ── 5. Backfill from un-promoted candidates ───────────────────────────────────

insert into product_catalog (
  fingerprint, name, short, category_id, fandom_id, series,
  pop_number, variant_type, exclusive_type,
  card_variant, card_grader, card_grade,
  ebay_query,
  price_first_seen, price_latest, price_updated_at,
  source, first_seen_at, last_seen_at
)
select
  catalog_fingerprint(
    dc.category_id,
    dc.name,
    (regexp_match(dc.name, '\[#(\d+)\]'))[1]::integer,
    case
      when dc.evidence_json->>'exclusive_type' in ('chase', 'gitd') then dc.evidence_json->>'exclusive_type'
      when dc.evidence_json->>'exclusive_type' is not null           then 'exclusive'
      else 'common'
    end,
    dc.evidence_json->>'card_variant',
    dc.evidence_json->>'card_grader',
    dc.evidence_json->>'card_grade'
  ),
  dc.name,
  dc.evidence_json->>'short',
  dc.category_id,
  dc.fandom_id,
  dc.evidence_json->>'series',
  (regexp_match(dc.name, '\[#(\d+)\]'))[1]::integer,
  case
    when dc.evidence_json->>'exclusive_type' in ('chase', 'gitd') then dc.evidence_json->>'exclusive_type'
    when dc.evidence_json->>'exclusive_type' is not null           then 'exclusive'
    else 'common'
  end,
  dc.evidence_json->>'exclusive_type',
  dc.evidence_json->>'card_variant',
  dc.evidence_json->>'card_grader',
  dc.evidence_json->>'card_grade',
  coalesce(dc.evidence_json->>'ebay_query', dc.name),
  (dc.evidence_json->>'price_median')::numeric,
  (dc.evidence_json->>'price_median')::numeric,
  dc.created_at,
  'backfill',
  dc.created_at,
  dc.created_at
from discovery_candidates dc
where dc.status = 'new'
  and dc.category_id is not null
on conflict (fingerprint) do nothing;

-- ── 6. Update promote function to link catalog entry when SKU is created ───────

create or replace function promote_candidate_to_sku(candidate_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  c      discovery_candidates%rowtype;
  seq    int;
  new_id text;
  pop_num integer;
begin
  select * into c
  from discovery_candidates
  where id = candidate_id and status = 'new';

  if not found then
    return 'ERROR: candidate not found or not in new status';
  end if;

  -- Generate next sku-NNN id
  select count(*) + 1 into seq from skus;
  new_id := 'sku-' || lpad(seq::text, 3, '0');

  -- Avoid collision
  while exists (select 1 from skus where id = new_id) loop
    seq := seq + 1;
    new_id := 'sku-' || lpad(seq::text, 3, '0');
  end loop;

  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  insert into skus (id, name, short, series, category_id, fandom_id, ebay_query, pop_number, is_active)
  values (
    new_id,
    c.name,
    coalesce(c.evidence_json->>'short', left(c.name, 18)),
    coalesce(c.evidence_json->>'series', ''),
    c.category_id,
    c.fandom_id,
    coalesce(c.evidence_json->>'ebay_query', c.name),
    pop_num,
    true
  );

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  -- Link the catalog entry (if it already exists) to the new SKU
  update product_catalog
  set sku_id = new_id
  where lower(name) = lower(c.name)
    and sku_id is null;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
