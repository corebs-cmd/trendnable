// Core domain types

export interface Category {
  id: string;
  label: string;
  short: string;
  type: 'figure' | 'card' | 'box' | 'car' | 'signed';
}

export interface Fandom {
  id: string;
  label: string;
}

export interface ScoreBreakdown {
  velocity: number;  // new listings/day
  volume: number;    // listing count signal
  confirmation: number; // Reddit + watch signals
  freshness: number; // recency signal
}

export interface PriceRange {
  low: number;
  median: number;
  high: number;
  currency?: string;
}

export interface SKU {
  id: string;
  name: string;
  short: string;
  series: string;
  category: string;
  fandom: string;
  hot: number;          // 0-100 hot score
  delta: number;        // 24h change
  momentum: 'up' | 'down' | 'flat';
  score: ScoreBreakdown;
  price: PriceRange;
  listings: number;
  age: number;          // days on market
  narrative?: string;
  history: number[];    // hot score history
  listingsHist: number[];
  priceHist: number[];
  imageUrl?: string;
  ebay_query?: string;
  ebay_url?: string;
  mercari_url?: string;
  popnbeats_url?: string;
  isFeatured?: boolean;
  forceFeaturedUntil?: string | null;
  fandomIds: string[];
  // Funko Pop only
  popNumber?: number;
  exclusiveType?: string | null;
  // Trading Cards only
  cardVariant?: 'raw' | 'graded';
  cardGrader?: string;   // PSA, BGS, CGC, SGC, etc.
  cardGrade?: string;    // 10, 9.5, 9, etc.
  // Condition price buckets (populated after P1 pipeline runs)
  priceMint?: number | null;
  priceMintCount?: number | null;
  priceLoose?: number | null;
  priceLooseCount?: number | null;
  // Exclusive stickers (ordered, index 0 = hero/aura source)
  stickerKeys?: string[] | null;
  // Community-contributed prices
  ppgPrice?: number | null;
  retailPrice?: number | null;
  // Directional signal (from sku_insights)
  direction?: InsightDirection;
  insight?: SkuInsight | null;
}

export interface CollectionItem {
  skuId: string;
  qty: number;
  purchased: number;    // price per item
  purchaseDate: string;
  condition: string;
  notes?: string;
  forSale: boolean;
  // Trading Cards only
  cardVariant?: 'raw' | 'graded';
  cardGrader?: string;
  cardGrade?: string;
}

export interface RewardSummary {
  units: number;
  stars: number;
  canClaimFreeMonth: boolean;
  claimedAt: string | null;
  expiresAt: string | null;
}

export interface CollectionFormData {
  skuId?: string;
  qty: number;
  purchased: number;
  purchaseDate: string;
  condition: string;
  notes?: string;
  forSale: boolean;
  cardVariant?: 'raw' | 'graded';
  cardGrader?: string;
  cardGrade?: string;
}

export interface CollectionItemEnriched extends CollectionItem {
  sku: SKU;
  current: number;  // current value (qty * median)
  cost: number;     // total cost (qty * purchased)
  pl: number;       // profit/loss
}

// Supabase user
export interface DBUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  followed_fandoms: string[];
  followed_categories: string[];
  notification_digest_enabled: boolean;
  notification_digest_time: string;
  notify_movers: boolean;
  notify_insights: boolean;
  created_at: string;
}

// Supabase collection row
export interface DBCollectionItem {
  id: string;
  user_id: string;
  sku_id: string;
  qty: number;
  purchased_price: number;
  purchase_date: string;
  condition: string;
  notes: string | null;
  for_sale: boolean;
  created_at: string;
  updated_at: string;
  // Trading Cards only
  card_variant: string | null;
  card_grader: string | null;
  card_grade: string | null;
}

// Supabase watchlist row
export interface DBWatchlistItem {
  id: string;
  user_id: string;
  sku_id: string;
  created_at: string;
}

