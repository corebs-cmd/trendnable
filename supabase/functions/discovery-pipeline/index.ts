// Trendnable Discovery Pipeline
// Searches eBay broadly for trending collectibles, uses Claude to identify
// specific trackable SKUs, inserts new candidates into discovery_candidates.
//
// Run manually or on a weekly cron. Candidates must be promoted via
// the promote_candidate_to_sku() SQL function before the hot-pipeline tracks them.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EBAY_CLIENT_ID = Deno.env.get('EBAY_CLIENT_ID') ?? '';
const EBAY_CLIENT_SECRET = Deno.env.get('EBAY_CLIENT_SECRET') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

// Broad searches per category — sorted by watchCountDesc to surface what buyers want most
const CATEGORY_SEARCHES = [
  { category_id: 'funko',   query: 'Funko Pop vinyl exclusive limited' },
  { category_id: 'funko',   query: 'Funko Pop chase GITD grail HTF' },
  { category_id: 'tcg',     query: 'Pokemon card rare holo graded PSA' },
  { category_id: 'tcg',     query: 'Pokemon TCG ex full art secret rare' },
  { category_id: 'popmart', query: 'Pop Mart Labubu blind box figure' },
  { category_id: 'popmart', query: 'Pop Mart Skull Panda Dimoo figure' },
  { category_id: 'hottoys', query: 'Hot Toys 1/6 scale figure MMS' },
  { category_id: 'neca',    query: 'NECA ultimate action figure 7 inch' },
  { category_id: 'hwheels', query: 'Hot Wheels Super Treasure Hunt 2024 2025' },
  { category_id: 'hwheels', query: 'Hot Wheels Real Riders premium' },
];

// ── eBay ─────────────────────────────────────────────────────────────────────

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

async function searchEbayWatched(query: string, token: string, limit = 25): Promise<any[]> {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'watchCountDesc');
  url.searchParams.set('filter', 'categoryIds:{220,64482,183454,261068},buyingOptions:{FIXED_PRICE}');
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`eBay search failed for "${query}":`, res.status);
    return [];
  }
  const data = await res.json();
  return data.itemSummaries ?? [];
}

// ── Claude classification ─────────────────────────────────────────────────────

