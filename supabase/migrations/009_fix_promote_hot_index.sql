-- Migration 009: fix promote_candidate_to_sku — insert a stub hot_index row
-- Without this, promoted SKUs are invisible in v_hot_skus (INNER JOIN with hot_index)
-- until the hot-pipeline runs. This seeds a minimal row so the SKU appears immediately.

create or replace function promote_candidate_to_sku(candidate_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  c      discovery_candidates%rowtype;
  seq    int;
  new_id text;
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

  while exists (select 1 from skus where id = new_id) loop
    seq := seq + 1;
    new_id := 'sku-' || lpad(seq::text, 3, '0');
  end loop;

  insert into skus (id, name, short, series, category_id, fandom_id, ebay_query, is_active)
  values (
    new_id,
    c.name,
    coalesce(c.evidence_json->>'short', left(c.name, 18)),
    coalesce(c.evidence_json->>'series', ''),
    c.category_id,
    c.fandom_id,
    coalesce(c.evidence_json->>'ebay_query', c.name),
    true
  );

  -- Seed a minimal hot_index row so the SKU appears in v_hot_skus immediately.
  -- The hot-pipeline will overwrite with real scores on its next run.
  insert into hot_index (sku_id, hot_score, delta_24h, momentum,
    velocity_score, volume_score, confirmation_score, freshness_score, updated_at)
  values (
    new_id, 1, 0, 'flat', 0, 0, 0, 15, now()
  )
  on conflict (sku_id) do nothing;

  update discovery_candidates
  set status = 'approved', reviewed_at = now()
  where id = candidate_id;

  return 'promoted → ' || new_id || ' (' || c.name || ')';
end;
$$;
