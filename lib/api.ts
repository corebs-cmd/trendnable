import { supabase } from './supabase';
import { CollectionItem, DBUser, DBCollectionItem, SKU, PriceAlert, AppNotification, ScanResult, CatalogWatchlistItem, CatalogCollectionItem, SkuInsight, InsightResponse, InsightDirection, RewardSummary, CollectionPulse } from './types';
import type { StickerDef } from './stickers';

// ── Sticker catalog ───────────────────────────────────────────────────────────

export async function fetchStickerCatalog(): Promise<StickerDef[]> {
  const { data, error } = await supabase
    .from('stickers')
    .select('key, label, sub, family, shape, glow, ar, image_url')
    .order('display_order', { ascending: true });
  if (error || !data) return [];
  return data.map((row: any) => ({
    key: row.key,
    label: row.label,
    sub: row.sub ?? '',
    family: row.family as StickerDef['family'],
    shape: row.shape as StickerDef['shape'],
    glow: row.glow,
    ar: Number(row.ar),
    imageUrl: row.image_url ?? undefined,
  }));
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function createUserProfile(
  id: string,
  email: string,
  name: string | null
): Promise<DBUser | null> {
  // Upsert so this is idempotent — the auth trigger (migration 041) may have
  // already created the row before the client session was established.
  const { data, error } = await supabase
    .from('users')
    .upsert({
      id,
      email,
      name,
      is_premium: false,
      followed_fandoms: [],
      followed_categories: [],
      notification_digest_enabled: true,
      notification_digest_time: '08:00',
    }, { onConflict: 'id', ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    // Row may already exist from the trigger — try reading it instead
    if (error.code === '42501') {
      return fetchUserProfile(id);
    }
    console.error('createUserProfile:', error.message);
    return null;
  }
  return data as DBUser;
}

export async function fetchUserProfile(userId: string): Promise<DBUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('fetchUserProfile:', error.message);
    return null;
  }
  return data as DBUser;
}

export async function updateUserPreferences(
  userId: string,
  prefs: {
    followedFandoms?: string[];
    followedCategories?: string[];
    name?: string;
  }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (prefs.followedFandoms !== undefined) updates.followed_fandoms = prefs.followedFandoms;
  if (prefs.followedCategories !== undefined) updates.followed_categories = prefs.followedCategories;
  if (prefs.name !== undefined) updates.name = prefs.name;

  const { error } = await supabase.from('users').update(updates).eq('id', userId);
  if (error) console.error('updateUserPreferences:', error.message);
}

export async function updateUserPremium(userId: string, isPremium: boolean): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ is_premium: isPremium })
    .eq('id', userId);
  if (error) console.error('updateUserPremium:', error.message);
}

export async function updateNotificationPrefs(
  userId: string,
  prefs: { notifyMovers?: boolean; notifyInsights?: boolean }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (prefs.notifyMovers   !== undefined) updates.notify_movers   = prefs.notifyMovers;
  if (prefs.notifyInsights !== undefined) updates.notify_insights = prefs.notifyInsights;
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from('users').update(updates).eq('id', userId);
  if (error) console.error('updateNotificationPrefs:', error.message);
}

// ── Collection ───────────────────────────────────────────────────────────────

export async function fetchCollection(userId: string): Promise<CollectionItem[]> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .eq('user_id', userId)
    .not('sku_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchCollection:', error.message);
    return [];
  }
  return (data as DBCollectionItem[]).map(dbToCollectionItem);
}

export async function upsertCollectionItem(
  userId: string,
  item: CollectionItem
): Promise<void> {
  const { error } = await supabase.from('user_collections').upsert(
    {
      user_id: userId,
      sku_id: item.skuId,
      qty: item.qty,
      purchased_price: item.purchased,
      purchase_date: item.purchaseDate,
      condition: item.condition,
      notes: item.notes ?? null,
      for_sale: item.forSale,
      card_variant: item.cardVariant ?? null,
      card_grader: item.cardGrader ?? null,
      card_grade: item.cardGrade ?? null,
    },
    { onConflict: 'user_id,sku_id' }
  );
  if (error) console.error('upsertCollectionItem:', error.message);
}

