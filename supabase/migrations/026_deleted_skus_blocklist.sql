-- 026_deleted_skus_blocklist.sql
-- When an admin hard-deletes a SKU, record a tombstone here.
-- promote_candidate_to_sku() checks this table and blocks any
-- candidate whose name matches a deleted SKU.

-- ── Tombstone table ────────────────────────────────────────────────────────────

create table if not exists deleted_skus (
  id              uuid primary key default gen_random_uuid(),
  original_sku_id text        not null,
  name            text        not null,
  category_id     text,
  reason          text,         -- spam | bad_price | wrong_category | duplicate | low_quality | other
  deleted_at      timestamptz not null default now(),
  deleted_by      text          -- optional admin identifier
);

create index if not exists idx_deleted_skus_lower_name
  on deleted_skus (lower(name));

-- ── Updated promote_candidate_to_sku ──────────────────────────────────────────
-- New quality gates added:
--   1. Block if candidate name is on the deleted-SKU blocklist.
--   2. Block if price_median is null or below $5.

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
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: blocked — name is on the deleted-SKU blocklist: ' || c.name;
  end if;

  -- Gate 2: duplicate active SKU name
  if exists (
    select 1 from skus
    where lower(name) = lower(c.name) and is_active = true
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
  end if;

  -- Gate 3: price floor ($5 minimum)
  price_val := (c.evidence_json->>'price_median')::numeric;
  if price_val is null or price_val < 5 then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
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

  -- Extract Funko Pop number from name if present
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

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
