-- 072_deleted_sku_semantic_gate.sql
--
-- Root cause: items the admin explicitly deletes (low_quality / duplicate) keep
-- returning because Gate 1 only blocks EXACT normalized name matches against
-- deleted_skus. When eBay surfaces the same item under a slightly different title
-- (different word order, extra cert details, signer name moved) the exact match
-- misses it, and Gate 2b doesn't help because it only checks active SKUs —
-- deleted items are no longer in that table.
--
-- Fix: add Gate 1b immediately after Gate 1. It runs token_overlap_fraction
-- (min_token_len=3) against all non-expired deleted_skus rows. Threshold is
-- 0.55 — lower than Gate 2b on purpose, because items the admin has actively
-- rejected should be blocked more aggressively than unknown near-duplicates.
--
-- Example pairs that Gate 1 misses but Gate 1b blocks:
--   deleted: "Kellen Winslow HOF Goal Line Art SD Chargers SIGNED"
--   new:     "Kellen Winslow Signed SD Chargers HOF Beckett"  → ~71% overlap
--
--   deleted: "Ronald Acuña Jr. Atlanta Braves Pro Jersey SIGNED"
--   new:     "Ronald Acuna Jr Braves Signed Jersey JSA"       → ~71% overlap
--
-- SAFE: only touches promote_candidate_to_sku. No app-facing tables changed.

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
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: bundle/multi-item listing rejected: ' || c.name;
  end if;

  cand_norm := normalize_sku_name(c.name);

  -- Gate 1: exact normalized name match on deleted-SKU blocklist (respects expiry)
  if exists (
    select 1 from deleted_skus
    where normalized_name = cand_norm
      and (expires_at is null or expires_at > now())
  ) then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: blocked — name is on the deleted-SKU blocklist: ' || c.name;
  end if;

  -- Gate 1b: semantic near-duplicate of a deleted SKU.
  -- Threshold 0.55 — more aggressive than Gate 2b because these are items the
  -- admin has already explicitly rejected. min_token_len=3 so short tokens like
  -- player initials and numbers count.
  if exists (
    select 1 from deleted_skus d
    where (d.expires_at is null or d.expires_at > now())
      and token_overlap_fraction(c.name, d.name, 3) >= 0.55
  ) then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: semantic near-duplicate of a deleted SKU: ' || c.name;
  end if;

  -- Gate 2: exact normalized name match against active SKUs
  if exists (
    select 1 from skus
    where normalize_sku_name(name) = cand_norm and is_active = true
  ) then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
  end if;

  -- Gate 2b: semantic near-duplicate of an active SKU
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
      update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
      return 'ERROR: semantic near-duplicate of existing SKU: ' || c.name;
    end if;
  end;

  -- Gate 3: price floor ($5 minimum)
  price_val := (c.evidence_json->>'price_median')::numeric;
  if price_val is null or price_val < 5 then
    update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
    return 'ERROR: price too low (' || coalesce(price_val::text, 'null') || ') — minimum $5: ' || c.name;
  end if;

  -- Extract pop number
  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  -- Gate 4: duplicate Funko pop_number
  if c.category_id = 'funko' and pop_num is not null then
    if exists (
      select 1 from skus where category_id = 'funko' and pop_number = pop_num and is_active = true
    ) then
      update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
      return 'ERROR: duplicate Funko Pop #' || pop_num || ' already exists: ' || c.name;
    end if;
  end if;

  -- Gate 4b: autographed cross-category pop_number check
  if c.category_id = 'autographed' and pop_num is not null then
    if exists (
      select 1 from skus
      where category_id in ('funko', 'autographed') and pop_number = pop_num and is_active = true
    ) then
      update discovery_candidates set status = 'rejected', reviewed_at = now() where id = candidate_id;
      return 'ERROR: autographed duplicate — Pop #' || pop_num || ' already exists: ' || c.name;
    end if;
  end if;

  -- Validate fandom
  if c.fandom_id is not null then
    select id into valid_fandom from fandoms where id = c.fandom_id;
    if valid_fandom is null then c.fandom_id := null; end if;
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

  insert into skus (id, name, short, series, category_id, fandom_id, ebay_query, ebay_url, pop_number, is_active)
  values (
    new_id, c.name,
    coalesce(c.evidence_json->>'short', left(c.name, 18)),
    coalesce(c.evidence_json->>'series', ''),
    c.category_id, c.fandom_id,
    coalesce(c.evidence_json->>'ebay_query', c.name),
    ebay_url_v, pop_num, true
  );

  if narrative_v is not null then
    insert into sku_narratives (sku_id, narrative, model)
    values (new_id, narrative_v, 'promoted_from_candidate');
  end if;

  insert into daily_snapshots (sku_id, snapshot_date, price_median)
  values (new_id, current_date, price_val)
  on conflict (sku_id, snapshot_date) do nothing;

  insert into hot_index (sku_id, hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score)
  values (new_id, 0, 0, 'flat', 0, 0, 0, 0)
  on conflict (sku_id) do nothing;

  update discovery_candidates set status = 'approved', reviewed_at = now() where id = candidate_id;

  return 'promoted -> ' || new_id || ' (' || c.name || ')';
end;
$$;