export async function deleteCollectionItem(userId: string, skuId: string): Promise<void> {
  const { error } = await supabase
    .from('user_collections')
    .delete()
    .eq('user_id', userId)
    .eq('sku_id', skuId);
  if (error) console.error('deleteCollectionItem:', error.message);
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export async function fetchWatchlist(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_watchlists')
    .select('sku_id, catalog_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchWatchlist:', error.message);
    return [];
  }
  // Return only SKU-based watchlist items for backwards compatibility
  return (data as { sku_id: string | null; catalog_id: string | null }[])
    .filter((r) => r.sku_id != null)
    .map((r) => r.sku_id as string);
}

export async function addWatchlistItem(userId: string, skuId: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlists')
    .insert({ user_id: userId, sku_id: skuId });

  if (error && !error.message.includes('duplicate') && error.code !== '23505') {
    console.error('addWatchlistItem:', error.message);
  }
}

export async function removeWatchlistItem(userId: string, skuId: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlists')
    .delete()
    .eq('user_id', userId)
    .eq('sku_id', skuId);
  if (error) console.error('removeWatchlistItem:', error.message);
}

// ── Hot SKUs ─────────────────────────────────────────────────────────────────

export async function fetchHotSkus(): Promise<SKU[]> {
  const { data, error } = await supabase
    .from('v_hot_skus')
    .select('*')
    .order('hot_score', { ascending: false });

  if (error) throw new Error(error.message);
  const skus = (data as Record<string, unknown>[]).map(rowToSku);

  // Merge in current insights (direction badge data)
  const ids = skus.map((s) => s.id);
  const insights = await fetchCurrentInsightsMap(ids);
  return skus.map((s) => {
    const ins = insights.get(s.id);
    return ins ? { ...s, direction: ins.direction, insight: ins } : s;
  });
}

// Returns a map of sku_id → current SkuInsight
async function fetchCurrentInsightsMap(skuIds: string[]): Promise<Map<string, SkuInsight>> {
  if (skuIds.length === 0) return new Map();
  const { data } = await supabase
    .from('sku_insights')
    .select('id, sku_id, insight_type, direction, confidence, narration_short, narration_long, fired_at, expires_at')
    .in('sku_id', skuIds)
    .eq('is_current', true);

  const map = new Map<string, SkuInsight>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    map.set(row.sku_id as string, rowToInsight(row));
  }
  return map;
}

// Fetch the current insight for a single SKU, with personalized action for premium users
export async function fetchSkuInsight(
  skuId: string,
  userId: string | null,
  isPremium: boolean,
): Promise<InsightResponse> {
  const [insightData, narrativeData] = await Promise.all([
    supabase
      .from('sku_insights')
      .select('id, sku_id, insight_type, direction, confidence, narration_short, narration_long, fired_at, expires_at')
      .eq('sku_id', skuId)
      .eq('is_current', true)
      .maybeSingle(),
    supabase
      .from('sku_narratives')
      .select('narrative')
      .eq('sku_id', skuId)
      .maybeSingle(),
  ]);

  const insight = insightData.data ? rowToInsight(insightData.data as Record<string, unknown>) : null;
  const fallbackDescription = (narrativeData.data as Record<string, unknown> | null)?.narrative as string ?? '';

  let personalizedAction: string | null = null;
  if (isPremium && userId && insight) {
    const [collectionRow, watchlistRow] = await Promise.all([
      supabase.from('user_collections').select('id').eq('user_id', userId).eq('sku_id', skuId).limit(1).maybeSingle(),
      supabase.from('user_watchlists').select('id').eq('user_id', userId).eq('sku_id', skuId).limit(1).maybeSingle(),
    ]);
    const owns = !!collectionRow.data;
    const watches = !!watchlistRow.data;
    personalizedAction = getPersonalizedAction(insight.direction, owns, watches);
  }

  return { insight, personalizedAction, fallbackDescription };
}

