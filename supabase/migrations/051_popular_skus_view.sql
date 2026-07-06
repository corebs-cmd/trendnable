-- v_popular_skus: composite popularity ranked by hot score + collection + watchlist signals.
-- Weights: 1pt per hot_score unit, 20pt per collection add, 10pt per watchlist add.
-- Builds on v_hot_skus so all existing SKU fields are available to rowToSku().

CREATE OR REPLACE VIEW v_popular_skus AS
WITH collection_counts AS (
  SELECT sku_id, COUNT(*) AS cnt
  FROM user_collections
  WHERE sku_id IS NOT NULL
  GROUP BY sku_id
),
watchlist_counts AS (
  SELECT sku_id, COUNT(*) AS cnt
  FROM user_watchlists
  WHERE sku_id IS NOT NULL
  GROUP BY sku_id
)
SELECT
  s.*,
  COALESCE(cc.cnt, 0)::integer                                    AS collection_count,
  COALESCE(wc.cnt, 0)::integer                                    AS watchlist_count,
  (
    COALESCE(s.hot_score, 0)::numeric
    + COALESCE(cc.cnt, 0) * 20
    + COALESCE(wc.cnt, 0) * 10
  )                                                               AS popularity_score
FROM v_hot_skus s
LEFT JOIN collection_counts cc ON cc.sku_id = s.id
LEFT JOIN watchlist_counts  wc ON wc.sku_id = s.id;
