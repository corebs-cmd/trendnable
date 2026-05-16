-- Migration 019: prevent duplicate active SKUs by name
-- Partial unique index on lower(name) where is_active = true.
-- Inactive/deleted SKUs can share names (e.g. if re-added later).

create unique index if not exists skus_active_name_unique
  on skus (lower(name))
  where is_active = true;

-- Update promote function to reject duplicates before inserting
create or replace function promote_candidate_to_sku(candidate_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  c      discovery_candidates%rowtype;
  seq    int;
  new_id text;
  pop_num integer;
begin
  select * into c
  from discovery_candidates
  where id = candidate_id and status = 'new';

  if not found then
    return 'ERROR: candidate not found or not in new status';
  end if;

  -- Reject if an active SKU with the same name already exists
  if exists (
    select 1 from skus
    where lower(name) = lower(c.name)
      and is_active = true
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
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
