-- 049_collection_pulse_cron.sql
--
-- Schedules the collection-pulse edge function at 19:30 UTC daily
-- (after hot-pipeline ~18:00 and price-alert-checker 19:00).
--
-- Also creates the get_eligible_pulse_users() helper used by the
-- edge function's batch compute loop.
--
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY before running,
-- OR configure via Supabase Dashboard → Database → Cron Jobs.

-- Returns all users with > 10 tracked SKUs in their collection.
-- Used by the batch POST handler in the collection-pulse edge function.
create or replace function get_eligible_pulse_users()
returns table (user_id uuid, sku_count bigint)
language sql
security definer
as $$
  select user_id, count(distinct sku_id)::bigint as sku_count
  from user_collections
  where sku_id is not null
  group by user_id
  having count(distinct sku_id) > 10;
$$;

-- Schedule daily batch run
select cron.schedule(
  'collection-pulse-daily',
  '30 19 * * *',
  $$
    select net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/collection-pulse',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
