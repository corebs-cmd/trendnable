-- 071_sku_deletion_tracking.sql
--
-- Adds reason-aware deletion tracking to deleted_skus.
-- Admin-only: no views, RLS, or columns exposed to the mobile app are touched.
--
-- New columns on deleted_skus:
--   blocked_reason  text  — permanent | temporary_30d | price_hold
--   expires_at      timestamptz — null = permanent; set = auto-unblocks at that time
--   duplicate_of_sku_id text   — for duplicate blocks: which SKU it duplicated
--
-- Behaviour by admin-selected reason:
--   low_quality   → blocked_reason='temporary_30d', expires_at = deleted_at + 30d
--   duplicate     → blocked_reason='permanent', duplicate_of_sku_id logged
--   bad_price     → blocked_reason='price_hold', permanent until manually cleared
--   all others    → blocked_reason='permanent', expires_at null
--
-- Gate 1 in promote_candidate_to_sku is updated to skip expired blocks.
-- The discovery-pipeline JS pre-filter is updated via the select below.
-- The auto-reject-candidates trigger skips temporary blocks that have expired.
--
-- SAFE: does not alter skus, hot_index, daily_snapshots, or any view used
-- by the mobile app. Only deleted_skus (admin-internal) and the pipeline
-- promotion function are changed.

-- ── 1. New columns ────────────────────────────────────────────────────────────

alter table deleted_skus
  add column if not exists blocked_reason       text,
  add column if not exists expires_at           timestamptz,
  add column if not exists duplicate_of_sku_id  text;

-- Back-fill existing rows: treat all as permanent
update deleted_skus
set blocked_reason = 'permanent'
where blocked_reason is null;

create index if not exists idx_deleted_skus_expires_at
  on deleted_skus (expires_at)
  where expires_at is not null;

-- ── 2. Update Gate 1 in promote_candidate_to_sku ─────────────────────────────
-- Only the Gate 1 check changes; every other gate is identical to migration 070.
-- This is a full replace (required for plpgsql function updates).

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

  -- Gate 1: deleted-SKU blocklist (normalized match, respects expiry)
  -- Temporary blocks (expires_at set) are ignored once they expire.
  if exists (
    select 1 from deleted_skus
    where normalized_name = cand_norm
      and (expires_at is null or expires_at > now())
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: blocked — name is on the deleted-SKU blocklist: ' || c.name;
  end if;

  -- Gate 2: exact normalized name match against active SKUs
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

  -- Extract pop number early
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

  -- Gate 4b: autographed cross-category pop_number check
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

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted -> ' || new_id || ' (' || c.name || ')';
end;
$$;

-- ── 3. Update auto-reject trigger to respect expiry ───────────────────────────
-- When a temporary block expires, open candidates for that name should not
-- be auto-rejected. Only reject for permanent or still-active blocks.

create or replace function trg_deleted_skus_reject_candidates()
returns trigger
language plpgsql
as $$
begin
  -- Only auto-reject candidates when this is a permanent or price_hold block.
  -- Temporary blocks (expires_at set) are time-limited; candidates can resurface
  -- naturally after expiry, so we don't hard-reject them now.
  if new.expires_at is null then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where status = 'new'
      and normalize_sku_name(name) = new.normalized_name;
  end if;
  return new;
end;
$$;
