-- 054_promote_funko_duplicate_gate.sql
--
-- Add Gate 4 to promote_candidate_to_sku to reject candidates with duplicate
-- Funko Pop numbers before attempting insertion. This prevents the unique
-- constraint violation that was causing 500 errors on spotlight confirm.

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
  narrative_v  text;
  ebay_url_v   text;
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

  -- Extract Funko Pop number early for duplicate checking
  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  -- Gate 4: duplicate Funko Pop number (Funkos only)
  if c.category_id = 'funko' and pop_num is not null then
    if exists (
      select 1 from skus
      where category_id = 'funko' and pop_number = pop_num and is_active = true
    ) then
      update discovery_candidates
      set status = 'rejected', reviewed_at = now()
      where id = candidate_id;
      return 'ERROR: duplicate Funko Pop #' || pop_num || ' already exists: ' || c.name;
    end if;
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

  -- Pull reusable fields from evidence_json
  narrative_v := nullif(trim(c.evidence_json->>'reasoning'), '');
  ebay_url_v  := nullif(trim(c.evidence_json->>'ebay_listing_url'), '');

  -- ── 1. Insert SKU (now includes ebay_url) ───────────────────────────────────
  insert into skus (id, name, short, series, category_id, fandom_id, ebay_query, ebay_url, pop_number, is_active)
  values (
    new_id,
    c.name,
    coalesce(c.evidence_json->>'short', left(c.name, 18)),
    coalesce(c.evidence_json->>'series', ''),
    c.category_id,
    c.fandom_id,
    coalesce(c.evidence_json->>'ebay_query', c.name),
    ebay_url_v,
    pop_num,
    true
  );

  -- ── 2. Seed narrative so "Why it's hot" shows immediately ───────────────────
  if narrative_v is not null then
    insert into sku_narratives (sku_id, narrative, model)
    values (new_id, narrative_v, 'promoted_from_candidate');
  end if;

  -- ── 3. Seed price snapshot so prices show immediately ───────────────────────
  insert into daily_snapshots (sku_id, snapshot_date, price_median)
  values (new_id, current_date, price_val)
  on conflict (sku_id, snapshot_date) do nothing;

  -- ── 4. Seed hot_index so SKU is visible in the app ──────────────────────────
  -- Scores start at zero; hot-pipeline will compute real values on next run.
  insert into hot_index (sku_id, hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score)
  values (new_id, 0, 0, 'flat', 0, 0, 0, 0)
  on conflict (sku_id) do nothing;

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
