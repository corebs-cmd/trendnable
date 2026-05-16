-- Migration 011: TCG card variant classification
-- Trading Cards (category_id = 'tcg') must be tagged as either raw (ungraded) or
-- graded (professional grade by PSA, BGS, CGC, SGC, etc.).
-- Also updates promote_candidate_to_sku to carry variant fields through from evidence_json.

alter table skus
  add column if not exists card_variant text check (card_variant in ('raw', 'graded')),
  add column if not exists card_grader  text,
  add column if not exists card_grade   text;

comment on column skus.card_variant is 'Trading Cards only: raw (ungraded) or graded';
comment on column skus.card_grader  is 'Grading company — PSA, BGS, CGC, SGC, etc. (graded only)';
comment on column skus.card_grade   is 'Grade value — 10, 9.5, 9, etc. (graded only)';

create index if not exists idx_skus_tcg_variant on skus(category_id, card_variant)
  where category_id = 'tcg';

-- Update promote_candidate_to_sku to carry card variant fields through from evidence_json
create or replace function promote_candidate_to_sku(candidate_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  c   discovery_candidates%rowtype;
  seq int;
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

  -- Avoid collision if id already exists
  while exists (select 1 from skus where id = new_id) loop
    seq := seq + 1;
    new_id := 'sku-' || lpad(seq::text, 3, '0');
  end loop;

  insert into skus (
    id, name, short, series, category_id, fandom_id, ebay_query, is_active,
    card_variant, card_grader, card_grade
  )
  values (
    new_id,
    c.name,
    coalesce(c.evidence_json->>'short', left(c.name, 18)),
    coalesce(c.evidence_json->>'series', ''),
    c.category_id,
    c.fandom_id,
    coalesce(c.evidence_json->>'ebay_query', c.name),
    true,
    -- card variant fields — only populated for tcg category
    case when c.category_id = 'tcg' then c.evidence_json->>'card_variant' else null end,
    case when c.category_id = 'tcg' then c.evidence_json->>'card_grader'  else null end,
    case when c.category_id = 'tcg' then c.evidence_json->>'card_grade'   else null end
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
