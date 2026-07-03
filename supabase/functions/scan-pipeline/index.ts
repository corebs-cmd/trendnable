// Trendnable Scan Pipeline
// Barcode → product name lookup → eBay Browse search → Claude classification
// → product_catalog upsert → ScanResult response.
//
// Auth: user JWT (Bearer). Rate limiting/logging via user_id in meta.
// TCG barcodes are rejected at classification time (tcg_excluded error).


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

// Free-tier scan quota. Premium users bypass entirely.
const SCAN_DAILY_LIMIT = 1;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

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
  barcode: string;
  ebay_query: string;
  image_url: string | null;
}

interface ScanError {
  ok: false;
  error: string;
  message?: string;
  // Only set when error === 'quota_exceeded'
  used?: number;
  limit?: number;
  resetsAt?: string;
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
 * Step 6b: eBay Finding API — completed/sold listings count (last 90 days).
 * Uses App ID auth (same as lookupBarcodeOnEbay), no OAuth token required.
 */
async function searchEbaySold(query: string): Promise<number> {
  // Build URL manually — URLSearchParams encodes parentheses as %28%29 but
  // eBay Finding API requires literal parentheses in itemFilter(n).name params.
  const qs = [
    `OPERATION-NAME=findCompletedItems`,
    `SERVICE-VERSION=1.0.0`,
    `SECURITY-APPNAME=${encodeURIComponent(EBAY_CLIENT_ID)}`,
    `RESPONSE-DATA-FORMAT=JSON`,
    `GLOBAL-ID=EBAY-US`,
    `keywords=${encodeURIComponent(query)}`,
    `itemFilter(0).name=SoldItemsOnly`,
    `itemFilter(0).value=true`,
    `paginationInput.entriesPerPage=5`,
    `paginationInput.pageNumber=1`,
  ].join('&');

  try {
    const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${qs}`);
    if (!res.ok) {
      console.warn('eBay findCompletedItems non-OK:', res.status);
      return 0;
    }
    const data = await res.json();
    const resp = data?.findCompletedItemsResponse?.[0];
    const ack  = resp?.ack?.[0];
    if (ack !== 'Success' && ack !== 'SuccessWithWarning') {
      console.warn('eBay findCompletedItems ack:', ack, JSON.stringify(resp?.errorMessage?.[0]));
      return 0;
    }
    const totalStr = resp?.paginationOutput?.[0]?.totalEntries?.[0];
    return parseInt(totalStr ?? '0', 10) || 0;
  } catch (err) {
    console.warn('eBay findCompletedItems error:', err);
    return 0;
  }
}

/**
 * Step 6: eBay Browse API search — same params as spotlight-pipeline.
 * Returns the item summaries AND the total active listing count from eBay.
 */
async function searchEbay(query: string, token: string): Promise<{ items: any[]; total: number }> {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('filter', 'categoryIds:{220,64482},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('sort', 'watchCountDesc');
  url.searchParams.set('limit', '20');
  url.searchParams.set('fieldgroups', 'EXTENDED');  // includes watchCount per listing

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error('eBay Browse search failed:', res.status);
    return { items: [], total: 0 };
  }
  const data = await res.json();
  return { items: data.itemSummaries ?? [], total: data.total ?? 0 };
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
  barcodeListings: any[] = [],
  barcode: string = '',
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

LISTINGS — searched by product name ("${targetName}"):
${listings.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'}`
).join('\n')}
${barcodeListings.length > 0 ? `
LISTINGS — searched by barcode (${barcode}) — these are the strongest signal for the exact scanned item:
${barcodeListings.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'}`
).join('\n')}