function getPersonalizedAction(direction: InsightDirection, owns: boolean, watches: boolean): string | null {
  if (!owns && !watches) return null;
  const rel = owns ? 'owns' : 'watches';
  const lines: Record<string, Record<InsightDirection, string>> = {
    owns: {
      rising:  "You're holding well — momentum favors you.",
      holding: 'Position is stable. No action suggested.',
      cooling: 'Consider listing in the next 7–14 days before further softening.',
      falling: 'Momentum has turned. List immediately or hold long-term.',
    },
    watches: {
      rising:  'Buy window may be closing. Acting soon could cost less.',
      holding: 'Stable entry point. No urgency.',
      cooling: 'Better buy window may open in the next few weeks.',
      falling: 'Wait for price to settle before entering.',
    },
  };
  return lines[rel][direction];
}

function rowToInsight(row: Record<string, unknown>): SkuInsight {
  return {
    id:              row.id as string,
    skuId:           row.sku_id as string,
    insightType:     row.insight_type as SkuInsight['insightType'],
    direction:       row.direction as InsightDirection,
    confidence:      row.confidence as SkuInsight['confidence'],
    narrationShort:  (row.narration_short as string) ?? null,
    narrationLong:   (row.narration_long  as string) ?? null,
    firedAt:         row.fired_at  as string,
    expiresAt:       row.expires_at as string,
  };
}

export async function fetchSkuById(skuId: string): Promise<SKU | null> {
  // Query skus directly so admin-editable fields (sticker_keys, etc.) are always fresh.
  // Fetch insight in parallel so direction/color matches the hot list.
  const [{ data }, insightsMap] = await Promise.all([
    supabase
      .from('skus')
      .select(`
        id, name, short, series, category_id, fandom_id,
        ebay_query, ebay_url, image_url, pop_number, exclusive_type, sticker_keys,
        card_variant, card_grader, card_grade, created_at,
        hot_index(hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score),
        daily_snapshots(price_low, price_median, price_high, listing_count, snapshot_date)
      `)
      .eq('id', skuId)
      .order('snapshot_date', { referencedTable: 'daily_snapshots', ascending: false })
      .limit(1, { referencedTable: 'daily_snapshots' })
      .maybeSingle(),
    fetchCurrentInsightsMap([skuId]),
  ]);

  if (!data) return null;

  const d = data as Record<string, unknown>;
  const hi  = d.hot_index as Record<string, unknown> | null;
  const dsArr = d.daily_snapshots as Record<string, unknown>[] | null;
  const ds = Array.isArray(dsArr) ? dsArr[0] : null;

  const sku = rowToSku({
    ...d,
    hot_score:            hi?.hot_score          ?? 0,
    delta_24h:            hi?.delta_24h           ?? 0,
    momentum:             hi?.momentum            ?? 'flat',
    velocity_score:       hi?.velocity_score      ?? 0,
    volume_score:         hi?.volume_score        ?? 0,
    confirmation_score:   hi?.confirmation_score  ?? 0,
    freshness_score:      hi?.freshness_score     ?? 0,
    price_low:            ds?.price_low           ?? 0,
    price_median:         ds?.price_median        ?? 0,
    price_high:           ds?.price_high          ?? 0,
    listing_count:        ds?.listing_count       ?? 0,
    snapshot_date:        ds?.snapshot_date       ?? null,
    narrative:            null,
    is_featured:          false,
    force_featured_until: null,
    fandom_ids:           [],
  } as Record<string, unknown>);

  const ins = insightsMap.get(skuId);
  return ins ? { ...sku, direction: ins.direction, insight: ins } : sku;
}

export async function fetchSkuHistory(
  skuId: string,
  days = 14
): Promise<{ history: number[]; listingsHist: number[]; priceHist: number[] }> {
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_snapshots')
    .select('snapshot_date, hot_score, listing_count, price_median')
    .eq('sku_id', skuId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });

  if (error || !data?.length) {
    return { history: [], listingsHist: [], priceHist: [] };
  }

  return {
    history: (data as Record<string, unknown>[]).map((r) => Number(r.hot_score ?? 0)),
    listingsHist: (data as Record<string, unknown>[]).map((r) => Number(r.listing_count ?? 0)),
    priceHist: (data as Record<string, unknown>[]).map((r) => Number(r.price_median ?? 0)),
  };
}

