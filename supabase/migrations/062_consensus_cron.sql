-- Nightly cron to sweep deferred_consensus entries — runs at 02:00 UTC daily
SELECT cron.schedule(
  'resolve-consensus-nightly',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url := 'https://wmuvigcdazjitzstxqvk.supabase.co/functions/v1/resolve-consensus',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdXZpZ2NkYXpqaXR6c3R4cXZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODgxNjE5OCwiZXhwIjoyMDk0MzkyMTk4fQ.Kq6yQ1gDWSkKsPZ9MEjpLEcitriqJ0SAnlNGgR-Y1gY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
