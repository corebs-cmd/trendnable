// Trendnable Scan Pipeline
// Barcode → product name lookup → eBay Browse search → Claude classification
// → product_catalog upsert → ScanResult response.
//
// Auth: user JWT (Bearer). Rate limiting/logging via user_id in meta.
// TCG barcodes are rejected at classification time (tcg_excluded error).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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

// Claude Haiku 4.5 pricing (USD per token)
const HAIKU_INPUT_RATE  = 0.80 / 1_000_000;
const HAIKU_OUTPUT_RATE = 4.00 / 1_000_000;

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
  score_estimate: number;
  score_breakdown: { velocity: number; volume: number; confirmation: number; freshness: number };
  is_new_to_catalog: boolean;
  quality_gate_passed: boolean;
  barcode: string;
  ebay_query: string;
  image_url: string | null;
}

interface ScanError {
  ok: false;
  error: string;
  message?: string;
}

type ScanResponse = ScanResult | ScanError;

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
  if (!data.access_token) throw new Error(`eBay auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

/**
 * Step 4: eBay Finding API — UPC product lookup.
 * Returns the title of the best matching product, or null if not found.
 */
async function lookupBarcodeOnEbay(barcode: string): Promise<string | null> {
  const url = new URL('https://svcs.ebay.com/services/search/FindingService/v1');
  url.searchParams.set('OPERATION-NAME', 'findItemsByProduct');
  url.searchParams.set('SERVICE-VERSION', '1.0.0');
  url.searchParams.set('SECURITY-APPNAME', EBAY_CLIENT_ID);
  url.searchParams.set('RESPONSE-DATA-FORMAT', 'JSON');
  url.searchParams.set('productId.@type', 'UPC');
  url.searchParams.set('productId', barcode);
  url.searchParams.set('paginationInput.entriesPerPage', '5');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn('eBay Finding API non-OK:', res.status);
      return null;
    }
    const data = await res.json();
    const item = data?.findItemsByProductResponse?.[0]
      ?.searchResult?.[0]?.item?.[0];
    return item?.title?.[0] ?? null;
  } catch (err) {
    console.warn('eBay Finding API error:', err);
    return null;
  }
}

/**
 * Step 5: UPCitemdb fallback — free trial endpoint, no auth required.
 * Returns the title of the first result, or null if not found.
 */
async function lookupBarcodeOnUpcItemDb(barcode: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`
    );
    if (!res.ok) {
      console.warn('UPCitemdb non-OK:', res.status);
      return null;
    }
    const data = await res.json();
    return data?.items?.[0]?.title ?? null;
  } catch (err) {
    console.warn('UPCitemdb error:', err);
    return null;
  }
}

/**
 * Step 6: eBay Browse API search — same params as spotlight-pipeline.
 */
async function searchEbay(query: string, token: string): Promise<any[]> {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('filter', 'categoryIds:{220,64482},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('sort', 'watchCountDesc');
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error('eBay Browse search failed:', res.status);
    return [];
  }
  const data = await res.json();
  return data.itemSummaries ?? [];
}

// ── Category inference ────────────────────────────────────────────────────────

/**
 * Infer a likely category_id from the product name so we can pass a hint to Claude.
 * Claude may override this during classification.
 */
function inferCategoryFromName(name: string): string {
  const lower = name.toLowerCase();
  // Signed/autographed detection takes priority — check before funko
  if (/\b(signed|autograph|auto\b|hand.signed|coa|jsa|beckett\s+auth)\b/i.test(lower)) return 'autographed';
  if (/thrilljoy/i.test(lower))                                          return 'thrilljoy';
  if (/funko\s+pop/i.test(lower))                                        return 'funko';
  if (/\b(pokemon|magic.*(gathering|card)|yugioh|yu-gi-oh)\b/i.test(lower)) return 'tcg';
  if (/\bpop\s*mart\b/i.test(lower))                                     return 'popmart';
  if (/\bhot\s+toys\b/i.test(lower))                                     return 'hottoys';
  if (/\bneca\b/i.test(lower))                                            return 'neca';
  if (/\bhot\s+wheels\b/i.test(lower))                                   return 'hwheels';
  return 'funko'; // safe default for collectibles; Claude will correct
}