// ── Price Alerts ──────────────────────────────────────────────────────────────

export async function fetchPriceAlerts(userId: string): Promise<PriceAlert[]> {
  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchPriceAlerts:', error.message); return []; }
  return (data ?? []).map(dbToPriceAlert);
}

export async function createPriceAlert(
  userId: string,
  skuId: string,
  direction: 'above' | 'below',
  targetPrice: number,
): Promise<PriceAlert | null> {
  const { data, error } = await supabase
    .from('price_alerts')
    .insert({ user_id: userId, sku_id: skuId, direction, target_price: targetPrice, is_active: true })
    .select()
    .single();
  if (error) { console.error('createPriceAlert:', error.message); return null; }
  return dbToPriceAlert(data);
}

export async function deletePriceAlert(alertId: string): Promise<void> {
  const { error } = await supabase.from('price_alerts').delete().eq('id', alertId);
  if (error) console.error('deletePriceAlert:', error.message);
}

export async function reactivatePriceAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from('price_alerts')
    .update({ is_active: true, triggered_at: null })
    .eq('id', alertId);
  if (error) console.error('reactivatePriceAlert:', error.message);
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('fetchNotifications:', error.message); return []; }
  return (data ?? []).map(dbToNotification);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) console.error('markNotificationRead:', error.message);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToSku(row: Record<string, unknown>): SKU {
  const ageDays = row.created_at
    ? Math.floor((Date.now() - new Date(row.created_at as string).getTime()) / 86400000)
    : 0;

  return {
    id: row.id as string,
    name: row.name as string,
    short: (row.short as string) ?? (row.name as string),
    series: (row.series as string) ?? '',
    category: row.category_id as string,
    fandom: row.fandom_id as string,
    hot: Number(row.hot_score ?? 0),
    delta: Number(row.delta_24h ?? 0),
    momentum: (row.momentum as 'up' | 'down' | 'flat') ?? 'flat',
    score: {
      velocity: Number(row.velocity_score ?? 0),
      volume: Number(row.volume_score ?? 0),
      confirmation: Number(row.confirmation_score ?? 0),
      freshness: Number(row.freshness_score ?? 0),
    },
    price: {
      low: Number(row.price_low ?? 0),
      median: Number(row.price_median ?? 0),
      high: Number(row.price_high ?? 0),
      currency: 'USD',
    },
    listings: Number(row.listing_count ?? 0),
    age: ageDays,
    narrative: (row.narrative as string) ?? undefined,
    history: [],
    listingsHist: [],
    priceHist: [],
    imageUrl:      (row.image_url     as string) ?? undefined,
    ebay_query:    (row.ebay_query   as string) ?? undefined,
    ebay_url:      (row.ebay_url     as string) ?? undefined,
    mercari_url:   (row.mercari_url  as string) ?? undefined,
    popnbeats_url: (row.popnbeats_url as string) ?? undefined,
    isFeatured:         (row.is_featured          as boolean) ?? false,
    forceFeaturedUntil: (row.force_featured_until as string)  ?? null,
    fandomIds:   Array.isArray(row.fandom_ids) ? (row.fandom_ids as string[]) : [],
    popNumber:      (row.pop_number as number)   ?? undefined,
    exclusiveType:  (row.exclusive_type as string) ?? null,
    cardVariant:    (row.card_variant as SKU['cardVariant']) ?? undefined,
    cardGrader:     (row.card_grader  as string) ?? undefined,
    cardGrade:      (row.card_grade   as string) ?? undefined,
    priceMint:      row.price_mint      != null ? Number(row.price_mint)       : null,
    priceMintCount: row.price_mint_count != null ? Number(row.price_mint_count) : null,
    priceLoose:     row.price_loose     != null ? Number(row.price_loose)      : null,
    priceLooseCount:row.price_loose_count != null ? Number(row.price_loose_count): null,
    stickerKeys: Array.isArray(row.sticker_keys) ? (row.sticker_keys as string[]) : null,
    ppgPrice:    row.ppg_price    != null ? Number(row.ppg_price)    : null,
    retailPrice: row.retail_price != null ? Number(row.retail_price) : null,
    direction: (row.insight_direction as InsightDirection) ?? undefined,
  };
}

