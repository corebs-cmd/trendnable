-- Pipeline Health Check Monitoring
-- Daily validation of all pipelines: did they run? did they produce data?

create table if not exists pipeline_health_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamp with time zone not null default now(),
  check_date date not null,

  -- Overall status
  all_healthy boolean not null,

  -- Individual pipeline results (JSON for flexibility)
  results jsonb not null, -- array of { name, ran, expected_time, actual_time, processed, status, message }

  -- Summary stats
  total_pipelines int not null,
  healthy_pipelines int not null,
  failed_pipelines int not null,

  -- Full details for debugging
  details text,

  created_at timestamp with time zone not null default now()
);

-- Index on check_date for quick lookups
create index idx_pipeline_health_checks_date on pipeline_health_checks(check_date desc);

-- Example results structure (stored as JSONB):
-- results: [
--   {
--     name: "hot-pipeline",
--     ran: true,
--     expected_time: "2026-07-12T07:00:00Z",
--     actual_time: "2026-07-12T07:02:15Z",
--     processed: 318,
--     duration_ms: 48971,
--     status: "healthy",
--     message: "Processed 318 SKUs in 48.9s"
--   },
--   {
--     name: "discovery-pipeline",
--     ran: false,
--     expected_time: "2026-07-12T05:00:00Z",
--     actual_time: null,
--     processed: 0,
--     duration_ms: null,
--     status: "missing",
--     message: "Pipeline did not run at scheduled time"
--   }
-- ]
