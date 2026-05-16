// Trendnable Hot Pipeline — runs daily via cron
// Fetches eBay data for each active SKU, computes hot scores, updates hot_index.
//
// Scoring formula (0-100):
//   velocity    (0-30): new listings per day vs. 7-day baseline
//   volume      (0-30): current listing count signal
//   confirmation(0-25): Reddit mentions + eBay watch count
//   freshness   (0-15): penalty for old SKUs (>90 days drops score)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EBAY_CLIENT_ID = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';

async function getEbayToken(): Promise<string> {
  const credentials = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchEbayListings(query: string, token: string) {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('filter', 'categoryIds:{220,64482}');
  url.searchParams.set('limit', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.itemSummaries ?? [];
}

function computeHotScore(params: {
  listings: number;
  prevListings: number;
  velocity: number;
  age: number;
  redditMentions: number;
  ebayWatchers: number;
}): { hot: number; velocity: number; volume: number; confirmation: number; freshness: number } {
  const { listings, prevListings, velocity, age, redditMentions, ebayWatchers } = params;

  // Velocity (0-30): listing growth rate
  const growthRate = prevListings > 0 ? (listings - prevListings) / prevListings : 0;
  const velocityScore = Math.min(30, Math.round(Math.max(0, growthRate * 100)));

  // Volume (0-30): absolute listing count signal
  const volumeScore = Math.min(30, Math.round(Math.log10(Math.max(1, listings)) * 10));

  // Confirmation (0-25): social signals
  const confirmationScore = Math.min(25, redditMentions * 3 + Math.floor(ebayWatchers / 10));

  // Freshness (0-15): newer SKUs score higher
  const freshnessScore = age < 7 ? 15 : age < 30 ? 12 : age < 90 ? 8 : age < 180 ? 4 : 1;

  const hot = velocityScore + volumeScore + confirmationScore + freshnessScore;

  return {
    hot: Math.min(100, hot),
    velocity: velocityScore,
    volume: volumeScore,
    confirmation: confirmationScore,
    freshness: freshnessScore,
  };
}

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = await getEbayToken();

    // Fetch all active SKUs
    const { data: skus, error } = await supabase
      .from('skus')
      .select('id, name, ebay_query, created_at')
      .eq('is_active', true);

    // Track which SKUs already have a canonical image so we skip re-saving
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('sku_id')
      .eq('is_canonical', true);
    const hasImage = new Set((existingImages ?? []).map((r: any) => r.sku_id));

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    const processed: string[] = [];

    for (const sku of skus ?? []) {
      try {
        const query = sku.ebay_query || sku.name;
        const listings = await fetchEbayListings(query, token);
        if (!listings) continue;

        const listingCount = listings.length;
        const prices = listings
          .map((l: any) => parseFloat(l.price?.value ?? '0'))
          .filter((p: number) => p > 0)
          .sort((a: number, b: number) => a - b);

        const priceMedian = prices.length > 0 ? prices[Math.floor((prices.length - 1) / 2)] : 0;
        const priceLow = prices[0] ?? 0;
        const priceHigh = prices[prices.length - 1] ?? 0;

        // Get yesterday's snapshot for velocity
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const { data: prevSnap } = await supabase
          .from('daily_snapshots')
          .select('listing_count')
          .eq('sku_id', sku.id)
          .eq('snapshot_date', yesterday)
          .single();

        const prevListings = prevSnap?.listing_count ?? listingCount;
        const ageDays = Math.floor((Date.now() - new Date(sku.created_at).getTime()) / 86400000);

        // Fetch the previous hot_score before overwriting it
        const { data: prevHotRow } = await supabase
          .from('hot_index')
          .select('hot_score')
          .eq('sku_id', sku.id)
          .single();

        const scores = computeHotScore({
          listings: listingCount,
          prevListings,
          velocity: listingCount - prevListings,
          age: ageDays,
          redditMentions: 0, // filled by weekly signal pipeline
          ebayWatchers: 0,   // filled by app-check pipeline
        });

        const delta = Math.round(scores.hot - (prevHotRow?.hot_score ?? scores.hot));

        // Upsert snapshot
        await supabase.from('daily_snapshots').upsert({
          sku_id: sku.id,
          snapshot_date: today,
          listing_count: listingCount,
          price_low: priceLow,
          price_median: priceMedian,
          price_high: priceHigh,
          velocity_score: scores.velocity,
          hot_score: scores.hot,
        });

        // Save canonical image from the first listing that has one
        if (!hasImage.has(sku.id)) {
          const imageUrl = listings.find((l: any) => l.image?.imageUrl)?.image?.imageUrl
            ?? listings.find((l: any) => l.thumbnailImages?.[0]?.imageUrl)?.thumbnailImages?.[0]?.imageUrl;
          if (imageUrl) {
            await supabase.from('product_images').upsert({
              sku_id: sku.id,
              url: imageUrl,
              source: 'ebay',
              is_canonical: true,
            }, { onConflict: 'sku_id,source' });
            hasImage.add(sku.id);
          }
        }

        // Upsert hot index
        await supabase.from('hot_index').upsert({
          sku_id: sku.id,
          hot_score: scores.hot,
          delta_24h: delta,
          momentum: delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat',
          velocity_score: scores.velocity,
          volume_score: scores.volume,
          confirmation_score: scores.confirmation,
          freshness_score: scores.freshness,
          updated_at: new Date().toISOString(),
        });

        processed.push(sku.id);
        await new Promise((r) => setTimeout(r, 500)); // rate limit
      } catch (skuErr) {
        console.error(`Failed SKU ${sku.id}:`, skuErr);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: processed.length, date: today }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
