// Shared data-cleaning utilities for Trendnable pipelines.
// Implements P2 (keyword filters), P3 (IQR median), P4 (shipping normalization).

// ── P2 Tier 1 — Hard excludes ─────────────────────────────────────────────────
// Listings whose title matches any pattern are junk/noise and should be dropped
// before price calculation or Claude classification.
const TIER1_PATTERNS: RegExp[] = [
  /\brepack\b/i,
  /\bmystery\b/i,
  /\blot\b/i,
  /\bbundle\b/i,
  /\bprox(y|ies)\b/i,
  /\bfake\b/i,
  /\bbootleg\b/i,
  /\breproduction\b/i,
  /\bcustom\b/i,
  /\bcounterfeit\b/i,
  /\bnft\b/i,
  /\bdigital pop\b/i,
  /\bdroppp\b/i,
  /\bredemption\b/i,
  /\bredeemable\b/i,
  /\bcrypto\b/i,
  /\bdigital\b/i,
];

export function titlePassesTier1(title: string): boolean {
  return !TIER1_PATTERNS.some((re) => re.test(title));
}

// ── P2 Tier 2 — Condition segmentation ───────────────────────────────────────
// Titles matching these patterns indicate a loose/incomplete item.
// Used to route sold listings into separate price buckets (price_mint / price_loose).
const TIER2_LOOSE_PATTERNS: RegExp[] = [
  /\bloose\b/i,
  /\boob\b/i,
  /\bout\s+of\s+box\b/i,
  /\bincomplete\b/i,
  /\bdamaged\b/i,
  /\bmissing\b/i,
  /\bno\s+box\b/i,
];

export function isLooseCondition(title: string): boolean {
  return TIER2_LOOSE_PATTERNS.some((re) => re.test(title));
}

// ── TCG multi-quantity filter ─────────────────────────────────────────────────
// Returns drop=true for lot/playset listings that can't be normalised.
// Returns divisor>1 for "4x Charizard" style listings (divide price by N).
// TCG category only.
export function tcgMultiQty(title: string): { drop: boolean; divisor: number } {
  if (/\b(playset|lot\s+of|set\s+of)\b/i.test(title)) {
    return { drop: true, divisor: 1 };
  }
  const mxMatch = title.match(/^(\d+)\s*x\s+/i) ?? title.match(/\b(\d+)\s*x\s+(?=\w)/i);
  if (mxMatch) {
    const qty = parseInt(mxMatch[1]);
    return { drop: false, divisor: qty > 1 ? qty : 1 };
  }
  return { drop: false, divisor: 1 };
}

// ── P4 — Shipping normalization ───────────────────────────────────────────────
// effectivePrice = itemPrice + min(shippingCost, $50)
// Unknown/calculated shipping → category-aware default.
const SHIPPING_CAP = 50;
const SHIPPING_DEFAULTS: Record<string, number> = {
  funko:   5.99,
  tcg:     4.99,
};
const DEFAULT_SHIPPING = 5.99;

export function effectivePrice(
  itemPrice: number,
  shippingCost: number | null,
  shippingType: string | null,
  categoryId: string,
): number {
  const typeNorm = (shippingType ?? '').toLowerCase();
  // Free shipping — Browse API: "FREE_SHIPPING"; Finding API: "Free", "FreeDomestic..."
  if (typeNorm.startsWith('free') || shippingCost === 0) {
    return itemPrice;
  }
  // Known non-zero cost — use it capped at $50
  if (shippingCost != null && shippingCost > 0) {
    return itemPrice + Math.min(shippingCost, SHIPPING_CAP);
  }
  // Unknown/calculated — category-aware default
  return itemPrice + (SHIPPING_DEFAULTS[categoryId] ?? DEFAULT_SHIPPING);
}

