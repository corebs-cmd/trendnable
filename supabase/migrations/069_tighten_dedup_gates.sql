-- 069_tighten_dedup_gates.sql
--
-- Tightens duplicate detection in promote_candidate_to_sku.
-- Root problems fixed:
--
--   A. Gate 2b (token overlap) excluded Funko and TCG entirely.
--      Funko relies only on pop_number; when [#NNN] is absent or the item
--      is category_id='autographed', nothing catches the duplicate.
--
--   B. token_overlap_fraction used min_token_len=4, excluding 3-char pop
--      numbers like "417" from matching — the most important signal for
--      signed Funko dedup.
--
--   C. Autographed Funko pops ([#NNN] in name) had no cross-category check
--      against the funko SKU table.
--
--   D. Gate 2b threshold was 0.70 — name variations (signer name
--      prepended/omitted, brand prefix differences) dropped below it.
--
--   E. TCG had zero semantic dedup beyond exact normalized name.
--
-- Changes:
--   1. token_overlap_fraction: lower min_token_len default 4 → 3 so pop
--      numbers are included in token matching.
--   2. Gate 2b threshold: 0.70 → 0.60 for all covered categories.
--   3. Gate 2b coverage: now includes Funko (threshold 0.75) and TCG (0.80).
--      Higher thresholds for those categories reduce false positives on
--      legitimately similar names (e.g. same character, different variant).
--   4. New Gate 4b: autographed items containing [#NNN] are checked across
--      BOTH funko and autographed categories for existing pop_number match.

-- ── 1. Update token_overlap_fraction: min_token_len default 4 → 3 ─────────────
create or replace function token_overlap_fraction(
  cand_name     text,
  exist_name    text,
  min_token_len int default 3
)
returns numeric
language plpgsql immutable
as $$
declare
  cand_stripped  text;
  exist_stripped text;
  tokens         text[];
  match_count    int := 0;
  tok            text;
begin
  cand_stripped  := regexp_replace(strip_sku_brand(cand_name),  '[^a-z0-9 ]', '', 'g');
  exist_stripped := regexp_replace(strip_sku_brand(exist_name), '[^a-z0-9 ]', '', 'g');

  tokens := array(
    select t
    from unnest(string_to_array(cand_stripped, ' ')) t
    where length(t) >= min_token_len
  );

  if array_length(tokens, 1) is null then
    return 0;
  end if;

  foreach tok in array tokens loop
    if position(tok in exist_stripped) > 0 then
      match_count := match_count + 1;
    end if;
  end loop;

  return match_count::numeric / array_length(tokens, 1)::numeric;
end;
$$;

-- ── 2. Rebuild promote_candidate_to_sku with tightened gates ─────────────────
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

  -- Gate 1: deleted-SKU blocklist (normalized match)
  if exists (
    select 1 from deleted_skus where normalized_name = cand_norm
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: blocked — name is on the deleted-SKU blocklist: ' || c.name;
  end if;

  -- Gate 2: exact normalized name match
  if exists (
    select 1 from skus
    where normalize_sku_name(name) = cand_norm and is_active = true
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
  end if;

  -- Gate 2b: semantic near-duplicate (token overlap).
  --
  -- Coverage and thresholds by category:
  --   funko       0.75  — high threshold; pop_number (Gate 4) is primary key;
  --                        overlap catches items where [#NNN] is missing/zero.
  --   tcg         0.80  — very high; card names are structured and legitimately
  --                        share many words (set name, Pokémon name, etc.).
  --   autographed 0.60  — standard; signer name variations are common.
  --   all others  0.60  — standard threshold.
  --
  -- min_token_len=3 so pop numbers (e.g. "417") count as tokens.
  declare
    overlap_threshold numeric;
  begin
    overlap_threshold := case c.category_id
      when 'funko' then 0.75
      when 'tcg'   then 0.80
      else              0.60
    end;

    if exists (
      select 1 from skus s
      where s.category_id = c.category_id
        and s.is_active = true
        and token_overlap_fraction(c.name, s.name, 3) >= overlap_threshold
    ) then
      update discovery_candidates
      set status = 'rejected', reviewed_at = now()
      where id = candidate_id;
      return 'ERROR: semantic near-duplicate of existing SKU: ' || c.name;
    end if;
  end;

  -- Gate 3: price floor ($5 minimum)
  price_val := (c.evidence_json->>'price_median')::numeric;
  if price_val is null or price_val < 5 then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: price too low (' || coalesce(price_val::text, 'null') || ') — minimum $5: ' || c.name;
  end if;

  -- Extract pop number early — used by Gate 4 and Gate 4b
  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  -- Gate 4: duplicate Funko pop_number (Funko category only)
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

  -- Gate 4b: autographed items with [#NNN] — cross-category pop_number check.
  -- An autographed Funko Pop #417 should be blocked if ANY active SKU in
  -- either funko or autographed already has that pop_number.
  if c.category_id = 'autographed' and pop_num is not null then
    if exists (
      select 1 from skus
      where category_id in ('funko', 'autographed')
        and pop_number = pop_num
        and is_active = true
    ) then
      update discovery_candidates
      set status = 'rejected', reviewed_at = now()
      where id = candidate_id;
      return 'ERROR: autographed duplicate — Pop #' || pop_num || ' already exists in funko/autographed: ' || c.name;
    end if;
  end if;

  -- Validate fandom
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

  narrative_v := nullif(trim(c.evidence_json->>'reasoning'), '');
  ebay_url_v  := nullif(trim(c.evidence_json->>'ebay_listing_url'), '');

  -- 1. Insert SKU
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

  -- 2. Seed narrative
  if narrative_v is not null then
    insert into sku_narratives (sku_id, narrative, model)
    values (new_id, narrative_v, 'promoted_from_candidate');
  end if;

  -- 3. Seed price snapshot
  insert into daily_snapshots (sku_id, snapshot_date, price_median)
  values (new_id, current_date, price_val)
  on conflict (sku_id, snapshot_date) do nothing;

  -- 4. Seed hot_index stub (scores computed on next pipeline run)
  insert into hot_index (sku_id, hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score)
  values (new_id, 0, 0, 'flat', 0, 0, 0, 0)
  on conflict (sku_id) do nothing;

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