If the barcode listings show a significantly different product or price point than the name-based listings, trust the barcode listings — they reflect the specific item that was physically scanned. Use them to determine the correct canonical name, price, and ebay_query.` : ''}

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

// ── Sellability score ─────────────────────────────────────────────────────────

function calcSellabilityScore(
  soldCount: number,
  activeTotal: number,
  priceMedian: number,
  listings: any[],
): number {
  const hasSoldData = soldCount > 0;

  // Sell-through — Bayesian smoothed ratio (only used when sold data is available)
  const stPct = hasSoldData
    ? (4 + soldCount) / (10 + soldCount + Math.max(activeTotal, 1)) * 100
    : 0;

  // Price signal — log10 scale anchored $10–$1000
  // $10→0  $50→35  $100→50  $300→74  $500→85  $1000→100
  const priceScore = priceMedian < 10 ? 0
    : Math.min(100, Math.round((Math.log10(priceMedian) - 1) / (3 - 1) * 100));

  // Watch-count demand — avg watches across returned listings (requires EXTENDED fieldgroups)
  const watches = listings.map((l: any) => Number(l.watchCount ?? 0));
  const avgWatches = watches.length > 0
    ? watches.reduce((a: number, b: number) => a + b, 0) / watches.length
    : 0;
  const watchScore = Math.min(100, Math.round(avgWatches / 25 * 100));

  // Dynamic weights: when sold data is unavailable redistribute its weight
  const score = hasSoldData
    ? stPct * 0.25 + priceScore * 0.45 + watchScore * 0.30
    : priceScore * 0.60 + watchScore * 0.40;

  return Math.max(1, Math.min(100, Math.round(score)));
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

Deno.serve(async (req) => {
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

  // ── Step 2.5: Free-tier daily scan quota ─────────────────────────────────────
  const { data: userRow } = await svc
    .from('users')
    .select('is_premium, scan_count_day, scan_count_used')
    .eq('id', userId)
    .single();

  const isPremium = userRow?.is_premium ?? false;
  const today     = todayUtc();
  const usedToday = userRow?.scan_count_day === today
    ? (userRow?.scan_count_used ?? 0)
    : 0;

  if (!isPremium && usedToday >= SCAN_DAILY_LIMIT) {
    return json({
      ok: false,
      error: 'quota_exceeded',
      message: `You've used all ${SCAN_DAILY_LIMIT} free scans for today. Upgrade for unlimited scanning.`,
      used: usedToday,
      limit: SCAN_DAILY_LIMIT,
      resetsAt: nextUtcMidnightIso(),
    }, 429);
  }

  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    // ── Step 3: eBay Finding API barcode lookup ───────────────────────────────
    let productName: string | null = null;
    productName = await lookupBarcodeOnEbay(barcode);

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

    // Burn a scan slot now that we know the barcode is real. Bad barcodes that
    // no DB recognizes are free; everything past this point counts.
    if (!isPremium) {
      await svc
        .from('users')
        .update({
          scan_count_day:  today,
          scan_count_used: usedToday + 1,
        })
        .eq('id', userId);
    }

    // ── Step 6: eBay Browse API search ────────────────────────────────────────
    const inferredCategory = inferCategoryFromName(productName);
    const ebayQueryInitial = buildEbayQuery(productName, inferredCategory);

    const ebayToken = await getEbayToken();
    const [nameResult, barcodeResult] = await Promise.all([
      searchEbay(ebayQueryInitial, ebayToken),
      searchEbay(barcode, ebayToken),
    ]);
    const listings        = nameResult.items;
    const barcodeListings = barcodeResult.items;
    const imageUrl = (listings.find((l: any) => l?.image?.imageUrl) ?? barcodeListings.find((l: any) => l?.image?.imageUrl))?.image?.imageUrl ?? null;

    // ── Step 7: Claude classification ─────────────────────────────────────────
    const { candidate, inputTokens: iT, outputTokens: oT } = await classifyWithClaude(
      productName,
      inferredCategory,
      null,
      listings,
      barcodeListings.slice(0, 5),
      barcode,
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

    // ── Step 7.5: Precision sellability search with Claude's refined query ────
    // Claude's ebayQuery targets the exact variant (GITD, Chase, Exclusive etc.)
    // so these counts are far more accurate than the broad initial query.
    const [preciseResult, soldCount] = await Promise.all([
      searchEbay(ebayQuery, ebayToken),
      searchEbaySold(ebayQuery),
    ]);

    // Cascade: refined query > barcode search > initial broad search
    const activeTotal = preciseResult.total > 0  ? preciseResult.total
      : barcodeResult.total > 0                  ? barcodeResult.total
      : nameResult.total;

    // Use precise listings for watch-count signal; fall back to initial listings
    const sellabilityListings = preciseResult.items.length > 0 ? preciseResult.items : listings;

    // ── Step 8: Hot score estimate ────────────────────────────────────────────
    const { score: scoreEstimate, breakdown: scoreBreakdown } = estimateHotScore(listings);

    // ── Step 9: Quality gates + discovery_candidate insert ───────────────────
    const priceMedian = Number(candidate.price_median ?? 0);
    const priceLow    = Number(candidate.price_low    ?? priceMedian);
    const priceHigh   = Number(candidate.price_high   ?? priceMedian);

    // Sellability uses precise counts + price + watch signals
    const sellabilityScore = calcSellabilityScore(soldCount, activeTotal, priceMedian, sellabilityListings);

    const qualityGatePassed =
      candidate.approved === true &&
      priceMedian >= 15 &&
      activeTotal >= 5;

    if (qualityGatePassed) {
      // Check if this item already exists as a candidate OR a promoted SKU
      const candidateName = candidate.name ?? productName;
      const [{ data: existingCand }, { data: existingSku }] = await Promise.all([
        svc.from('discovery_candidates').select('id').ilike('name', candidateName).limit(1).single(),
        svc.from('skus').select('id').ilike('name', candidateName).eq('is_active', true).limit(1).single(),
      ]);

      if (!existingCand && !existingSku) {
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
          barcode:          barcode,
          image_url:        imageUrl,
          source:           'scan',
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

    const catalogId = upsertedRows.id   as string;
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
        is_new:              true,
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
      listings: activeTotal,
      sold_count: soldCount,
      sellability_score: sellabilityScore,
      score_estimate: scoreEstimate,
      score_breakdown: scoreBreakdown,
      is_new_to_catalog: true,
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
