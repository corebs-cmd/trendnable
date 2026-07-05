// Trendnable Vision Pipeline
// Photo → Claude Vision identification → eBay search → Claude classification
// → product_catalog upsert → ScanResult response.
//
// Auth: user JWT (Bearer). Premium users only — no quota, hard gate.


import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  catalogFingerprint,
  exclusiveTypeToVariantType,
} from '../_shared/pipeline-utils.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const SONNET_INPUT_RATE  = 3.00 / 1_000_000;
const SONNET_OUTPUT_RATE = 15.00 / 1_000_000;
const HAIKU_INPUT_RATE   = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE  = 4.00 / 1_000_000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  ok: true;
  catalog_id: string;
  sku_id: string | null;
  name: string;
  short: string;
  series: string | null;
  category_id: string;
  fandom_id: string | null;
  variant_type: string | null;
  pop_number: number | null;
  price: { low: number; median: number; high: number };
  listings: number;
  sold_count: number;
  sellability_score: number;
  score_estimate: number;
  score_breakdown: { velocity: number; volume: number; confirmation: number; freshness: number };
  is_new_to_catalog: boolean;
  quality_gate_passed: boolean;
  barcode: string | null;
  ebay_query: string;
  image_url: string | null;
}

interface ScanError {
  ok: false;
  error: string;
  message?: string;
}

type ScanResponse = ScanResult | ScanError;

// ── eBay helpers (shared with scan-pipeline) ──────────────────────────────────

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
  if (!data.access_token) throw new Error(`eBay auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function searchEbay(query: string, token: string): Promise<{ items: any[]; total: number }> {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('filter', 'categoryIds:{220,64482},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('sort', 'watchCountDesc');
  url.searchParams.set('limit', '20');
  url.searchParams.set('fieldgroups', 'EXTENDED');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { items: [], total: 0 };
  const data = await res.json();
  return { items: data.itemSummaries ?? [], total: data.total ?? 0 };
}

async function searchEbaySold(query: string): Promise<{
  count: number; low: number; median: number; high: number;
}> {
  const qs = [
    `OPERATION-NAME=findCompletedItems`,
    `SERVICE-VERSION=1.0.0`,
    `SECURITY-APPNAME=${encodeURIComponent(EBAY_CLIENT_ID)}`,
    `RESPONSE-DATA-FORMAT=JSON`,
    `GLOBAL-ID=EBAY-US`,
    `keywords=${encodeURIComponent(query)}`,
    `itemFilter(0).name=SoldItemsOnly`,
    `itemFilter(0).value=true`,
    `paginationInput.entriesPerPage=50`,
    `paginationInput.pageNumber=1`,
    `sortOrder=EndTimeSoonest`,
  ].join('&');

  try {
    const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${qs}`);
    if (!res.ok) return { count: 0, low: 0, median: 0, high: 0 };
    const data = await res.json();
    const resp = data?.findCompletedItemsResponse?.[0];
    if (resp?.ack?.[0] !== 'Success' && resp?.ack?.[0] !== 'SuccessWithWarning') return { count: 0, low: 0, median: 0, high: 0 };

    const count = parseInt(resp?.paginationOutput?.[0]?.totalEntries?.[0] ?? '0', 10) || 0;
    const items: any[] = resp?.searchResult?.[0]?.item ?? [];
    const prices = items
      .map((item: any) => parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? '0'))
      .filter((p: number) => p > 1)
      .sort((a: number, b: number) => a - b);

    if (prices.length === 0) return { count, low: 0, median: 0, high: 0 };
    const low  = prices[0];
    const high = prices[prices.length - 1];
    const mid  = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
    return { count, low: Math.round(low), median: Math.round(median), high: Math.round(high) };
  } catch {
    return { count: 0, low: 0, median: 0, high: 0 };
  }
}

// ── Step 1: Claude Vision — identify the item from the photo ──────────────────

