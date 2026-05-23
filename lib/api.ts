import { supabase } from './supabase';
import { CollectionItem, DBUser, DBCollectionItem, SKU, PriceAlert, AppNotification, ScanResult, CatalogWatchlistItem, CatalogCollectionItem } from './types';

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
  return (data as Record<string, unknown>[]).map(rowToSku);
}

export async function fetchSkuById(skuId: string): Promise<SKU | null> {
  // Try the hot feed view first (active, fully processed SKUs)
  const { data: hotData } = await supabase
    .from('v_hot_skus')
    .select('*')
    .eq('id', skuId)
    .maybeSingle();
  if (hotData) return rowToSku(hotData as Record<string, unknown>);

  // Fallback: inactive SKU (e.g. just promoted from a scan, not yet in hot feed)
  const { data } = await supabase
    .from('skus')
    .select(`
      id, name, short, series, category_id, fandom_id,
      ebay_query, ebay_url, image_url, pop_number, exclusive_type,
      card_variant, card_grader, card_grade, created_at,
      hot_index(hot_score, delta_24h, momentum, velocity_score, volume_score, confirmation_score, freshness_score),
      daily_snapshots(price_low, price_median, price_high, listing_count, snapshot_date)
    `)
    .eq('id', skuId)
    .order('snapshot_date', { referencedTable: 'daily_snapshots', ascending: false })
    .limit(1, { referencedTable: 'daily_snapshots' })
    .maybeSingle();

  if (!data) return null;

  const d = data as Record<string, unknown>;
  const hi  = d.hot_index as Record<string, unknown> | null;
  const dsArr = d.daily_snapshots as Record<string, unknown>[] | null;
  const ds = Array.isArray(dsArr) ? dsArr[0] : null;

  return rowToSku({
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

// ── Scan pipeline ─────────────────────────────────────────────────────────────

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
    const err = new Error(data.message ?? data.error ?? 'Scan failed') as Error & { errorCode?: string };
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
    listings:       data.listings,
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
    .select('catalog_id, qty, purchased_price, purchase_date, condition, notes, created_at, product_catalog(name, short, category_id, price_latest, image_url)')
    .eq('user_id', userId)
    .not('catalog_id', 'is', null)
    .is('sku_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchCatalogCollection:', error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const cat = row.product_catalog as Record<string, unknown> | null;
    return {
      catalogId:    row.catalog_id as string,
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

// ── Push notifications ────────────────────────────────────────────────────────

export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);
  if (error) console.error('savePushToken:', error.message);
}
