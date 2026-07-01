-- 046_price_alert_checker_cron.sql
--
-- Schedules the price-alert-checker Edge Function to run daily at 19:00 UTC,
-- one hour after the hot-pipeline + detect-insights + engagement-notifier window
-- (all recommended at 18:00 UTC). This ensures fresh prices are available before
-- alerts are evaluated.
--
-- Requires pg_cron + pg_net extensions (already enabled on Supabase Pro).
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with real values,
-- OR configure via Supabase Dashboard → Database → Cron Jobs.

select cron.schedule(
  'price-alert-checker-daily',
  '0 19 * * *',
  $$
    select net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/price-alert-checker',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