export interface MarketplaceListing {
  id: string;
  name: string;
  price: number;
  count: number;
  primary?: boolean;
  url?: string;
}

export type UpgradeContext =
  | 'pl'
  | 'history'
  | 'breakdown'
  | 'watchlist'
  | 'share'
  | 'feature'
  | 'priceAlerts'
  | 'sellability'
  | 'scanQuota'
  | 'visionScan';

export interface PriceAlert {
  id: string;
  skuId: string;
  direction: 'above' | 'below';
  targetPrice: number;
  isActive: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  skuId: string | null;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export type HotScoreViz = 'bar' | 'ring' | 'components' | 'spark';
export type CardDensity = 'hero' | 'spacious' | 'medium' | 'cozy' | 'dense';

// ── Insights ──────────────────────────────────────────────────────────────────

export type InsightDirection = 'rising' | 'holding' | 'cooling' | 'falling';
export type InsightType =
  | 'supply_shock'
  | 'quiet_accumulation'
  | 'false_top'
  | 'confirmed_breakout'
  | 'stagnation_risk'
  | 'catalyst_spike'
  | 'low_data'
  | 'steady_state';
export type InsightConfidence = 'low' | 'medium' | 'high';

export interface SkuInsight {
  id: string;
  skuId: string;
  insightType: InsightType;
  direction: InsightDirection;
  confidence: InsightConfidence;
  narrationShort: string | null;
  narrationLong: string | null;
  firedAt: string;
  expiresAt: string;
}

export interface InsightResponse {
  insight: SkuInsight | null;
  personalizedAction: string | null;
  fallbackDescription: string;
}

// ── Collection Pulse ──────────────────────────────────────────────────────────

export interface FlaggedItem {
  sku_id: string;
  name: string;
  image_url: string | null;
  reason: 'near_peak' | 'declining';
  urgency: number;
  price_median: number;
  peak_90d: number | null;
  avg_30d: number | null;
  down_days: number;
}

// Individual owned SKU ranked by hot_score for the demand breakdown table
export interface DemandRow {
  sku_id:    string;
  name:      string;
  image_url: string | null;
  hot_score: number;
}

export interface CollectionPulse {
  eligible: boolean;
  heat_score: number;
  verdict: 'hot' | 'warming' | 'cooling';
  delta_24h: number;
  summary: string | null;
  standout: { sku_id: string; name: string; image_url: string | null; hot_score: number; delta_24h: number } | null;
  flagged_count: number;
  sku_count: number;
  generated_at: string | null;
  // Free users get name+image only — no reason/price to prevent leakage
  flagged_preview?: { sku_id: string; name: string; image_url: string | null }[];
  payload?: { flagged: FlaggedItem[]; hottest: DemandRow[]; coolest: DemandRow[] };
}

// ── Scan pipeline ─────────────────────────────────────────────────────────────

export interface ScanResult {
  catalogId: string;
  skuId: string | null;
  name: string;
  short: string;
  series: string | null;
  categoryId: string;
  fandomId: string | null;
  variantType: string | null;
  popNumber: number | null;
  price: { low: number; median: number; high: number };
  listings: number;
  soldCount: number;
  sellabilityScore: number;
  scoreEstimate: number;
  scoreBreakdown: { velocity: number; volume: number; confirmation: number; freshness: number };
  isNewToCatalog: boolean;
  qualityGatePassed: boolean;
  barcode: string;
  ebayQuery: string;
  imageUrl: string | null;
}

export interface CatalogWatchlistItem {
  catalogId: string;
  name: string;
  short: string;
  categoryId: string;
  fandomId: string | null;
  price: number | null;
  scoreEstimate: number | null;
  addedAt: string;
  imageUrl: string | null;
}

export interface CatalogCollectionItem {
  catalogId: string;
  skuId?: string | null;
  name: string;
  short: string;
  categoryId: string;
  qty: number;
  purchased: number;
  purchaseDate: string;
  condition: string;
  notes?: string;
  currentPrice: number | null;
  imageUrl: string | null;
}
