-- 025_price_alerts.sql
-- Price alert system: per-user watched-SKU alerts + in-app notifications

-- ── Price alerts ───────────────────────────────────────────────────────────────

create table if not exists price_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  sku_id       text not null references skus(id) on delete cascade,
  direction    text not null check (direction in ('above', 'below')),
  target_price numeric(10,2) not null,
  is_active    boolean not null default true,
  triggered_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ── In-app notifications ───────────────────────────────────────────────────────

create table if not exists in_app_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null default 'price_alert',
  sku_id     text references skus(id) on delete set null,
  title      text not null,
  body       text not null,
  metadata   jsonb not null default '{}',
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

create index if not exists idx_price_alerts_user_active
  on price_alerts (user_id)
  where is_active = true;

create index if not exists idx_price_alerts_sku_active
  on price_alerts (sku_id)
  where is_active = true;

create index if not exists idx_notifications_user_unread
  on in_app_notifications (user_id)
  where is_read = false;

create index if not exists idx_notifications_user_time
  on in_app_notifications (user_id, created_at desc);

-- ── Row-level security ─────────────────────────────────────────────────────────

alter table price_alerts enable row level security;
alter table in_app_notifications enable row level security;

drop policy if exists "users own price alerts" on price_alerts;
create policy "users own price alerts"
  on price_alerts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users own notifications" on in_app_notifications;
create policy "users own notifications"
  on in_app_notifications for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── pg_cron schedule ───────────────────────────────────────────────────────────
-- Run the price-alert-checker Edge Function every day at 6 PM UTC.
-- Requires pg_cron + pg_net extensions. Fill in your project URL and service
-- role key, or configure via the Supabase Dashboard → Database → Cron Jobs.
--
-- select cron.schedule(
--   'price-alert-checker-daily',
--   '0 18 * * *',
--   $$
--     select net.http_post(
--       url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/price-alert-checker',
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--       body    := '{}'::jsonb
--     );
--   $$
-- );
