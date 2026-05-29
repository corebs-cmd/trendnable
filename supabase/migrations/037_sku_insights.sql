-- sku_insights: stores directional market signals per SKU
-- Powers the direction badge (free) and "Why it's hot" insight prose (premium)

CREATE TABLE sku_insights (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id           TEXT    NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  insight_type     TEXT    NOT NULL,
  -- supply_shock | quiet_accumulation | false_top | confirmed_breakout
  -- stagnation_risk | catalyst_spike | low_data | steady_state
  direction        TEXT    NOT NULL CHECK (direction IN ('rising','holding','cooling','falling')),
  confidence       TEXT    NOT NULL CHECK (confidence IN ('low','medium','high')),
  detection_payload JSONB  NOT NULL DEFAULT '{}',
  narration_short  TEXT,
  narration_long   TEXT,
  fired_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one current insight per SKU at a time
CREATE UNIQUE INDEX idx_sku_insights_one_current ON sku_insights(sku_id) WHERE is_current = TRUE;
CREATE INDEX idx_sku_insights_sku_current ON sku_insights(sku_id) WHERE is_current = TRUE;
CREATE INDEX idx_sku_insights_fired_at   ON sku_insights(fired_at DESC);
CREATE INDEX idx_sku_insights_type       ON sku_insights(insight_type, fired_at DESC);

-- RLS: allow authenticated reads; only service role writes
ALTER TABLE sku_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sku_insights_read" ON sku_insights
  FOR SELECT USING (TRUE);