function buildEbayQuery(name: string, category_id: string): string {
  const n = name.trim();
  switch (category_id) {
    case 'funko':        return `Funko Pop ${n}`;
    case 'tcg':          return `${n} card`;
    case 'popmart':      return `Pop Mart ${n}`;
    case 'hottoys':      return `Hot Toys ${n}`;
    case 'neca':         return `NECA ${n}`;
    case 'hwheels':      return `Hot Wheels ${n}`;
    case 'autographed':  return `${n} signed autographed COA`;
    case 'thrilljoy':    return `ThrillJoy ${n}`;
    default:             return n;
  }
}

// ── Claude classification ─────────────────────────────────────────────────────

async function classifyWithClaude(
  targetName: string,
  categoryId: string,
  fandomId: string | null,
  listings: any[],
): Promise<{ candidate: any | null; inputTokens: number; outputTokens: number }> {

  const FANDOMS = 'onepiece (One Piece only), demon (Demon Slayer only), starwars, pokemon, marvel, anime (My Hero Academia/MHA, Jujutsu Kaisen/JJK, Naruto, Dragon Ball/DBZ, Attack on Titan, Bleach, or any other anime not covered by onepiece/demon), labubu, disney, dc, gaming, tmnt (Teenage Mutant Ninja Turtles — use for any TMNT/Ninja Turtles collectible), popcult (Pop Culture: Stranger Things, Terminator, RoboCop, Ghostbusters, Back to the Future, Alien, Predator, Halloween, Friday 13th, Nightmare on Elm Street, IT, any horror franchise, cult classics, movies & shows)';

  const categoryRules: Record<string, string> = {
    funko: `FUNKO RULES:
- You MUST extract the Pop number from the title (e.g. #1578). Format name as "Character [#XXXX]".
- If no Pop number is visible in any listing title, set pop_number_found: false.
- Identify exclusive_type: "chase" | "gitd" | "convention" | "retailer" | "vaulted" | "grail" | "rare_variant" | "signed" | "limited" | "htf" | null`,

    tcg: `TCG RULES:
- Do NOT include card print numbers (e.g. "272/217") in the canonical name or short. Identify the card as: Card Name + Set Name + Rarity/Variant. Example: "Mega Meganium EX Stellar Crown Secret Rare Full Art", NOT "Mega Meganium EX 272/217 Stellar Crown Secret Rare Full Art".
- Identify card_variant: "raw" (ungraded) or "graded" (PSA/BGS/CGC/SGC).
- If graded, extract card_grader (e.g. "PSA") and card_grade (e.g. "10").
- The ebay_query may include the card number for more accurate price lookups.`,

    popmart: `POP MART RULES:
- Identify the specific figure name and series.
- Note if it's a secret/hidden figure, limited edition, or chase variant.`,

    hottoys: `HOT TOYS RULES:
- Include the MMS/DX product code if visible.
- Note the scale (1/6) and any exclusive variants.`,

    neca: `NECA RULES:
- Include the scale (7-inch, 8-bit, etc.) if visible.
- Note any Ultimate, convention, or Target exclusive variants.`,

    hwheels: `HOT WHEELS RULES:
- Identify if it's a Super Treasure Hunt (STH), Treasure Hunt (TH), or premium series.
- Note the year and casting name.`,

    autographed: `SIGNED & AUTOGRAPHED RULES:
- This category covers any signed or autographed collectible: cards, figures, Funko Pops, comics, prints, etc.
- Name format: "Item Name Signed" or "Item Name Autographed" (e.g. "Charizard Holo Base Set Signed PSA Auth").
- Authentication is required: COA, JSA, Beckett, PSA, SGC auth, or similar. REJECT if no authentication.
- Note the authenticator (JSA, Beckett, PSA Auth, etc.) in the series field.`,

    thrilljoy: `THRILLJOY RULES:
- ThrillJoy is a designer toy brand similar to Pop Mart.
- Identify the specific figure name and series/collection.
- Note if it's a secret/hidden figure, limited edition, or chase variant.`,
  };

  const rules = categoryRules[categoryId] ?? '';

  const prompt = `You are a collectibles market analyst. The user is researching a specific product they believe is trending. Your job is to find the best matching listing from the eBay results and classify it.

TARGET PRODUCT: "${targetName}"
CATEGORY: ${categoryId}
${fandomId ? `FANDOM HINT: ${fandomId}` : ''}

KNOWN FANDOMS: ${FANDOMS}

${rules}

GENERAL RULES:
- Find the listing that best matches the target product name.
- APPROVE if it is a specific, identifiable collectible worth price-tracking.
- REJECT if listings show only generic/unrelated items, lots, bundles, bootlegs, or the product simply isn't a collectible.
- Price signal: if the best match is $50+ it is almost certainly worth tracking.

OUTPUT — return a single JSON object (not an array):
{
  "approved": true | false,
  "rejection_reason": "why rejected (if not approved)",
  "category_id": "funko" | "tcg" | "popmart" | "hottoys" | "neca" | "hwheels" | "autographed" | "thrilljoy",
  "name": "canonical product name",
  "short": "nickname max 18 chars",
  "series": "product line / set",
  "fandom_id": "best match from known fandoms or null",
  "ebay_query": "refined search string for ongoing tracking",
  "price_median": <number from listings>,
  "price_low": <number>,
  "price_high": <number>,
  "reasoning": "one sentence on why this is worth tracking",
  "exclusive_type": null,
  "card_variant": null,
  "card_grader": null,
  "card_grade": null,
  "pop_number_found": null
}

Fill in the category-specific fields (exclusive_type for funko, card_variant for tcg, etc.). Leave others null.

LISTINGS (top matches for "${targetName}"):
${listings.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'}`
).join('\n')}

