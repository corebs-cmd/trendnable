// Core domain types

export interface Category {
  id: string;
  label: string;
  short: string;
  type: 'figure' | 'card' | 'box' | 'car';
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
  // Funko Pop only
  popNumber?: number;
  // Trading Cards only
  cardVariant?: 'raw' | 'graded';
  cardGrader?: string;   // PSA, BGS, CGC, SGC, etc.
  cardGrade?: string;    // 10, 9.5, 9, etc.
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
  | 'digest'
  | 'share'
  | 'publicProfile'
  | 'forSale'
  | 'feature';

export type HotScoreViz = 'bar' | 'ring' | 'components' | 'spark';
export type CardDensity = 'hero' | 'spacious' | 'medium' | 'cozy' | 'dense';
