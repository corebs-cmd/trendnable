-- Schedule Pipeline Health Check at 10:00 UTC (after all other pipelines)

select cron.schedule(
  'pipeline-health-check-daily',
  '0 10 * * *',
  $$
    select net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/pipeline-health-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Verify the cron job was created
select jobid, jobname, schedule from cron.job where jobname = 'pipeline-health-check-daily';