interface VisionIdentification {
  identified: boolean;
  candidate_name: string;
  category: string;
  ebay_query: string;
  confidence: 'high' | 'medium' | 'low';
  visible_text: string;
  inputTokens: number;
  outputTokens: number;
}

async function identifyWithVision(imageBase64: string): Promise<VisionIdentification> {
  const prompt = `You are an expert collectibles identifier. Examine this image of a collectable item carefully.

Your task:
1. Read ALL visible text in the image (character name, series, item number, brand, any labels)
2. Identify the type of collectable
3. Produce a specific, searchable name

Supported categories:
- funko: Funko Pop vinyl figures (box usually shows character name and #number)
- tcg: Trading cards (Pokémon, Magic: The Gathering, Yu-Gi-Oh, sports cards)
- popmart: Pop Mart / Labubu figures
- hottoys: Hot Toys 1/6 scale figures (MMS/DX codes)
- neca: NECA action figures
- hwheels: Hot Wheels die-cast cars
- other: any other collectable

Return ONLY this JSON:
{
  "identified": true,
  "candidate_name": "most specific name (e.g. 'Funko Pop Iron Man #4', 'Charizard VMAX Secret Rare', 'Pop Mart Labubu Forest Series')",
  "category": "funko | tcg | popmart | hottoys | neca | hwheels | other",
  "ebay_query": "search string to find this exact item on eBay",
  "confidence": "high | medium | low",
  "visible_text": "all text readable in the image"
}

If you cannot identify a collectable at all, return:
{"identified": false, "candidate_name": "", "category": "other", "ebay_query": "", "confidence": "low", "visible_text": ""}`;

  const visionController = new AbortController();
  const visionTimeout = setTimeout(() => visionController.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      signal: visionController.signal,
    });
  } catch (err: any) {
    clearTimeout(visionTimeout);
    console.error('Claude Vision fetch error:', err?.message);
    return { identified: false, candidate_name: '', category: 'other', ebay_query: '', confidence: 'low', visible_text: '', inputTokens: 0, outputTokens: 0 };
  }
  clearTimeout(visionTimeout);

  const inputTokens  = 0;
  const outputTokens = 0;

  if (!res.ok) {
    console.error('Claude Vision error:', res.status, await res.text());
    return { identified: false, candidate_name: '', category: 'other', ebay_query: '', confidence: 'low', visible_text: '', inputTokens, outputTokens };
  }

  const data = await res.json();
  const iT = data.usage?.input_tokens  ?? 0;
  const oT = data.usage?.output_tokens ?? 0;
  const text: string = data.content?.[0]?.text ?? '{}';

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { identified: false, candidate_name: '', category: 'other', ebay_query: '', confidence: 'low', visible_text: '', inputTokens: iT, outputTokens: oT };
    const parsed = JSON.parse(match[0]);
    return { ...parsed, inputTokens: iT, outputTokens: oT };
  } catch {
    return { identified: false, candidate_name: '', category: 'other', ebay_query: '', confidence: 'low', visible_text: '', inputTokens: iT, outputTokens: oT };
  }
}

// ── Step 2: Claude classification (same as scan-pipeline) ─────────────────────

