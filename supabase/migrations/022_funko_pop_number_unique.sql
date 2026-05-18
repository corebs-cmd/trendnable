-- Migration 022: enforce one active SKU per Funko Pop number
-- Step 1: deactivate existing duplicates — for each pop_number keep the earliest SKU (lowest id).
-- Step 2: add the unique constraint so future duplicates are blocked at the DB level.
-- Step 3: update promote_candidate_to_sku to reject pop_number duplicates early.

-- Deactivate duplicate Funko SKUs — keep the earliest (lowest id) per pop_number
update skus
set is_active = false
where id in (
  select id from (
    select id,
           row_number() over (partition by pop_number order by id asc) as rn
    from skus
    where is_active = true
      and category_id = 'funko'
      and pop_number is not null
  ) ranked
  where rn > 1
);

-- Now safe to add the unique index
create unique index if not exists skus_funko_pop_number_unique
  on skus (pop_number)
  where is_active = true
    and category_id = 'funko'
    and pop_number is not null;

-- Update promote function to reject candidates whose Pop number is already tracked
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

  -- Extract Pop number early so we can check for numeric duplicates
  pop_num := (regexp_match(c.name, '\[#(\d+)\]'))[1]::integer;

  -- Reject if a Funko SKU with the same Pop number is already active
  if c.category_id = 'funko' and pop_num is not null then
    if exists (
      select 1 from skus
      where pop_number = pop_num
        and category_id = 'funko'
        and is_active = true
    ) then
      update discovery_candidates
      set status = 'rejected', reviewed_at = now()
      where id = candidate_id;
      return 'ERROR: duplicate Pop number — active Funko SKU with #' || pop_num || ' already exists';
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
