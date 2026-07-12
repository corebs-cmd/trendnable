-- Schedule discovery, autographed, sold, and detect-insights pipelines
-- These run sequentially after hot-pipeline to ensure fresh data at each stage

-- Discovery Pipeline at 05:00 UTC
-- Processes candidates from funko-pipeline, auto-promotes trackable SKUs
select cron.schedule(
  'discovery-pipeline-daily',
  '0 5 * * *',
  $$
    select net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/discovery-pipeline',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Autographed Pipeline at 05:30 UTC
-- Discovers signed & autographed collectibles
select cron.schedule(
  'autographed-pipeline-daily',
  '30 5 * * *',
  $$
    select net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/autographed-pipeline',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Sold Pipeline at 08:30 UTC
-- Enriches daily_snapshots with real sold price data
select cron.schedule(
  'sold-pipeline-daily',
  '30 8 * * *',
  $$
    select net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/sold-pipeline',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{"new_only": true}'::jsonb
    ) as request_id;
  $$
);

-- Detect Insights at 09:00 UTC
-- Evaluates active SKUs against detection rules, generates insights
select cron.schedule(
  'detect-insights-daily',
  '0 9 * * *',
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

-- Verify all cron jobs
select jobid, jobname, schedule from cron.job
where jobname in ('discovery-pipeline-daily', 'autographed-pipeline-daily', 'sold-pipeline-daily', 'detect-insights-daily')
order by schedule;
