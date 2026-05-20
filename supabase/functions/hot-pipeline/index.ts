// Trendnable Hot Pipeline — runs daily via cron
// Fetches eBay data for each active SKU, computes hot scores, updates hot_index.
// Also generates narratives for SKUs that don't have one yet.
// Logs every run to pipeline_runs with token usage and cost.
//
// Scoring formula (0-100):
//   velocity    (0-30): new listings per day vs. 7-day baseline
//   volume      (0-30): current listing count signal
//   confirmation(0-25): Reddit mentions + eBay watch count
//   freshness   (0-15): penalty for old SKUs (>90 days drops score)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { titlePassesTier1, effectivePrice, iqrMedian } from '../_shared/pipeline-utils.ts';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PIPELINE_SECRET          = Deno.env.get('PIPELINE_SECRET') ?? '';
const EBAY_CLIENT_ID           = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET       = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY        = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

// Claude Haiku 4.5 pricing (USD per token)
const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

// ── eBay ──────────────────────────────────────────────────────────────────────

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
  url.searchParams.set('filter', 'categoryIds:{220,64482},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('sort', 'price');
  url.searchParams.set('limit', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.itemSummaries ?? [];
}

// Finding API — completed/sold listings only.
// Uses convertedCurrentPrice for USD-normalised pricing regardless of seller currency.
async function fetchSoldListings(query: string, appId: string): Promise<any[]> {
  const params = new URLSearchParams({
    'OPERATION-NAME':        'findCompletedItems',
    'SERVICE-VERSION':       '1.13.0',
    'SECURITY-APPNAME':      appId,
    'RESPONSE-DATA-FORMAT':  'JSON',
    'REST-PAYLOAD':          '',
    'keywords':              query,
    'itemFilter(0).name':    'SoldItemsOnly',
    'itemFilter(0).value':   'true',
    'itemFilter(1).name':    'ListingType',
    'itemFilter(1).value':   'FixedPrice',
    'paginationInput.entriesPerPage': '100',
    'sortOrder':             'EndTimeSoonest',
  });
  const res = await fetch(
    `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`
  );
  if (!res.ok) {
    console.error(`Finding API error for "${query}":`, res.status);
    return [];
  }
  const data = await res.json();
  return data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeHotScore(params: {
  listings: number;
  prevListings: number;
  velocity: number;
  age: number;
  redditMentions: number;
  ebayWatchers: number;
}): { hot: number; velocity: number; volume: number; confirmation: number; freshness: number } {
  const { listings, prevListings, velocity, age, redditMentions, ebayWatchers } = params;

  const growthRate = prevListings > 0 ? (listings - prevListings) / prevListings : 0;
  const velocityScore = Math.min(30, Math.round(Math.max(0, growthRate * 100)));
  const volumeScore = Math.min(30, Math.round(Math.log10(Math.max(1, listings)) * 10));
  const confirmationScore = Math.min(25, redditMentions * 3 + Math.floor(ebayWatchers / 10));
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

// ── Narrative generation ───────────────────────────────────────────────────────

interface SkuMarketData {
  id: string;
  name: string;
  category_id: string;
  fandom_id: string | null;
  hot: number;
  delta: number;
  listings: number;
  priceLow: number;
  priceMedian: number;
  priceHigh: number;
  velocity: number;
  age: number;
}

async function generateNarratives(skus: SkuMarketData[]): Promise<{
  results: { sku_id: string; narrative: string }[];
  inputTokens: number;
  outputTokens: number;
}> {
  const BATCH = 15;
  const results: { sku_id: string; narrative: string }[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);

    const prompt = `Generate a 1–2 sentence market narrative for each collectible below. Be specific about what the market signals suggest (price trend, listing velocity, collector demand). Terse analyst tone, present tense, max 28 words per narrative.

Return ONLY a valid JSON array — no markdown, no explanation: [{sku_id, narrative}]

ITEMS:
${batch.map((s, idx) =>
  `${idx + 1}. sku_id="${s.id}" | ${s.name} (${s.category_id}${s.fandom_id ? ', ' + s.fandom_id : ''}) | hot=${s.hot} delta=${s.delta >= 0 ? '+' : ''}${s.delta} | listings=${s.listings} | price=$${s.priceLow}–$${s.priceHigh} median $${s.priceMedian} | velocity=${s.velocity}/30 | age=${s.age}d`
).join('\n')}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error('Claude narrative error:', res.status, await res.text());
      continue;
    }

    const data = await res.json();

    // Accumulate token usage
    inputTokens  += data.usage?.input_tokens  ?? 0;
    outputTokens += data.usage?.output_tokens ?? 0;

    const text: string = data.content?.[0]?.text ?? '[]';
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        results.push(
          ...parsed.filter((r: any) => r.sku_id && typeof r.narrative === 'string')
        );
      }
    } catch {
      console.error('Failed to parse narrative response:', text.slice(0, 200));
    }

    if (i + BATCH < skus.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return { results, inputTokens, outputTokens };
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const startTime = Date.now();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const token = await getEbayToken();

    const { data: skus, error } = await supabase
      .from('skus')
      .select('id, name, category_id, fandom_id, ebay_query, card_variant, card_grader, card_grade, created_at')
      .eq('is_active', true);

    const { data: existingImages } = await supabase
      .from('product_images')
      .select('sku_id')
      .eq('is_canonical', true);
    const hasImage = new Set((existingImages ?? []).map((r: any) => r.sku_id));

    const { data: existingNarratives } = await supabase
      .from('sku_narratives')
      .select('sku_id');
    const hasNarrative = new Set((existingNarratives ?? []).map((r: any) => r.sku_id as string));

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    const processed: string[] = [];
    const zeroPriceSkuIds: string[] = [];
    const skuMarketData: SkuMarketData[] = [];

    for (const sku of skus ?? []) {
      try {
        let query = sku.ebay_query || sku.name;
        if (sku.category_id === 'tcg' && sku.card_variant) {
          if (sku.card_variant === 'graded' && sku.card_grader) {
            query += sku.card_grade ? ` ${sku.card_grader} ${sku.card_grade}` : ` ${sku.card_grader}`;
          } else if (sku.card_variant === 'raw') {
            query += ' -PSA -BGS -CGC -SGC';
          }
        }

        // P5: Browse API = velocity/volume signal; Finding API = price signal
        const [listings, soldItems] = await Promise.all([
          fetchEbayListings(query, token),
          fetchSoldListings(query, EBAY_CLIENT_ID),
        ]);
        if (!listings) continue;

        const listingCount = listings.length;

        // P1: Build price set from sold listings (Finding API, convertedCurrentPrice = USD-normalised)
        // P2 Tier 1 + P4 shipping + P3 IQR applied to sold prices
        const soldPrices: number[] = [];
        for (const s of soldItems) {
          const title: string = s.title?.[0] ?? '';
          if (!titlePassesTier1(title)) continue;
          const itemPrice = parseFloat(
            s.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] ?? '0'
          );
          if (itemPrice <= 0) continue;
          const shippingCost = parseFloat(
            s.shippingInfo?.[0]?.shippingServiceCost?.[0]?.['__value__'] ?? '-1'
          );
          const shippingType: string | null = s.shippingInfo?.[0]?.shippingType?.[0] ?? null;
          soldPrices.push(effectivePrice(
            itemPrice,
            shippingCost >= 0 ? shippingCost : null,
            shippingType,
            sku.category_id,
          ));
        }

        // If sold data is too thin, fall back to Browse API active-listing prices
        let rawPrices: number[];
        if (soldPrices.length >= 3) {
          rawPrices = soldPrices;
        } else {
          rawPrices = [];
          for (const l of listings) {
            if (!titlePassesTier1(l.title ?? '')) continue;
            const itemPrice = parseFloat(l.price?.value ?? '0');
            if (itemPrice <= 0) continue;
            const shippingOpt = l.shippingOptions?.[0];
            const shippingCost = shippingOpt?.shippingCost?.value != null
              ? parseFloat(shippingOpt.shippingCost.value) : null;
            const shippingType: string | null = shippingOpt?.shippingCostType ?? null;
            rawPrices.push(effectivePrice(itemPrice, shippingCost, shippingType, sku.category_id));
          }
        }

        const { median: priceMedian, count: _mintCount, low: priceLow, high: priceHigh } =
          iqrMedian(rawPrices);

        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const { data: prevSnap } = await supabase
          .from('daily_snapshots')
          .select('listing_count')
          .eq('sku_id', sku.id)
          .eq('snapshot_date', yesterday)
          .single();

        const prevListings = prevSnap?.listing_count ?? listingCount;
        const ageDays = Math.floor((Date.now() - new Date(sku.created_at).getTime()) / 86400000);

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
          redditMentions: 0,
          ebayWatchers: 0,
        });

        const delta = Math.round(scores.hot - (prevHotRow?.hot_score ?? scores.hot));

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

        if (!hasImage.has(sku.id)) {
          const imageUrl =
            listings.find((l: any) => l.image?.imageUrl)?.image?.imageUrl ??
            listings.find((l: any) => l.thumbnailImages?.[0]?.imageUrl)?.thumbnailImages?.[0]?.imageUrl;
          if (imageUrl) {
            await supabase.from('product_images').upsert(
              { sku_id: sku.id, url: imageUrl, source: 'ebay', is_canonical: true },
              { onConflict: 'sku_id,source' }
            );
            hasImage.add(sku.id);
          }
        }

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

        if (!hasNarrative.has(sku.id)) {
          skuMarketData.push({
            id: sku.id,
            name: sku.name,
            category_id: sku.category_id,
            fandom_id: sku.fandom_id ?? null,
            hot: scores.hot,
            delta,
            listings: listingCount,
            priceLow,
            priceMedian,
            priceHigh,
            velocity: scores.velocity,
            age: ageDays,
          });
        }

        // Mark zero-price/no-listing SKUs for auto-deactivation
        if (priceMedian === 0 && listingCount === 0) {
          zeroPriceSkuIds.push(sku.id);
        }

        processed.push(sku.id);
        await new Promise((r) => setTimeout(r, 500));
      } catch (skuErr) {
        console.error(`Failed SKU ${sku.id}:`, skuErr);
      }
    }

    // Auto-deactivate SKUs that returned zero listings — likely delisted or bad query
    let autoDeactivated = 0;
    if (zeroPriceSkuIds.length > 0) {
      const { error: deactivateErr } = await supabase
        .from('skus')
        .update({ is_active: false })
        .in('id', zeroPriceSkuIds);
      if (deactivateErr) {
        console.error('Auto-deactivate error:', deactivateErr.message);
      } else {
        autoDeactivated = zeroPriceSkuIds.length;
        console.log(`Auto-deactivated ${autoDeactivated} zero-price SKUs:`, zeroPriceSkuIds.join(', '));
      }
    }

    // Generate narratives and track token usage
    let narrativesGenerated = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (skuMarketData.length > 0 && ANTHROPIC_API_KEY) {
      const { results: narratives, inputTokens, outputTokens } = await generateNarratives(skuMarketData);
      totalInputTokens  = inputTokens;
      totalOutputTokens = outputTokens;

      for (const n of narratives) {
        const { error: narrativeErr } = await supabase
          .from('sku_narratives')
          .upsert({ sku_id: n.sku_id, narrative: n.narrative }, { onConflict: 'sku_id', ignoreDuplicates: true });
        if (!narrativeErr) narrativesGenerated++;
      }
    }

    const durationMs = Date.now() - startTime;
    const costUsd = (totalInputTokens * HAIKU_INPUT_RATE) + (totalOutputTokens * HAIKU_OUTPUT_RATE);

    // Log run — non-blocking, don't let this fail the response
    supabase.from('pipeline_runs').insert({
      pipeline: 'hot-pipeline',
      duration_ms: durationMs,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      meta: {
        processed: processed.length,
        narratives_generated: narrativesGenerated,
        auto_deactivated: autoDeactivated,
        date: today,
      },
    }).then(({ error: logErr }) => {
      if (logErr) console.error('Failed to log pipeline run:', logErr.message);
    });

    return new Response(
      JSON.stringify({
        ok: true,
        processed: processed.length,
        narratives_generated: narrativesGenerated,
        auto_deactivated: autoDeactivated,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: Number(costUsd.toFixed(8)),
        duration_ms: durationMs,
        date: today,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
