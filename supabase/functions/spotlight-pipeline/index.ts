// Trendnable Spotlight Pipeline
// On-demand single-product research pipeline.
// Takes a product name + category, builds a smart eBay query, fetches listings,
// runs Claude classification, and returns a preview — NO DB writes.
// The admin reviews the preview and confirms via a separate action.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EBAY_CLIENT_ID            = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET        = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

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
  if (!data.access_token) throw new Error(`eBay auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function buildEbayQuery(name: string, category_id: string): string {
  const n = name.trim();
  switch (category_id) {
    case 'funko':    return `Funko Pop ${n}`;
    case 'tcg':      return `${n} card`;
    case 'popmart':  return `Pop Mart ${n}`;
    case 'hottoys':  return `Hot Toys ${n}`;
    case 'neca':     return `NECA ${n}`;
    case 'hwheels':  return `Hot Wheels ${n}`;
    default:         return n;
  }
}

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
    console.error('eBay search failed:', res.status);
    return [];
  }
  const data = await res.json();
  return data.itemSummaries ?? [];
}

// ── Claude classification ─────────────────────────────────────────────────────

async function classifyWithClaude(
  targetName: string,
  categoryId: string,
  fandomId: string | null,
  listings: any[]
): Promise<{ candidate: any | null; inputTokens: number; outputTokens: number }> {

  const FANDOMS = 'onepiece, demon (Demon Slayer), starwars, pokemon, marvel, mha (My Hero Academia), stranger (Stranger Things), labubu, disney, jjk (Jujutsu Kaisen), dc, horror, gaming';

  const categoryRules: Record<string, string> = {
    funko: `FUNKO RULES:
- You MUST extract the Pop number from the title (e.g. #1578). Format name as "Character [#XXXX]".
- If no Pop number is visible in any listing title, set pop_number_found: false.
- Identify exclusive_type: "chase" | "gitd" | "convention" | "retailer" | "vaulted" | "grail" | "rare_variant" | "signed" | "limited" | "htf" | null`,

    tcg: `TCG RULES:
- Identify card_variant: "raw" (ungraded) or "graded" (PSA/BGS/CGC/SGC).
- If graded, extract card_grader (e.g. "PSA") and card_grade (e.g. "10").`,

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

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { name: string; category_id: string; fandom_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, category_id, fandom_id = null } = body;
  if (!name?.trim() || !category_id?.trim()) {
    return new Response(JSON.stringify({ error: 'name and category_id are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const ebayToken = await getEbayToken();
    const query     = buildEbayQuery(name, category_id);
    const listings  = await searchEbay(query, ebayToken);

    if (listings.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No eBay listings found for this product. Try a different name or category.',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const { candidate, inputTokens, outputTokens } = await classifyWithClaude(
      name, category_id, fandom_id ?? null, listings
    );

    // Top 5 listings for the preview card
    const ebayTop = listings.slice(0, 5).map((l: any) => ({
      title:    l.title,
      price:    Number(l.price?.value ?? 0),
      condition: l.condition ?? null,
      url:      l.itemWebUrl ?? null,
    }));

    const costUsd = (inputTokens * HAIKU_INPUT_RATE) + (outputTokens * HAIKU_OUTPUT_RATE);

    return new Response(JSON.stringify({
      ok: true,
      candidate,
      ebay_query_used: query,
      ebay_top: ebayTop,
      ebay_count: listings.length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Number(costUsd.toFixed(6)),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Spotlight pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