// ── Sold listing title verifier ───────────────────────────────────────────────
// Requires all "meaningful" tokens from the eBay query to appear in the sold
// listing title.  Prevents variant cross-contamination: e.g. a query for
// "Darth Maul Shadow Lord Poster Variation SP" should never count base-card
// sales that lack "Poster" and "Variation" in their title.
//
// Meaningful = ≥4 chars, not a negative flag ("-PSA"), not a pure number, and
// not a card print number (X/Y). Card print numbers are stripped so that price
// data from all prints of the same card is aggregated rather than siloed.
export function soldTitleMatchesQuery(title: string, query: string): boolean {
  const titleLower = title.toLowerCase();
  const tokens = query.toLowerCase()
    .split(/\s+/)
    .filter(t => {
      if (t.length < 4)              return false;   // too short
      if (t.startsWith('-'))         return false;   // eBay negative flag
      if (/^\d+$/.test(t))           return false;   // pure number — pop#, edition size, year
      if (/^\d{1,4}\/\d{1,4}$/.test(t)) return false; // card print number e.g. "272/217"
      return true;
    });
  if (tokens.length === 0) return true;
  return tokens.every(t => titleLower.includes(t));
}

// ── TCG name normalisation ────────────────────────────────────────────────────
// Strips card print numbers (e.g. "272/217", "113/111") from TCG card names
// so that every print of the same card collapses to a single catalog entry.
export function normalizeTcgName(name: string): string {
  return name
    .replace(/\b\d{1,4}\/\d{1,4}\b/g, '')  // remove "272/217"-style numbers
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Catalog fingerprint + variant helpers ─────────────────────────────────────

export function catalogFingerprint(
  category: string,
  name: string,
  opts: {
    popNumber?: number | null;
    variantType?: string | null;
    cardVariant?: string | null;
    cardGrader?: string | null;
    cardGrade?: string | null;
  } = {},
): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (category === 'funko') {
    const popPart    = opts.popNumber != null ? String(opts.popNumber) : slug(name);
    const variantPart = (opts.variantType ?? 'common').toLowerCase();
    return `funko-${popPart}-${variantPart}`;
  }

  if (category === 'tcg') {
    const namePart    = slug(normalizeTcgName(name));
    const variantPart = (opts.cardVariant ?? 'raw').toLowerCase();
    const graderPart  = opts.cardGrader ? `-${opts.cardGrader.toLowerCase()}` : '';
    const gradePart   = opts.cardGrade  ? `-${opts.cardGrade.toLowerCase()}`  : '';
    return `tcg-${namePart}-${variantPart}${graderPart}${gradePart}`;
  }

  return `${category}-${slug(name)}`;
}

// Maps funko-pipeline exclusive_type values to catalog variant_type.
// chase/gitd are their own variant_type; everything else is 'exclusive'; null → 'common'.
export function exclusiveTypeToVariantType(exclusiveType: string | null | undefined): string {
  if (!exclusiveType) return 'common';
  if (exclusiveType === 'chase' || exclusiveType === 'gitd') return exclusiveType;
  return 'exclusive';
}

// ── P3 — IQR median with low-sample fallback ──────────────────────────────────
// If fewer than 5 prices: skip IQR, return simple median of the raw set.
// If IQR removes all values (degenerate): fall back to raw set.
export function iqrMedian(rawPrices: number[]): {
  median: number;
  count: number;
  low: number;
  high: number;
} {
  if (rawPrices.length === 0) {
    return { median: 0, count: 0, low: 0, high: 0 };
  }

  const sorted = [...rawPrices].sort((a, b) => a - b);

  // Low-sample fallback
  if (sorted.length < 5) {
    const mid = Math.floor((sorted.length - 1) / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[mid] + sorted[mid + 1]) / 2
        : sorted[mid];
    return { median, count: sorted.length, low: sorted[0], high: sorted[sorted.length - 1] };
  }

  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  const clean = sorted.filter((p) => p >= lower && p <= upper);
  const set = clean.length >= 2 ? clean : sorted;

  const mid = Math.floor((set.length - 1) / 2);
  const median =
    set.length % 2 === 0 ? (set[mid] + set[mid + 1]) / 2 : set[mid];

  return { median, count: set.length, low: set[0], high: set[set.length - 1] };
}
