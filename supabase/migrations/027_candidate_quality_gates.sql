-- 027_candidate_quality_gates.sql
-- Trigger: block inserting a discovery_candidate whose name is on
-- the deleted_skus blocklist — prevents the pipeline from re-queuing
-- items that were deliberately removed by an admin.

create or replace function fn_check_candidate_blocklist()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from deleted_skus where lower(name) = lower(new.name)
  ) then
    raise exception
      'Candidate "%" is blocked: name exists on the deleted-SKU blocklist', new.name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_candidate_blocklist_check on discovery_candidates;
create trigger trg_candidate_blocklist_check
  before insert on discovery_candidates
  for each row execute function fn_check_candidate_blocklist();