async function classifyWithClaude(
  items: any[],
  existingNames: string[]
): Promise<any[]> {
  const FANDOMS = 'onepiece, demon (Demon Slayer), starwars, pokemon, marvel, mha (My Hero Academia), stranger (Stranger Things), labubu, disney, jjk (Jujutsu Kaisen), dc, horror, gaming';
  const CATEGORIES = 'funko, tcg, popmart, hottoys, neca, hwheels';

  const prompt = `You are a collectibles trend analyst. Evaluate these eBay listings to find specific, trackable collectible SKUs worth price monitoring.

CATEGORIES: ${CATEGORIES}
FANDOMS: ${FANDOMS}
ALREADY TRACKED (skip): ${existingNames.slice(0, 40).join(' | ')}

APPROVE an item if it is ALL of:
- A specific named product with a clear identity (e.g. "Charizard VMAX Rainbow Rare", "Luffy Gear 5 [#1583]")
- NOT a lot, bundle, "random", "mystery box", accessories pack, or vague category listing
- NOT already in the tracked list above
- A physical collectible in the categories listed

REJECT if: the title is too generic, it's a multi-item lot, it's a reprint/bootleg, or it can't be uniquely identified.

⚠️ FUNKO RULE — MANDATORY: For any funko category item you MUST include the Pop number in the name formatted as [#XXXX] at the end (e.g. "Eleven - Season 5 Reveal [#1578]"). Extract the number from the listing title. If no pop number is visible in the title, REJECT the item — do not approve Funko items without a confirmed pop number. The ebay_query must also include the bare number (e.g. "Funko Pop Stranger Things Eleven 1578").

For each APPROVED item return:
- name: clean canonical product name (Funko: must end with [#XXXX])
- short: nickname max 18 chars
- series: product line / set (e.g. "Funko Pop · #1583" or "Pokémon TCG · Scarlet & Violet")
- category_id: funko | tcg | popmart | hottoys | neca | hwheels
- fandom_id: one of the known fandoms or null
- ebay_query: concise eBay search string (Funko: must include the pop number)
- ebay_title: original listing title verbatim
- price_median: price from listing as number
- reasoning: one sentence why it is worth tracking

Return ONLY a valid JSON array (can be empty). No markdown, no explanation outside the array.

LISTINGS:
${items.map((item, i) =>
  `${i + 1}. "${item.title}" | $${item.price?.value ?? '?'} | ${item.condition ?? 'unknown'} | ${item._category_id}`
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
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error('Claude API error:', res.status, await res.text());
    return [];
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? '[]';

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    console.error('Failed to parse Claude response:', text.slice(0, 200));
    return [];
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Load existing names to avoid duplicates
    const [{ data: existingSkus }, { data: existingCandidates }] = await Promise.all([
      supabase.from('skus').select('name'),
      supabase.from('discovery_candidates').select('name').in('status', ['new', 'approved']),
    ]);
    const existingNames: string[] = [
      ...(existingSkus ?? []).map((s: any) => s.name as string),
      ...(existingCandidates ?? []).map((c: any) => c.name as string),
    ];

    const ebayToken = await getEbayToken();

    // Collect eBay results across all searches, deduplicate by title
    const seenTitles = new Set<string>();
    const allItems: any[] = [];

    for (const search of CATEGORY_SEARCHES) {
      const results = await searchEbayWatched(search.query, ebayToken);
      for (const item of results) {
        const key = (item.title ?? '').toLowerCase().trim();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          allItems.push({ ...item, _category_id: search.category_id });
        }
      }
      await new Promise((r) => setTimeout(r, 350)); // eBay rate limit
    }

    // Pre-filter: drop items whose title contains an existing SKU's first two words
    const existingTokens = existingNames.map((n) =>
      n.toLowerCase().split(' ').slice(0, 2).join(' ')
    );
    const filtered = allItems.filter((item) => {
      const title = (item.title ?? '').toLowerCase();
      return !existingTokens.some((token) => title.includes(token));
    });

    // Classify with Claude in batches of 20
    const candidates: any[] = [];
    const BATCH = 20;
    for (let i = 0; i < Math.min(filtered.length, 160); i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      const approved = await classifyWithClaude(batch, existingNames);
      candidates.push(...approved);
      if (i + BATCH < filtered.length) {
        await new Promise((r) => setTimeout(r, 800)); // Claude rate limit
      }
    }

    // Insert into discovery_candidates, auto-promote those meeting the threshold
    let inserted = 0;
    let autoPromoted = 0;
    let skipped = 0;

    for (const c of candidates) {
      if (!c.name) continue;

      // Flag Funko items missing a pop number so admin can add it before promoting
      const missingPopNumber = c.category_id === 'funko' && !/\[#\d+\]/i.test(c.name);
      if (missingPopNumber) {
        console.log(`Funko candidate flagged — pop# missing: ${c.name}`);
      }

      const meetsThreshold =
        Number(c.price_median ?? 0) > 20 &&
        !!c.fandom_id &&
        !!c.category_id;

      const { data, error } = await supabase
        .from('discovery_candidates')
        .insert({
          name: c.name,
          category_id: c.category_id ?? null,
          fandom_id: c.fandom_id ?? null,
          ebay_count: 0,
          reddit_mentions: 0,
          evidence_json: {
            short: c.short,
            series: c.series,
            ebay_query: c.ebay_query,
            ebay_title: c.ebay_title,
            price_median: c.price_median,
            reasoning: c.reasoning,
            ...(missingPopNumber ? { needs_pop_number: true } : {}),
          },
          status: 'new',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Insert candidate error:', error.message);
        skipped++;
        continue;
      }

      inserted++;

      if (meetsThreshold) {
        const { data: result, error: promoteError } = await supabase
          .rpc('promote_candidate_to_sku', { candidate_id: data.id });

        if (promoteError) {
          console.error('Auto-promote error:', promoteError.message);
        } else if (typeof result === 'string' && !result.startsWith('ERROR')) {
          autoPromoted++;
          console.log('Auto-promoted:', result);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ebay_results: allItems.length,
        after_dedup: filtered.length,
        claude_approved: candidates.length,
        inserted,
        auto_promoted: autoPromoted,
        held_for_review: inserted - autoPromoted,
        skipped,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Discovery pipeline error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
