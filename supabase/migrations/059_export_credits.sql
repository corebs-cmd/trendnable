-- Add export_credits to users for pay-per-export consumable purchases
ALTER TABLE users ADD COLUMN IF NOT EXISTS export_credits integer NOT NULL DEFAULT 0;

-- Function to safely increment export_credits
CREATE OR REPLACE FUNCTION increment_export_credits(user_id_input uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE users SET export_credits = export_credits + 1 WHERE id = user_id_input;
$$;

-- Function to safely decrement export_credits (floor at 0)
CREATE OR REPLACE FUNCTION decrement_export_credits(user_id_input uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE users SET export_credits = GREATEST(export_credits - 1, 0) WHERE id = user_id_input;
$$;
