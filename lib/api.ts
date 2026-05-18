import { supabase } from './supabase';
import { CollectionItem, DBUser, DBCollectionItem, SKU, PriceAlert, AppNotification } from './types';

// ── Users ────────────────────────────────────────────────────────────────────

export async function createUserProfile(
  id: string,
  email: string,
  name: string | null
): Promise<DBUser | null> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id,
      email,
      name,
      is_premium: false,
      followed_fandoms: [],
      followed_categories: [],
      notification_digest_enabled: true,
      notification_digest_time: '08:00',
    })
    .select()
    .single();

  if (error) {
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

// ── Collection ───────────────────────────────────────────────────────────────

export async function fetchCollection(userId: string): Promise<CollectionItem[]> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .eq('user_id', userId)
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
    .select('sku_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchWatchlist:', error.message);
    return [];
  }
  return (data as { sku_id: string }[]).map((r) => r.sku_id);
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
  return (data as Record<string, unknown>[]).map(rowToSku);
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
    popNumber:   (row.pop_number as number) ?? undefined,
    cardVariant: (row.card_variant as SKU['cardVariant']) ?? undefined,
    cardGrader:  (row.card_grader  as string) ?? undefined,
    cardGrade:   (row.card_grade   as string) ?? undefined,
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
