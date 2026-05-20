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
  let shipping: number;
  if (shippingType === 'FREE_SHIPPING' || shippingCost === 0) {
    shipping = 0;
  } else if (
    shippingCost != null &&
    shippingCost > 0 &&
    shippingType !== 'CALCULATED' &&
    shippingType !== 'NOT_SPECIFIED'
  ) {
    shipping = Math.min(shippingCost, SHIPPING_CAP);
  } else {
    shipping = SHIPPING_DEFAULTS[categoryId] ?? DEFAULT_SHIPPING;
  }
  return itemPrice + shipping;
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