Return ONLY valid JSON. No markdown, no explanation.`;

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
    console.error('Claude error:', res.status, await res.text());
    return { candidate: null, inputTokens: 0, outputTokens: 0 };
  }

  const data = await res.json();
  const inputTokens  = data.usage?.input_tokens  ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;
  const text: string = data.content?.[0]?.text ?? '{}';

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { candidate: null, inputTokens, outputTokens };
    return { candidate: JSON.parse(match[0]), inputTokens, outputTokens };
  } catch {
    console.error('Failed to parse Claude response:', text.slice(0, 200));
    return { candidate: null, inputTokens, outputTokens };
  }
}

// ── Hot score estimate ────────────────────────────────────────────────────────

function estimateHotScore(listings: any[]): {
  score: number;
  breakdown: { velocity: number; volume: number; confirmation: number; freshness: number };
} {
  const volumeScore = Math.min(30, listings.length * 1.5);

  const watches = listings.map((l) => Number(l.watchCount ?? 0));
  const avgWatches = watches.length > 0
    ? watches.reduce((a, b) => a + b, 0) / watches.length
    : 0;
  const totalWatches = watches.reduce((a, b) => a + b, 0);

  const velocityScore     = Math.min(30, avgWatches * 0.8);
  const confirmationScore = Math.min(25, totalWatches / 8);
  const freshnessScore    = listings.length >= 3 ? 8 : 4;

  const score = Math.round(volumeScore + velocityScore + confirmationScore + freshnessScore);

  return {
    score: Math.min(100, score),
    breakdown: {
      velocity:     Math.round(velocityScore),
      volume:       Math.round(volumeScore),
      confirmation: Math.round(confirmationScore),
      freshness:    freshnessScore,
    },
  };
}

// ── JSON response helpers ─────────────────────────────────────────────────────

function json(body: ScanResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  // ── Step 1: Auth ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  const userJwt = authHeader.slice(7);

  // Verify user JWT and extract user.id
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  const userId = user.id;

  // Service-role client for all DB writes + catalog reads
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Step 2: Parse + validate body ────────────────────────────────────────────
  let body: { barcode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const barcode = (body.barcode ?? '').trim();
  if (!/^\d{6,14}$/.test(barcode)) {
    return json({ ok: false, error: 'barcode must be 6-14 digits' }, 400);
  }

  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    // ── Step 3: Cache check ───────────────────────────────────────────────────
    const { data: cachedRows, error: cacheErr } = await svc
      .from('product_catalog')
      .select('*')
      .eq('barcode', barcode)
      .limit(1);

    if (cacheErr) {
      console.warn('Cache check error:', cacheErr.message);
    }

    const cached = cachedRows?.[0] ?? null;

    if (cached && cached.sku_id) {
      // Full cache hit — also fetch the SKU for richer data
      const { data: sku } = await svc
        .from('skus')
        .select('*')
        .eq('id', cached.sku_id)
        .single();

      // Increment scan_count non-blocking
      svc.from('product_catalog')
        .update({ scan_count: (cached.scan_count ?? 0) + 1 })
        .eq('id', cached.id)
        .then(({ error: scErr }) => {
          if (scErr) console.warn('scan_count increment failed:', scErr.message);
        });

      // Log to pipeline_runs
      svc.from('pipeline_runs').insert({
        pipeline: 'scan-pipeline',
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        meta: {
          barcode,
          catalog_id: cached.id,
          sku_id: cached.sku_id,
          is_new: false,
          quality_gate_passed: false,
          user_id: userId,
          cache_hit: true,
        },
      }).then(({ error: logErr }) => {
        if (logErr) console.warn('Failed to log pipeline run:', logErr.message);
      });

      const { score, breakdown } = estimateHotScore([]);
      return json({
        ok: true,
        catalog_id: cached.id,
        sku_id: cached.sku_id,
        name: cached.name,
        short: cached.short ?? cached.name.slice(0, 18),
        series: cached.series ?? sku?.series ?? null,
        category_id: cached.category_id,
        fandom_id: cached.fandom_id ?? null,
        variant_type: cached.variant_type ?? null,
        pop_number: cached.pop_number ?? null,
        price: {
          low:    Number(cached.price_latest ?? 0),
          median: Number(cached.price_latest ?? 0),
          high:   Number(cached.price_latest ?? 0),
        },
        listings: 0,
        score_estimate: score,
        score_breakdown: breakdown,
        is_new_to_catalog: false,
        quality_gate_passed: false,
        barcode,
        ebay_query: cached.ebay_query ?? cached.name,
        image_url: cached.image_url ?? null,
      });
    }

    // Partial cache hit (no sku_id) — still run fresh pricing
    const isNewToCache = !cached;

    // ── Step 4: eBay Finding API barcode lookup ───────────────────────────────
    let productName: string | null = null;

    if (cached && !cached.sku_id) {
      // Use the cached name as the search term
      productName = cached.name;
    } else {
      productName = await lookupBarcodeOnEbay(barcode);
    }

    // ── Step 5: UPCitemdb fallback ────────────────────────────────────────────
    if (!productName) {
      productName = await lookupBarcodeOnUpcItemDb(barcode);
    }

    if (!productName) {
      return json({
        ok: false,
        error: 'not_found',
        message: 'No product found for this barcode.',
      });
    }

    // ── Step 6: eBay Browse API search ────────────────────────────────────────
    const inferredCategory = inferCategoryFromName(productName);
    const ebayQueryInitial = buildEbayQuery(productName, inferredCategory);

    const ebayToken  = await getEbayToken();
    const listings   = await searchEbay(ebayQueryInitial, ebayToken);
    const imageUrl   = listings.find((l: any) => l?.image?.imageUrl)?.image?.imageUrl ?? null;

    // ── Step 7: Claude classification ─────────────────────────────────────────
    const { candidate, inputTokens: iT, outputTokens: oT } = await classifyWithClaude(
      productName,
      inferredCategory,
      null,
      listings,
    );
    inputTokens  += iT;
    outputTokens += oT;

    if (!candidate) {
      return json({ ok: false, error: 'not_found', message: 'No product found for this barcode.' });
    }

    // TCG gate — return before any DB write
    if ((candidate.category_id ?? inferredCategory) === 'tcg') {
      return json({
        ok: false,
        error: 'tcg_excluded',
        message: 'TCG cards cannot be scanned — use search instead.',
      });
    }

    if (!candidate.approved) {
      return json({
        ok: false,
        error: 'not_found',
        message: candidate.rejection_reason ?? 'No product found for this barcode.',
      });
    }

    const finalCategoryId = candidate.category_id ?? inferredCategory;
    const ebayQuery = candidate.ebay_query ?? buildEbayQuery(candidate.name ?? productName, finalCategoryId);

    // ── Step 8: Hot score estimate ────────────────────────────────────────────
    const { score: scoreEstimate, breakdown: scoreBreakdown } = estimateHotScore(listings);

    // ── Step 9: Quality gates + discovery_candidate insert ───────────────────
    const priceMedian = Number(candidate.price_median ?? 0);
    const priceLow    = Number(candidate.price_low    ?? priceMedian);
    const priceHigh   = Number(candidate.price_high   ?? priceMedian);

    const qualityGatePassed =
      candidate.approved === true &&
      priceMedian >= 15 &&
      listings.length >= 5;

    if (qualityGatePassed) {
      // Check if a candidate with this name already exists
      const { data: existingCand } = await svc
        .from('discovery_candidates')
        .select('id')
        .ilike('name', candidate.name ?? productName)
        .limit(1)
        .single();

      if (!existingCand) {
        const popNum = finalCategoryId === 'funko'
          ? parseInt((candidate.name ?? '').match(/\[#(\d+)\]/)?.[1] ?? '') || null
          : null;

        svc.from('discovery_candidates').insert({
          name:       candidate.name ?? productName,
          category_id: finalCategoryId,
          fandom_id:  candidate.fandom_id ?? null,
          ebay_count: listings.length,
          reddit_mentions: 0,
          status: 'new',
          evidence_json: {
            short:          candidate.short,
            series:         candidate.series,
            ebay_query:     ebayQuery,
            price_median:   priceMedian,
            price_low:      priceLow,
            price_high:     priceHigh,
            reasoning:      candidate.reasoning,
            barcode,
            source:         'scan',
            ...(finalCategoryId === 'tcg' && candidate.card_variant ? { card_variant: candidate.card_variant } : {}),
            ...(finalCategoryId === 'tcg' && candidate.card_grader  ? { card_grader:  candidate.card_grader  } : {}),
            ...(finalCategoryId === 'tcg' && candidate.card_grade   ? { card_grade:   candidate.card_grade   } : {}),
            ...(finalCategoryId === 'funko' && candidate.exclusive_type ? { exclusive_type: candidate.exclusive_type } : {}),
            ...(popNum != null ? { pop_number: popNum } : {}),
          },
        }).then(({ error: dcErr }) => {
          if (dcErr) console.warn('discovery_candidates insert failed:', dcErr.message);
        });
      }
    }

    // ── Step 10: Upsert product_catalog ──────────────────────────────────────
    const finalName = candidate.name ?? productName;

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

    // Determine source: only 'scan' if this is a brand-new entry
    const catalogSource = isNewToCache ? 'scan' : (cached?.source ?? 'scan');

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
          price_first_seen: isNewToCache ? priceMedian : undefined,
          price_latest:     priceMedian,
          price_updated_at: new Date().toISOString(),
          barcode:          barcode,
          image_url:        isNewToCache ? imageUrl : (cached?.image_url ?? imageUrl),
          scan_count:       isNewToCache ? 1 : (cached?.scan_count ?? 0) + 1,
          source:           catalogSource,
          last_seen_at:     new Date().toISOString(),
          first_seen_at:    isNewToCache ? new Date().toISOString() : undefined,
        },
        { onConflict: 'fingerprint' },
      )
      .select('id, sku_id, scan_count')
      .single();

    if (upsertErr || !upsertedRows) {
      console.error('product_catalog upsert failed:', upsertErr?.message);
      return json({ ok: false, error: 'catalog_upsert_failed' }, 500);
    }

    const catalogId = upsertedRows.id as string;
    const skuId     = upsertedRows.sku_id as string | null;

    // ── Step 11: Log to pipeline_runs ─────────────────────────────────────────
    const costUsd = (inputTokens * HAIKU_INPUT_RATE) + (outputTokens * HAIKU_OUTPUT_RATE);

    svc.from('pipeline_runs').insert({
      pipeline: 'scan-pipeline',
      input_tokens:  inputTokens,
      output_tokens: outputTokens,
      cost_usd:      costUsd,
      meta: {
        barcode,
        catalog_id:          catalogId,
        sku_id:              skuId,
        is_new:              isNewToCache,
        quality_gate_passed: qualityGatePassed,
        user_id:             userId,
        ebay_listings:       listings.length,
        score_estimate:      scoreEstimate,
      },
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('Failed to log pipeline run:', logErr.message);
    });

    // ── Step 12: Return ScanResult ────────────────────────────────────────────
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
      listings: listings.length,
      score_estimate: scoreEstimate,
      score_breakdown: scoreBreakdown,
      is_new_to_catalog: isNewToCache,
      quality_gate_passed: qualityGatePassed,
      barcode,
      ebay_query: ebayQuery,
      image_url: imageUrl,
    });

  } catch (err) {
    console.error('Scan pipeline error:', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
