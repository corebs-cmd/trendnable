-- Contributor Badge — Sparks tier 250
-- §1: user_badges table for durable, extensible badge ownership
-- §2: replace claim_spark_reward with badge-aware version (atomic + idempotent)
-- §4: enable the 250 tier

-- ── Badge ownership table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key  text        NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_badges_own_row" ON user_badges
  FOR SELECT USING (auth.uid() = user_id);

-- ── Replace claim_spark_reward — adds badge idempotency for tier 250 ──────────
CREATE OR REPLACE FUNCTION claim_spark_reward(
  p_user_id     uuid,
  p_reward_type text,
  p_cost        integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled     text;
  v_new_balance integer;
  v_updated     integer;
  v_has_badge   boolean;
BEGIN
  -- Server-side gate for disabled tiers
  IF p_reward_type = 'feature_unlock' THEN
    SELECT value INTO v_enabled FROM app_config WHERE key = 'reward_tier_100_enabled';
    IF coalesce(v_enabled, 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This reward is not yet available');
    END IF;
  END IF;

  -- Badge tier: idempotency check before deducting
  IF p_reward_type = 'badge' THEN
    SELECT value INTO v_enabled FROM app_config WHERE key = 'reward_tier_250_enabled';
    IF coalesce(v_enabled, 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This reward is not yet available');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM user_badges
      WHERE user_id = p_user_id AND badge_key = 'contributor'
    ) INTO v_has_badge;

    IF v_has_badge THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_owned');
    END IF;
  END IF;

  -- Atomic decrement: only fires if balance >= cost right now
  UPDATE users
  SET reward_units = reward_units - p_cost
  WHERE id = p_user_id
    AND reward_units >= p_cost
  RETURNING reward_units INTO v_new_balance;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough sparks');
  END IF;

  -- Badge grant: same transaction as the deduction
  IF p_reward_type = 'badge' THEN
    INSERT INTO user_badges(user_id, badge_key)
    VALUES (p_user_id, 'contributor')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;

-- ── Enable tier 250 ───────────────────────────────────────────────────────────
UPDATE app_config SET value = 'true' WHERE key = 'reward_tier_250_enabled';
