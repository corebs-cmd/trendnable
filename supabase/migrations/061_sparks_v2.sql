-- Sparks v2 — §3 redeem table + ledger, §4 daily cap + watchlist bonus, §5 deferred consensus
-- All thresholds stored in app_config for post-launch tuning without a migration.

-- ── Expand reward_events with display labels ──────────────────────────────────
ALTER TABLE reward_events
  ADD COLUMN IF NOT EXISTS note     text,   -- human-readable ledger label
  ADD COLUMN IF NOT EXISTS sku_name text;   -- item name for context in ledger

-- ── Daily cap tracking ────────────────────────────────────────────────────────
-- Same date-stamped pattern as scan_count_day / scan_count_used.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sparks_earned_day   text,
  ADD COLUMN IF NOT EXISTS sparks_earned_today integer NOT NULL DEFAULT 0;

-- ── Watchlist bonus (temporary slot extension via sparks redeem) ───────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS watchlist_bonus_slots      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watchlist_bonus_expires_at timestamptz;

-- ── Spark redemptions ledger ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spark_rewards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type text        NOT NULL, -- 'export' | 'watchlist_slots' | 'feature_unlock' | 'badge' | 'free_month'
  cost        integer     NOT NULL,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,           -- for time-boxed rewards (watchlist_slots, feature_unlock)
  meta        jsonb        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_spark_rewards_user ON spark_rewards(user_id);

ALTER TABLE spark_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spark_rewards_own_row" ON spark_rewards
  FOR ALL USING (auth.uid() = user_id);

-- ── Deferred consensus queue ──────────────────────────────────────────────────
-- Holds submissions on thin SKUs (< N pipeline listings).
-- Resolved by the nightly resolve-consensus edge function.
CREATE TABLE IF NOT EXISTS deferred_consensus (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id      uuid        REFERENCES product_catalog(id) ON DELETE CASCADE,
  sku_id          text        REFERENCES skus(id) ON DELETE CASCADE,
  submitted_price numeric     NOT NULL,
  price_type      text        NOT NULL, -- 'ppg' | 'retail'
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL, -- submitted_at + 7 days
  resolved        boolean     NOT NULL DEFAULT false,
  awarded         boolean               -- null=pending, true=credited, false=expired
);

CREATE INDEX IF NOT EXISTS idx_deferred_consensus_sweep
  ON deferred_consensus(expires_at) WHERE resolved = false;

ALTER TABLE deferred_consensus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deferred_consensus_own_row" ON deferred_consensus
  FOR SELECT USING (auth.uid() = user_id);

-- ── App-level config (consensus thresholds + caps — tune without migrations) ───
CREATE TABLE IF NOT EXISTS app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO app_config(key, value) VALUES
  ('consensus_listing_threshold', '3'),   -- min pipeline listings to judge instantly
  ('consensus_match_band_pct',    '20'),  -- ±20% match band
  ('consensus_defer_days',        '7'),   -- days before deferred entry expires without bonus
  ('consensus_defer_min_samples', '3'),   -- min samples for deferred resolution
  ('sparks_daily_cap',            '15'),  -- max sparks earnable per calendar day
  ('sparks_sku_cooldown_hours',   '24')   -- hours before same SKU earns again
ON CONFLICT (key) DO NOTHING;
