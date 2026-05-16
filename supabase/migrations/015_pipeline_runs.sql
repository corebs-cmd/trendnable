-- Migration 015: pipeline_runs — tracks every pipeline execution with token usage and cost
create table if not exists pipeline_runs (
  id           uuid        default gen_random_uuid() primary key,
  pipeline     text        not null,               -- 'hot-pipeline' | 'discovery-pipeline'
  ran_at       timestamptz default now(),
  duration_ms  int         not null default 0,
  input_tokens int         not null default 0,
  output_tokens int        not null default 0,
  cost_usd     numeric(12, 8) not null default 0,  -- enough precision for sub-cent costs
  meta         jsonb       not null default '{}'   -- pipeline-specific stats
);

create index pipeline_runs_ran_at_idx on pipeline_runs (ran_at desc);
create index pipeline_runs_pipeline_idx on pipeline_runs (pipeline, ran_at desc);

grant select, insert on pipeline_runs to service_role;
grant select on pipeline_runs to authenticated;
