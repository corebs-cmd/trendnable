-- 044_blocklist_normalized_matching.sql
--
-- Problem: after an admin deletes a SKU, Claude sometimes generates a slightly
-- different name for the same product on the next pipeline run (e.g. punctuation,
-- brackets, extra words).  The old exact lower(name)=lower(c.name) check misses
-- these variations and the SKU gets re-created.
--
-- Fix 1: add a normalized_name column to deleted_skus and populate it via trigger.
--        Normalized = lowercase, strip all non-alphanumeric, collapse whitespace.
--
-- Fix 2: update promote_candidate_to_sku to check the normalized name so minor
--        variations in punctuation / spacing are still blocked.
--
-- Fix 3: when a SKU is deleted (tombstone inserted), automatically mark any open
--        discovery_candidates with a matching normalized name as 'rejected'.

-- ── 1. Normalize helper ───────────────────────────────────────────────────────

create or replace function normalize_sku_name(n text)
returns text
language sql
immutable strict
as $$
  select regexp_replace(lower(trim(n)), '[^a-z0-9 ]', '', 'g');
$$;

-- ── 2. Add normalized_name to deleted_skus ────────────────────────────────────

do $$ begin
  alter table deleted_skus add column normalized_name text;
exception when duplicate_column then null;
end $$;

-- Backfill existing rows
update deleted_skus
set normalized_name = normalize_sku_name(name)
where normalized_name is null;

create index if not exists idx_deleted_skus_normalized_name
  on deleted_skus (normalized_name);

-- ── 3. Trigger: auto-populate normalized_name on insert ───────────────────────

create or replace function trg_deleted_skus_normalize()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := normalize_sku_name(new.name);
  return new;
end;
$$;

drop trigger if exists deleted_skus_normalize_tgr on deleted_skus;
create trigger deleted_skus_normalize_tgr
  before insert or update of name on deleted_skus
  for each row execute function trg_deleted_skus_normalize();

-- ── 4. Trigger: auto-reject open candidates when tombstone is inserted ─────────
-- Immediately marks any discovery_candidates with a matching normalized name as
-- 'rejected' so stale 'new' rows can't be promoted later.

create or replace function trg_deleted_skus_reject_candidates()
returns trigger
language plpgsql
as $$
begin
  update discovery_candidates
  set status = 'rejected', reviewed_at = now()
  where status = 'new'
    and normalize_sku_name(name) = new.normalized_name;
  return new;
end;
$$;

drop trigger if exists deleted_skus_reject_candidates_tgr on deleted_skus;
create trigger deleted_skus_reject_candidates_tgr
  after insert on deleted_skus
  for each row execute function trg_deleted_skus_reject_candidates();

-- ── 5. Update promote_candidate_to_sku to use normalized matching ─────────────

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
  cand_norm    text;
begin
  select * into c
  from discovery_candidates
  where id = candidate_id and status = 'new';

  if not found then
    return 'ERROR: candidate not found or not in new status';
  end if;

  cand_norm := normalize_sku_name(c.name);

  -- Gate 1: name on the deleted-SKU blocklist (normalized match)
  if exists (
    select 1 from deleted_skus where normalized_name = cand_norm
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: blocked — name is on the deleted-SKU blocklist: ' || c.name;
  end if;

  -- Gate 2: duplicate active SKU name (normalized match)
  if exists (
    select 1 from skus
    where normalize_sku_name(name) = cand_norm and is_active = true
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
