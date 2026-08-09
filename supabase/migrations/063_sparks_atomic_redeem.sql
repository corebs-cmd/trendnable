-- Sparks punch list fixes:
-- 1. Disable unbuilt reward tiers (100 feature_unlock, 250 badge) via app_config
-- 4. Atomic redemption — single SQL UPDATE prevents double-spend

-- Disable the two tiers whose effects aren't built yet
INSERT INTO app_config(key, value) VALUES
  ('reward_tier_100_enabled', 'false'),
  ('reward_tier_250_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Atomic claim function: checks enabled, decrements balance in one UPDATE.
-- Returns {ok, error, new_balance}.
-- Called from client via supabase.rpc('claim_spark_reward', ...).
-- SECURITY DEFINER so it can read app_config and write users regardless of RLS.
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
BEGIN
  -- Server-side gate for disabled tiers
  IF p_reward_type = 'feature_unlock' THEN
    SELECT value INTO v_enabled FROM app_config WHERE key = 'reward_tier_100_enabled';
    IF coalesce(v_enabled, 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This reward is not yet available');
    END IF;
  END IF;

  IF p_reward_type = 'badge' THEN
    SELECT value INTO v_enabled FROM app_config WHERE key = 'reward_tier_250_enabled';
    IF coalesce(v_enabled, 'false') <> 'true' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This reward is not yet available');
    END IF;
  END IF;

  -- Atomic decrement: UPDATE only fires if balance >= cost at this instant
  UPDATE users
  SET reward_units = reward_units - p_cost
  WHERE id = p_user_id
    AND reward_units >= p_cost
  RETURNING reward_units INTO v_new_balance;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough sparks');
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;