async function classifyWithClaude(
  targetName: string,
  categoryId: string,
  listings: any[],
): Promise<{ candidate: any | null; inputTokens: number; outputTokens: number }> {

  const FANDOMS = 'onepiece, demon, starwars, pokemon, marvel, anime, labubu, disney, dc, gaming, tmnt, popcult';

  const categoryRules: Record<string, string> = {
    funko: `Extract Pop number from title (e.g. #1578). Format name as "Character [#XXXX]". Identify exclusive_type: "chase"|"gitd"|"convention"|"retailer"|"vaulted"|"grail"|"rare_variant"|"signed"|"limited"|"htf"|null`,
    tcg: `Do NOT include print numbers in the name. Format: "Card Name + Set + Rarity". Identify card_variant: "raw"|"graded". If graded, extract card_grader and card_grade.`,
    popmart: `Identify figure name and series. Note secret/hidden figures and limited editions.`,
    hottoys: `Include MMS/DX code if visible. Note scale and exclusive variants.`,
    neca: `Include scale. Note Ultimate, convention, or retailer exclusive variants.`,
    hwheels: `Identify Super Treasure Hunt (STH), Treasure Hunt (TH), or premium series. Note year and casting.`,
  };

  const rules = categoryRules[categoryId] ?? '';

  const prompt = `You are a collectibles market analyst. Find the best matching eBay listing for this product and classify it.

TARGET: "${targetName}"
CATEGORY: ${categoryId}
KNOWN FANDOMS: ${FANDOMS}

${rules}

APPROVE if it is a specific, identifiable collectible worth price-tracking.
REJECT if listings are generic, lots, bundles, or not a real collectible.

Return ONLY valid JSON:
{
  "approved": true | false,
  "rejection_reason": "why (if not approved)",
  "category_id": "funko|tcg|popmart|hottoys|neca|hwheels|autographed|thrilljoy",
  "name": "canonical product name",
  "short": "nickname max 18 chars",
  "series": "product line / set",
  "fandom_id": "from known fandoms or null",
  "ebay_query": "refined search for ongoing tracking",
  "price_median": <number>,
  "price_low": <number>,
  "price_high": <number>,
  "exclusive_type": null,
  "card_variant": null,
  "card_grader": null,
  "card_grade": null,
  "pop_number_found": null
}

LISTINGS:
${listings.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'}`
).join('\n')}

