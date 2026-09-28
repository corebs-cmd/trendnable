-- 070_bundle_gate.sql
--
-- Adds Gate 0 to promote_candidate_to_sku: reject multi-item / bundle listings
-- before any other check runs.
--
-- Root cause: Tier 1 keyword filter in pipeline-utils.ts blocks most bundles
-- at the eBay pre-filter stage, but the same patterns weren't enforced at
-- promotion time. A listing Claude misclassifies (e.g. "Demon Slayer Collection
-- Multi-Figure [#1234]") could still be manually or auto-promoted.
--
-- Patterns mirror the Tier 1 additions in pipeline-utils.ts:
--   multi-figure, multi-pack, multi-item, multi-set
--   figure(s) set, set of N, pack of N, N-pack, N figures
--   collection (set|lot|pack|bundle)

create or replace function is_bundle_listing(name text)
returns boolean
language plpgsql immutable
as $$
begin
  return (
       name ~* '\ymulti[-\s]?figure\y'
    or name ~* '\ymulti[-\s]?pack\y'
    or name ~* '\ymulti[-\s]?item\y'
    or name ~* '\ymulti[-\s]?set\y'
    or name ~* '\yfigures?\s+set\y'
    or name ~* '\yset\s+of\s+[0-9]+\y'
    or name ~* '\ypack\s+of\s+[0-9]+\y'
    or name ~* '\y[0-9]+\s*[-\s]pack\y'
    or name ~* '\y[0-9]+\s+figures?\y'
    or name ~* '\ycollection\s+(set|lot|pack|bundle)\y'
  );
end;
$$;

-- Rebuild promote_candidate_to_sku with Gate 0 prepended.
-- All other gates (1–4b) are unchanged from migration 069.
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

  -- Gate 0: reject multi-item / bundle listings
  if is_bundle_listing(c.name) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: bundle/multi-item listing rejected: ' || c.name;
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

  -- Gate 2b: semantic near-duplicate (token overlap, min_token_len=3)
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

  -- Gate 4: duplicate Funko pop_number
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

  -- Gate 4b: autographed items — cross-category pop_number check
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

  -- 4. Seed hot_index stub
  insert into hot_index (sku_id, hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score)
  values (new_id, 0, 0, 'flat', 0, 0, 0, 0)
  on conflict (sku_id) do nothing;

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted -> ' || new_id || ' (' || c.name || ')';
end;
$$;
