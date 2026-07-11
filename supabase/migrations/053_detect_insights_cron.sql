-- Schedule detect-insights to run daily at 08:00 UTC
-- Runs 1 hour after hot-pipeline so fresh snapshots are available

select cron.schedule(
  'detect-insights-daily',
  '0 8 * * *',
  $$
    select net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/detect-insights',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Verify the cron job was created
select jobid, jobname, schedule, command from cron.job where jobname = 'detect-insights-daily';
