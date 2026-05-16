-- Migration 020: add missing fandoms + harden promote function
-- Adds dc, horror, gaming which are referenced in pipeline prompts but were missing.
-- promote_candidate_to_sku now nulls out any fandom_id not in the fandoms table
-- instead of failing with a foreign key violation.

insert into fandoms values
  ('dc',     'DC Comics'),
  ('horror', 'Horror'),
  ('gaming', 'Gaming')
on conflict (id) do nothing;

create or replace function promote_candidate_to_sku(candidate_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  c       discovery_candidates%rowtype;
  seq     int;
  new_id  text;
  pop_num integer;
  valid_fandom text;
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
    where lower(name) = lower(c.name) and is_active = true
  ) then
    update discovery_candidates
    set status = 'rejected', reviewed_at = now()
    where id = candidate_id;
    return 'ERROR: duplicate — active SKU already exists: ' || c.name;
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