function dbToPriceAlert(row: Record<string, unknown>): PriceAlert {
  return {
    id:           row.id as string,
    skuId:        row.sku_id as string,
    direction:    row.direction as 'above' | 'below',
    targetPrice:  Number(row.target_price),
    isActive:     row.is_active as boolean,
    triggeredAt:  (row.triggered_at as string) ?? null,
    createdAt:    row.created_at as string,
  };
}

function dbToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id:        row.id as string,
    type:      row.type as string,
    skuId:     (row.sku_id as string) ?? null,
    title:     row.title as string,
    body:      row.body as string,
    metadata:  (row.metadata as Record<string, unknown>) ?? {},
    isRead:    row.is_read as boolean,
    createdAt: row.created_at as string,
  };
}

function dbToCollectionItem(row: DBCollectionItem): CollectionItem {
  return {
    skuId: row.sku_id,
    qty: row.qty,
    purchased: row.purchased_price,
    purchaseDate: row.purchase_date,
    condition: row.condition,
    notes: row.notes ?? undefined,
    forSale: row.for_sale,
    cardVariant: (row.card_variant as CollectionItem['cardVariant']) ?? undefined,
    cardGrader: row.card_grader ?? undefined,
    cardGrade: row.card_grade ?? undefined,
  };
}

// ── Scan quota (free tier) ────────────────────────────────────────────────────

const SCAN_DAILY_LIMIT = 1;

export interface ScanQuota {
  used: number;
  limit: number;
  resetsAt: string;
  isPremium: boolean;
}

function nextUtcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export async function fetchScanQuota(userId: string): Promise<ScanQuota> {
  const { data } = await supabase
    .from('users')
    .select('is_premium, scan_count_day, scan_count_used')
    .eq('id', userId)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const isPremium = (data?.is_premium as boolean | undefined) ?? false;
  const used = data?.scan_count_day === today ? ((data?.scan_count_used as number | undefined) ?? 0) : 0;

  return {
    used,
    limit: SCAN_DAILY_LIMIT,
    resetsAt: nextUtcMidnightIso(),
    isPremium,
  };
}

// ── Scan pipeline ─────────────────────────────────────────────────────────────

export type ScanError = Error & {
  errorCode?: string;
  // Populated when errorCode === 'quota_exceeded'
  quota?: { used: number; limit: number; resetsAt: string };
};

