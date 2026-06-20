-- Migration 043: reward system — units, free-month redemption, and event log
--
-- Users earn reward_units by contributing community price data (see 042).
-- Accumulated units can be redeemed for a free premium month; the two
-- *_at timestamps track when the reward was claimed and when it expires.
--
-- reward_events is an append-only ledger of every unit-earning action so
-- the full history is auditable and duplicate submissions can be detected.

-- ── users table additions ─────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reward_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_reward_claimed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS premium_reward_expires_at timestamp with time zone;

-- ── reward_events table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reward_events (
  id          uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text                     NOT NULL,  -- 'ppg_price' | 'retail_price'
  units       integer                  NOT NULL,
  sku_id      uuid,
  catalog_id  uuid,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_events_user_id ON reward_events(user_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE reward_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events only
CREATE POLICY "reward_events_select_own"
  ON reward_events FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own events (service role bypasses this automatically)
CREATE POLICY "reward_events_insert_own"
  ON reward_events FOR INSERT
  WITH CHECK (user_id = auth.uid());
