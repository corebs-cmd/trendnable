// Assess a user-submitted scan photo for catalog image eligibility.
//
// Quality gates:
//   - Score >= 7/10 required (item clearly visible, adequate lighting, in focus)
//   - Item must fill >= 40% of the frame
//   - If an existing eBay thumbnail exists, quality >= 7 replaces it
//   - If an existing community photo exists (our Storage URL), quality >= 9 replaces it
//
// Returns crop bounds (as 0–1 fractions) when background is excessive.
// The client applies the crop before uploading to Storage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const SONNET_INPUT_RATE  = 3.00 / 1_000_000;
const SONNET_OUTPUT_RATE = 15.00 / 1_000_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function existingImageSource(url: string | null): 'none' | 'ebay' | 'community' {
  if (!url) return 'none';
  if (url.includes('ebayimg.com') || url.includes('i.ebay')) return 'ebay';
  return 'community';
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  const userJwt = authHeader.slice(7);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: { imageBase64?: string; catalogId?: string; existingImageUrl?: string | null };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Invalid body' }, 400); }

  const { imageBase64, catalogId, existingImageUrl = null } = body;
  if (!imageBase64 || !catalogId) return json({ ok: false, error: 'imageBase64 and catalogId required' }, 400);

  const source = existingImageSource(existingImageUrl ?? null);
  const replaceThreshold = source === 'community' ? 9 : 7;

  // ── Quality assessment via Claude Sonnet ────────────────────────────────────
  const prompt = `Assess this photo for use as a product image in a collectibles catalog.

Score the quality 1–10 based on:
- Is the item clearly the main subject and identifiable? (most important)
- Is the image in focus?
- Is lighting adequate (not too dark, not blown out)?
- How much of the frame is the item vs background?

Provide crop bounds ONLY if background exceeds 30% of the frame.
Crop bounds are fractions of the original image (0.0 to 1.0), keeping the item centered.

Return ONLY this JSON:
{
  "quality_score": 8,
  "item_fills_frame_pct": 65,
  "should_crop": false,
  "crop_bounds": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
  "rejection_reason": null
}

rejection_reason must be one of: null, "blurry", "poor_lighting", "item_not_visible", "too_much_background", "multiple_items"`;

  let qualityScore = 0;
  let itemFillsPct = 0;
  let shouldCrop = false;
  let cropBounds = { x: 0, y: 0, width: 1, height: 1 };
  let rejectionReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      inputTokens  = data.usage?.input_tokens  ?? 0;
      outputTokens = data.usage?.output_tokens ?? 0;
      const text: string = data.content?.[0]?.text ?? '{}';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        qualityScore  = parsed.quality_score   ?? 0;
        itemFillsPct  = parsed.item_fills_frame_pct ?? 0;
        shouldCrop    = parsed.should_crop     ?? false;
        cropBounds    = parsed.crop_bounds     ?? cropBounds;
        rejectionReason = parsed.rejection_reason ?? null;
      }
    }
  } catch (err) {
    console.error('Claude assessment error:', err);
    return json({ ok: false, error: 'Quality assessment failed' }, 500);
  }

  const costUsd = (inputTokens * SONNET_INPUT_RATE) + (outputTokens * SONNET_OUTPUT_RATE);

  // ── Quality gate ────────────────────────────────────────────────────────────
  if (qualityScore < replaceThreshold || itemFillsPct < 40) {
    const reason = rejectionReason
      ?? (qualityScore < replaceThreshold ? 'quality_too_low' : 'item_too_small');
    return json({ ok: false, accepted: false, reason, qualityScore, itemFillsPct, costUsd });
  }

  return json({
    ok: true,
    accepted: true,
    qualityScore,
    itemFillsPct,
    shouldCrop,
    cropBounds,
    source,
    costUsd,
  });
});