export async function callScanPipeline(barcode: string, accessToken: string): Promise<ScanResult> {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/scan-pipeline`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ barcode }),
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    const err = new Error(data.message ?? data.error ?? 'Scan failed') as ScanError;
    err.errorCode = data.error;
    if (data.error === 'quota_exceeded') {
      err.quota = { used: data.used, limit: data.limit, resetsAt: data.resetsAt };
    }
    throw err;
  }

  return {
    catalogId:      data.catalog_id,
    skuId:          data.sku_id ?? null,
    name:           data.name,
    short:          data.short,
    series:         data.series ?? null,
    categoryId:     data.category_id,
    fandomId:       data.fandom_id ?? null,
    variantType:    data.variant_type ?? null,
    popNumber:      data.pop_number ?? null,
    price: {
      low:    data.price.low,
      median: data.price.median,
      high:   data.price.high,
    },
    listings:          data.listings,
    soldCount:         data.sold_count ?? 0,
    sellabilityScore:  data.sellability_score ?? 0,
    scoreEstimate:  data.score_estimate,
    scoreBreakdown: {
      velocity:     data.score_breakdown.velocity,
      volume:       data.score_breakdown.volume,
      confirmation: data.score_breakdown.confirmation,
      freshness:    data.score_breakdown.freshness,
    },
    isNewToCatalog:    data.is_new_to_catalog,
    qualityGatePassed: data.quality_gate_passed,
    barcode:           data.barcode,
    ebayQuery:         data.ebay_query,
    imageUrl:          data.image_url ?? null,
  };
}

export async function callVisionPipeline(imageBase64: string, accessToken: string): Promise<ScanResult> {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/vision-pipeline`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ imageBase64 }),
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    const err = new Error(data.message ?? data.error ?? 'Vision scan failed') as ScanError;
    err.errorCode = data.error;
    throw err;
  }

  return {
    catalogId:      data.catalog_id,
    skuId:          data.sku_id ?? null,
    name:           data.name,
    short:          data.short,
    series:         data.series ?? null,
    categoryId:     data.category_id,
    fandomId:       data.fandom_id ?? null,
    variantType:    data.variant_type ?? null,
    popNumber:      data.pop_number ?? null,
    price: {
      low:    data.price.low,
      median: data.price.median,
      high:   data.price.high,
    },
    listings:          data.listings,
    soldCount:         data.sold_count ?? 0,
    sellabilityScore:  data.sellability_score ?? 0,
    scoreEstimate:     data.score_estimate,
    scoreBreakdown: {
      velocity:     data.score_breakdown.velocity,
      volume:       data.score_breakdown.volume,
      confirmation: data.score_breakdown.confirmation,
      freshness:    data.score_breakdown.freshness,
    },
    isNewToCatalog:    data.is_new_to_catalog,
    qualityGatePassed: data.quality_gate_passed,
    barcode:           data.barcode ?? null,
    ebayQuery:         data.ebay_query,
    imageUrl:          data.image_url ?? null,
  };
}

