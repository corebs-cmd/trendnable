-- Migration 040: engagement notifications (movers + insight flips)
--
-- Adds per-user notification preferences and a notification_history table
-- used by the engagement-notifier edge function for dedup + daily-cap enforcement.
--
-- Defaults are opt-in (true). Users can disable per-type via Settings.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_movers   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_insights boolean NOT NULL DEFAULT true;

-- Tracks every push we send so we can dedupe (same sku+type within window)
-- and enforce a daily cap. Also useful for analytics.
CREATE TABLE IF NOT EXISTS notification_history (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku_id     text        REFERENCES skus(id) ON DELETE CASCADE,
  -- 'mover' | 'insight_flip' | 'price_alert' | future types
  type       text        NOT NULL,
  -- For insight_flip we store direction so we can re-notify when it actually changes
  -- (e.g. allow same SKU to fire again if it goes rising → falling later).
  variant    text,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Hot path: "did we send this user a push for this sku+type recently?"
CREATE INDEX IF NOT EXISTS nh_user_sku_type_sent_idx
  ON notification_history (user_id, sku_id, type, sent_at DESC);

-- Hot path: "how many pushes has this user gotten today?"
CREATE INDEX IF NOT EXISTS nh_user_sent_idx
  ON notification_history (user_id, sent_at DESC);

-- RLS: writes are service-role only (edge function bypasses RLS).
-- We allow users to SELECT their own history so the app can show it later
-- if we ever build a "notification log" view; no insert/update/delete from clients.
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification history"
  ON notification_history
  FOR SELECT
  USING (auth.uid() = user_id);