Return ONLY valid JSON.`;

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
    console.error('Claude classify error:', res.status);
    return { candidate: null, inputTokens: 0, outputTokens: 0 };
  }

  const data = await res.json();
  const iT = data.usage?.input_tokens  ?? 0;
  const oT = data.usage?.output_tokens ?? 0;
  const text: string = data.content?.[0]?.text ?? '{}';

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { candidate: null, inputTokens: iT, outputTokens: oT };
    return { candidate: JSON.parse(match[0]), inputTokens: iT, outputTokens: oT };
  } catch {
    return { candidate: null, inputTokens: iT, outputTokens: oT };
  }
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function calcSellabilityScore(soldCount: number, activeTotal: number, priceMedian: number, listings: any[]): number {
  const hasSoldData = soldCount > 0;
  const stPct = hasSoldData ? (4 + soldCount) / (10 + soldCount + Math.max(activeTotal, 1)) * 100 : 0;
  const priceScore = priceMedian < 10 ? 0 : Math.min(100, Math.round((Math.log10(priceMedian) - 1) / (3 - 1) * 100));
  const watches = listings.map((l: any) => Number(l.watchCount ?? 0));
  const avgWatches = watches.length > 0 ? watches.reduce((a: number, b: number) => a + b, 0) / watches.length : 0;
  const watchScore = Math.min(100, Math.round(avgWatches / 25 * 100));
  const score = hasSoldData ? stPct * 0.25 + priceScore * 0.45 + watchScore * 0.30 : priceScore * 0.60 + watchScore * 0.40;
  return Math.max(1, Math.min(100, Math.round(score)));
}

function estimateHotScore(listings: any[]): { score: number; breakdown: { velocity: number; volume: number; confirmation: number; freshness: number } } {
  const volumeScore = Math.min(30, listings.length * 1.5);
  const watches = listings.map((l) => Number(l.watchCount ?? 0));
  const avgWatches = watches.length > 0 ? watches.reduce((a, b) => a + b, 0) / watches.length : 0;
  const totalWatches = watches.reduce((a, b) => a + b, 0);
  const velocityScore     = Math.min(30, avgWatches * 0.8);
  const confirmationScore = Math.min(25, totalWatches / 8);
  const freshnessScore    = listings.length >= 3 ? 8 : 4;
  return {
    score: Math.min(100, Math.round(volumeScore + velocityScore + confirmationScore + freshnessScore)),
    breakdown: {
      velocity:     Math.round(velocityScore),
      volume:       Math.round(volumeScore),
      confirmation: Math.round(confirmationScore),
      freshness:    freshnessScore,
    },
  };
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

function json(body: ScanResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  const userJwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Premium gate ──────────────────────────────────────────────────────────────
  const { data: userRow } = await svc
    .from('users')
    .select('is_premium')
    .eq('id', userId)
    .single();

  if (!userRow?.is_premium) {
    return json({
      ok: false,
      error: 'premium_required',
      message: 'Visual Scan is a Premium feature. Upgrade to unlock it.',
    }, 403);
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const imageBase64 = (body.imageBase64 ?? '').trim();
  if (!imageBase64 || imageBase64.length < 100) {
    return json({ ok: false, error: 'imageBase64 is required' }, 400);
  }

  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  try {
    // ── Step 1: Claude Vision identification + eBay token (parallel) ────────────
    // getEbayToken() is independent of vision output — run both simultaneously.
    const [vision, ebayToken] = await Promise.all([
      identifyWithVision(imageBase64),
      getEbayToken(),
    ]);
    totalInputTokens  += vision.inputTokens;
    totalOutputTokens += vision.outputTokens;

    if (!vision.identified || !vision.candidate_name || !vision.ebay_query) {
      return json({
        ok: false,
        error: 'not_found',
        message: "Couldn't identify this item from the photo. Try a clearer angle showing the front of the packaging.",
      });
    }

    // ── Step 2: eBay search ───────────────────────────────────────────────────
    const { items: listings, total: ebayTotal } = await searchEbay(vision.ebay_query, ebayToken);
    const imageUrl = listings.find((l: any) => l?.image?.imageUrl)?.image?.imageUrl ?? null;

    if (listings.length === 0) {
      return json({
        ok: false,
        error: 'not_found',
        message: 'Item identified but no eBay listings found. It may be too rare or not yet tracked.',
      });
    }

    // ── Step 3: Claude classification ─────────────────────────────────────────
    const { candidate, inputTokens: iT, outputTokens: oT } = await classifyWithClaude(
      vision.candidate_name,
      vision.category,
      listings,
    );
    totalInputTokens  += iT;
    totalOutputTokens += oT;

    if (!candidate?.approved) {
      return json({
        ok: false,
        error: 'not_found',
        message: candidate?.rejection_reason ?? 'Item could not be confirmed as a trackable collectable.',
      });
    }

    const finalCategoryId = candidate.category_id ?? vision.category;
    const ebayQuery = candidate.ebay_query ?? vision.ebay_query;

    // ── Step 4: Precise pricing search ───────────────────────────────────────
    const [preciseResult, soldData] = await Promise.all([
      searchEbay(ebayQuery, ebayToken),
      searchEbaySold(ebayQuery),
    ]);

    const soldCount   = soldData.count;
    const activeTotal = preciseResult.total > 0 ? preciseResult.total : ebayTotal;
    const sellabilityListings = preciseResult.items.length > 0 ? preciseResult.items : listings;

    // ── Step 5: Scoring — use actual sold prices when available ───────────────
    const claudeMedian = Number(candidate.price_median ?? 0);
    const priceMedian  = soldData.median > 0 ? soldData.median : claudeMedian;
    const priceLow     = soldData.low    > 0 ? soldData.low    : Number(candidate.price_low  ?? priceMedian);
    const priceHigh    = soldData.high   > 0 ? soldData.high   : Number(candidate.price_high ?? priceMedian);

    const sellabilityScore = calcSellabilityScore(soldCount, activeTotal, priceMedian, sellabilityListings);
    const { score: scoreEstimate, breakdown: scoreBreakdown } = estimateHotScore(listings);

    const qualityGatePassed = candidate.approved === true && priceMedian >= 15 && activeTotal >= 5;

    // ── Step 6: Upsert product_catalog ────────────────────────────────────────
    const finalName = candidate.name ?? vision.candidate_name;

    const popNumber = finalCategoryId === 'funko'
      ? parseInt(finalName.match(/\[#(\d+)\]/)?.[1] ?? '') || null
      : null;

    const variantType = finalCategoryId === 'funko'
      ? exclusiveTypeToVariantType(candidate.exclusive_type ?? null)
      : null;

    const fingerprint = catalogFingerprint(finalCategoryId, finalName, {
      popNumber,
      variantType,
      cardVariant: candidate.card_variant ?? null,
      cardGrader:  candidate.card_grader  ?? null,
      cardGrade:   candidate.card_grade   ?? null,
    });

    const { data: upsertedRows, error: upsertErr } = await svc
      .from('product_catalog')
      .upsert(
        {
          fingerprint,
          name:             finalName,
          short:            candidate.short ?? finalName.slice(0, 18),
          category_id:      finalCategoryId,
          fandom_id:        candidate.fandom_id  ?? null,
          series:           candidate.series     ?? null,
          pop_number:       popNumber,
          variant_type:     variantType,
          exclusive_type:   candidate.exclusive_type ?? null,
          card_variant:     candidate.card_variant   ?? null,
          card_grader:      candidate.card_grader    ?? null,
          card_grade:       candidate.card_grade     ?? null,
          ebay_query:       ebayQuery,
          price_latest:     priceMedian,
          price_updated_at: new Date().toISOString(),
          image_url:        imageUrl,
          source:           'vision',
          last_seen_at:     new Date().toISOString(),
        },
        { onConflict: 'fingerprint' },
      )
      .select('id, sku_id')
      .single();

    if (upsertErr || !upsertedRows) {
      console.error('product_catalog upsert failed:', upsertErr?.message);
      return json({ ok: false, error: 'catalog_upsert_failed' }, 500);
    }

    const catalogId = upsertedRows.id    as string;
    const skuId     = upsertedRows.sku_id as string | null;

    // ── Step 7: Log to pipeline_runs ─────────────────────────────────────────
    const visionCost   = (vision.inputTokens * HAIKU_INPUT_RATE) + (vision.outputTokens * HAIKU_OUTPUT_RATE);
    const classifyCost = (iT * HAIKU_INPUT_RATE) + (oT * HAIKU_OUTPUT_RATE);
    const costUsd = visionCost + classifyCost;

    svc.from('pipeline_runs').insert({
      pipeline: 'vision-pipeline',
      input_tokens:  totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd:      costUsd,
      meta: {
        catalog_id:          catalogId,
        sku_id:              skuId,
        quality_gate_passed: qualityGatePassed,
        user_id:             userId,
        vision_confidence:   vision.confidence,
        score_estimate:      scoreEstimate,
        source:              'vision',
      },
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('Failed to log pipeline run:', logErr.message);
    });

    // ── Step 8: Return ScanResult ─────────────────────────────────────────────
    return json({
      ok: true,
      catalog_id: catalogId,
      sku_id: skuId,
      name: finalName,
      short: candidate.short ?? finalName.slice(0, 18),
      series: candidate.series ?? null,
      category_id: finalCategoryId,
      fandom_id: candidate.fandom_id ?? null,
      variant_type: variantType,
      pop_number: popNumber,
      price: { low: priceLow, median: priceMedian, high: priceHigh },
      active_listings: activeTotal,
      listings: activeTotal,
      sold_count: soldCount,
      sellability_score: sellabilityScore,
      score_estimate: scoreEstimate,
      score_breakdown: scoreBreakdown,
      is_new_to_catalog: true,
      quality_gate_passed: qualityGatePassed,
      barcode: null,
      ebay_query: ebayQuery,
      image_url: imageUrl,
    });

  } catch (err) {
    console.error('Vision pipeline error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
