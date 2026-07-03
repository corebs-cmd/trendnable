-- 048_collection_insights.sql
--
-- Stores the daily Collection Pulse result per user.
-- Free fields live as columns (cheap single-row read).
-- Premium content (flagged full objects + demand breakdown) lives in `payload`
-- so the API can drop it in one branch without leaking premium fields to free users.
--
-- Eligibility gate: sku_count > 10 (stored so the API avoids a count query).
-- Populated by the `collection-pulse` edge function (runs daily at 19:30 UTC,
-- after hot-pipeline).

create table collection_insights (
  user_id       uuid primary key references users(id) on delete cascade,
  heat_score    numeric    not null default 0,
  verdict       text       not null default 'cooling'
                           check (verdict in ('hot', 'warming', 'cooling')),
  delta_24h     numeric    not null default 0,
  summary       text,                    -- Haiku, 1-2 sentences [FREE]
  standout      jsonb,                   -- { sku_id, name, image_url, hot_score, delta_24h } [FREE]
  flagged_count int        not null default 0,  -- distinct union of both sell rules [FREE]
  payload       jsonb,                   -- { flagged: [...], demand: { hottest, coolest } } [PREMIUM]
  sku_count     int        not null default 0,  -- cached for eligibility check
  generated_at  timestamptz not null default now()
);

alter table collection_insights enable row level security;

-- Users can only read their own row; writes are service-role only (edge function).
create policy "own insights"
  on collection_insights
  for select
  using (auth.uid() = user_id);

-- Index for the edge function's batch query (iterating eligible users).
create index idx_collection_insights_sku_count
  on collection_insights(sku_count)
  where sku_count > 10;
