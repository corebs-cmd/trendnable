-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron with schema extensions;

-- Schedule hot-pipeline to run daily at 18:00 UTC
select cron.schedule(
  'hot-pipeline-daily',
  '0 18 * * *',
  $$
    select net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/hot-pipeline',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Verify the cron job was created
select jobid, jobname, schedule, command from cron.job where jobname = 'hot-pipeline-daily';
