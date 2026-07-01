-- 047_semantic_dedup.sql
--
-- Adds semantic near-duplicate detection to prevent the pipeline from
-- re-promoting the same product under slightly different names.
--
-- Root causes addressed:
--   sku-185 "Thrilljoy PIC - The Lord Of The Rings Fan Expo 2026"
--   sku-397 "Thrilljoy PIX Lord of the Rings FanExpo Exclusive Blind Box"
--
--   sku-117 "RoboCop 3 - Ultra Deluxe with Jetpack"
--   sku-395 "NECA RoboCop Ultra Deluxe with Jetpack 7-inch"
--
-- Approach: brand-stripped token overlap fraction.
-- If ≥70% of the candidate's meaningful tokens (≥4 chars) appear anywhere
-- in an existing active SKU name (same category), the candidate is rejected
-- as a near-duplicate BEFORE a new SKU row is created.

-- ── Helper: strip leading brand prefix ───────────────────────────────────────
-- Order matters: longer prefixes before shorter to prevent partial matches.
create or replace function strip_sku_brand(name text)
returns text
language sql immutable
as $$
  select trim(
    regexp_replace(
      lower(name),
      '^(thrilljoy\s+pic|thrilljoy\s+pix|thrilljoy|hot\s+toys|pop\s+mart|hot\s+wheels|funko\s+pop|neca)\s+',
      '',
      'i'
    )
  )
$$;

-- ── Helper: token overlap fraction ───────────────────────────────────────────
-- Returns the fraction of cand_name's tokens that appear (as substrings)
-- in exist_name after brand stripping.  Only tokens of min_token_len+ are
-- considered.  Returns 0 when the candidate has no qualifying tokens.
create or replace function token_overlap_fraction(
  cand_name   text,
  exist_name  text,
  min_token_len int default 4
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

  -- Extract meaningful tokens from the candidate name
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

-- ── Updated promote_candidate_to_sku with Gate 2b ────────────────────────────
-- Full replacement of the function from migration 045.
-- Only change: Gate 2b inserted between Gate 2 and Gate 3.
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

  -- Gate 2: duplicate active SKU name (exact normalized match)
  if exists (
    select 1 from skus
    where normalize_sku_name(name) = cand_norm and is_active = true
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
  end if;

  -- Gate 2b: semantic near-duplicate for non-Funko, non-TCG categories.
  -- Funko is excluded because pop_number is the canonical dedup key.
  -- TCG is excluded because card names are highly structured (set + rarity).
  if c.category_id not in ('funko', 'tcg') then
    if exists (
      select 1 from skus s
      where s.category_id = c.category_id
        and s.is_active = true
        and token_overlap_fraction(c.name, s.name) >= 0.70
    ) then
      update discovery_candidates
      set status = 'rejected', reviewed_at = now()
      where id = candidate_id;
      return 'ERROR: semantic near-duplicate of existing SKU: ' || c.name;
    end if;
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

  -- Pull reusable fields from evidence_json
  narrative_v := nullif(trim(c.evidence_json->>'reasoning'), '');
  ebay_url_v  := nullif(trim(c.evidence_json->>'ebay_listing_url'), '');

  -- ── 1. Insert SKU ────────────────────────────────────────────────────────────
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
  insert into hot_index (sku_id, hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score)
  values (new_id, 0, 0, 'flat', 0, 0, 0, 0)
  on conflict (sku_id) do nothing;

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