export async function promoteCatalogToSku(
  catalogId: string,
  accessToken: string,
): Promise<{ skuId: string } | null> {
  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/catalog-to-sku`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ catalog_id: catalogId }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      console.error('promoteCatalogToSku failed:', data.error ?? response.status);
      return null;
    }
    return { skuId: data.sku_id };
  } catch (err) {
    console.error('promoteCatalogToSku error:', err);
    return null;
  }
}

// ── Catalog watchlist ─────────────────────────────────────────────────────────

export async function fetchCatalogWatchlist(userId: string): Promise<CatalogWatchlistItem[]> {
  const { data, error } = await supabase
    .from('user_watchlists')
    .select('catalog_id, created_at, product_catalog(name, short, category_id, fandom_id, price_latest, image_url)')
    .eq('user_id', userId)
    .not('catalog_id', 'is', null)
    .is('sku_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchCatalogWatchlist:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.product_catalog as Record<string, unknown> | null;
    return {
      catalogId:     row.catalog_id as string,
      name:          (cat?.name as string) ?? '',
      short:         (cat?.short as string) ?? '',
      categoryId:    (cat?.category_id as string) ?? '',
      fandomId:      (cat?.fandom_id as string) ?? null,
      price:         cat?.price_latest != null ? Number(cat.price_latest) : null,
      scoreEstimate: null,
      addedAt:       row.created_at as string,
      imageUrl:      (cat?.image_url as string) ?? null,
    };
  });
}

export async function addCatalogWatchlistItem(userId: string, catalogId: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlists')
    .insert({ user_id: userId, catalog_id: catalogId });
  if (error && !error.message.includes('duplicate') && error.code !== '23505') {
    console.error('addCatalogWatchlistItem:', error.message);
  }
}

export async function removeCatalogWatchlistItem(userId: string, catalogId: string): Promise<void> {
  const { error } = await supabase
    .from('user_watchlists')
    .delete()
    .eq('user_id', userId)
    .eq('catalog_id', catalogId);
  if (error) console.error('removeCatalogWatchlistItem:', error.message);
}

// ── Catalog collection ────────────────────────────────────────────────────────

export async function fetchCatalogCollection(userId: string): Promise<CatalogCollectionItem[]> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('catalog_id, sku_id, qty, purchased_price, purchase_date, condition, notes, created_at, product_catalog(name, short, category_id, price_latest, image_url)')
    .eq('user_id', userId)
    .not('catalog_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchCatalogCollection:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.product_catalog as Record<string, unknown> | null;
    return {
      catalogId:    row.catalog_id as string,
      skuId:        (row.sku_id as string | null) ?? null,
      name:         (cat?.name as string) ?? '',
      short:        (cat?.short as string) ?? '',
      categoryId:   (cat?.category_id as string) ?? '',
      qty:          Number(row.qty ?? 1),
      purchased:    Number(row.purchased_price ?? 0),
      purchaseDate: row.purchase_date as string,
      condition:    (row.condition as string) ?? 'Good',
      notes:        (row.notes as string) ?? undefined,
      currentPrice: cat?.price_latest != null ? Number(cat.price_latest) : null,
      imageUrl:     (cat?.image_url as string) ?? null,
    };
  });
}

export async function fetchCatalogItemById(catalogId: string): Promise<{
  id: string; name: string; short: string; categoryId: string; fandomId: string | null;
  series: string | null; priceLatest: number | null; imageUrl: string | null;
  barcode: string | null; scanCount: number; skuId: string | null; ebayQuery: string | null;
} | null> {
  const { data, error } = await supabase
    .from('product_catalog')
    .select('id, name, short, category_id, fandom_id, series, price_latest, image_url, barcode, scan_count, sku_id, ebay_query')
    .eq('id', catalogId)
    .single();
  if (error || !data) return null;
  return {
    id:           data.id,
    name:         data.name,
    short:        data.short,
    categoryId:   data.category_id,
    fandomId:     data.fandom_id ?? null,
    series:       data.series ?? null,
    priceLatest:  data.price_latest != null ? Number(data.price_latest) : null,
    imageUrl:     data.image_url ?? null,
    barcode:      data.barcode ?? null,
    scanCount:    data.scan_count ?? 0,
    skuId:        data.sku_id ?? null,
    ebayQuery:    data.ebay_query ?? null,
  };
}

export async function upsertCatalogCollectionItem(
  userId: string,
  catalogId: string,
  item: Pick<CatalogCollectionItem, 'qty' | 'purchased' | 'purchaseDate' | 'condition' | 'notes'>
): Promise<void> {
  const payload = {
    qty:             item.qty,
    purchased_price: item.purchased,
    purchase_date:   item.purchaseDate,
    condition:       item.condition,
    notes:           item.notes ?? null,
  };

  const { data: existing } = await supabase
    .from('user_collections')
    .select('id')
    .eq('user_id', userId)
    .eq('catalog_id', catalogId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_collections')
      .update(payload)
      .eq('id', existing.id);
    if (error) console.error('upsertCatalogCollectionItem update:', error.message);
  } else {
    const { error } = await supabase
      .from('user_collections')
      .insert({ user_id: userId, catalog_id: catalogId, ...payload });
    if (error) console.error('upsertCatalogCollectionItem insert:', error.message);
  }
}

export async function deleteCatalogCollectionItem(userId: string, catalogId: string): Promise<void> {
  const { error } = await supabase
    .from('user_collections')
    .delete()
    .eq('user_id', userId)
    .eq('catalog_id', catalogId);
  if (error) console.error('deleteCatalogCollectionItem:', error.message);
}

// Atomically clears catalog_id from a row that already has sku_id set.
// Safer than delete + re-insert — the sku_id row is preserved throughout.
export async function clearCatalogLink(userId: string, catalogId: string): Promise<void> {
  const { error } = await supabase
    .from('user_collections')
    .update({ catalog_id: null })
    .eq('user_id', userId)
    .eq('catalog_id', catalogId);
  if (error) console.error('clearCatalogLink:', error.message);
}

// ── Push notifications ────────────────────────────────────────────────────────

export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);
  if (error) console.error('savePushToken:', error.message);
}

// ── Community pricing ─────────────────────────────────────────────────────────

// Validates a community-submitted price against eBay median.
// Rules: >= $5, >= 5% of median, <= 10× median.
export function validateCommunityPrice(value: number, ebayMedian: number): boolean {
  if (value < 5) return false;
  if (ebayMedian > 0 && value < ebayMedian * 0.05) return false;
  if (ebayMedian > 0 && value > ebayMedian * 10) return false;
  return true;
}

// Submits a community price (ppg and/or retail) for a catalog or sku entry.
// Awards 2 reward units per valid field submitted.
// Returns { awarded: number } — total units awarded this call.
export async function submitCommunityPrice(params: {
  catalogId?: string;
  skuId?: string;
  ppgPrice?: number | null;
  retailPrice?: number | null;
  ebayMedian: number;
  userId: string;
  accessToken: string;
}): Promise<{ awarded: number }> {
  const { catalogId, skuId, ppgPrice, retailPrice, ebayMedian, userId } = params;
  let awarded = 0;

  const validPpg    = ppgPrice    != null && validateCommunityPrice(ppgPrice,    ebayMedian);
  const validRetail = retailPrice != null && validateCommunityPrice(retailPrice, ebayMedian);

  if (!validPpg && !validRetail) return { awarded: 0 };

  const update: Record<string, unknown> = { community_contributor_id: userId };
  if (validPpg)    update.ppg_price    = ppgPrice;
  if (validRetail) update.retail_price = retailPrice;

  // Update catalog row
  if (catalogId) {
    await supabase.from('product_catalog').update(update).eq('id', catalogId);
  }
  // Update sku row
  if (skuId) {
    await supabase.from('skus').update(update).eq('id', skuId);
  }

  // Award units + log events
  const events: { user_id: string; event_type: string; units: number; sku_id?: string; catalog_id?: string }[] = [];
  if (validPpg) {
    awarded += 2;
    events.push({ user_id: userId, event_type: 'ppg_price', units: 2, sku_id: skuId, catalog_id: catalogId });
  }
  if (validRetail) {
    awarded += 2;
    events.push({ user_id: userId, event_type: 'retail_price', units: 2, sku_id: skuId, catalog_id: catalogId });
  }

  if (events.length > 0) {
    await supabase.from('reward_events').insert(events);
    // Fetch current units, add awarded amount, persist
    const { data: userData } = await supabase.from('users').select('reward_units').eq('id', userId).single();
    const current = (userData as any)?.reward_units ?? 0;
    await supabase.from('users').update({ reward_units: current + awarded }).eq('id', userId);
  }

  return { awarded };
}

// ── Rewards ───────────────────────────────────────────────────────────────────

export async function fetchRewardSummary(userId: string): Promise<RewardSummary> {
  const { data } = await supabase
    .from('users')
    .select('reward_units, premium_reward_claimed_at, premium_reward_expires_at')
    .eq('id', userId)
    .single();
  const units = (data as any)?.reward_units ?? 0;
  const claimedAt = (data as any)?.premium_reward_claimed_at ?? null;
  const expiresAt = (data as any)?.premium_reward_expires_at ?? null;
  return {
    units,
    stars: Math.floor(units / 50),
    canClaimFreeMonth: units >= 500 && (!expiresAt || new Date(expiresAt) < new Date()),
    claimedAt,
    expiresAt,
  };
}

export async function claimRewardPremium(userId: string): Promise<{ success: boolean; expiresAt: string }> {
  const summary = await fetchRewardSummary(userId);
  if (!summary.canClaimFreeMonth) throw new Error('Not eligible');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('users').update({
    premium_reward_claimed_at: new Date().toISOString(),
    premium_reward_expires_at: expiresAt,
    is_premium: true,
  }).eq('id', userId);
  return { success: true, expiresAt };
}

export async function getCollectionPulse(): Promise<CollectionPulse | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/collection-pulse`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  return json as CollectionPulse;
}
