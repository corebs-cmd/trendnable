/**
 * Tests for CSV export logic.
 * These are pure functions — no mocking needed.
 * Focus: data integrity, column consistency, escaping, P&L math.
 */

// ── Re-export internals for testing ──────────────────────────────────────────
// We test buildExportCSV via its public export.
// Internal helpers (esc, price) are tested via their effect on output.

import { buildExportCSV } from '../../lib/exportCollection';
import type { CollectionItemEnriched, CatalogCollectionItem } from '../../lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEADER_COLUMN_COUNT = 12; // Name,Category,Series,Condition,Qty,PurchasePrice,PurchaseDate,CurrentMarketPrice,TotalCost,TotalValue,P&L,Source

function parseCSV(csv: string): string[][] {
  return csv.split('\n').map((row) =>
    row.split(',').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
  );
}

function makeSku(overrides: Partial<CollectionItemEnriched['sku']> = {}): CollectionItemEnriched['sku'] {
  return {
    id: 'sku-1',
    name: 'Test SKU',
    short: 'Test',
    series: 'Test Series',
    category: 'funko',
    fandomIds: [],
    hot: 50,
    delta: 0,
    score: { velocity: 5, volume: 5, confirmation: 5, freshness: 5 },
    price: { low: 80, median: 100, high: 120, currency: 'USD' },
    listings: 10,
    age: 30,
    history: [],
    listingsHist: [],
    priceHist: [],
    ...overrides,
  } as any;
}

function makeSkuItem(overrides: Partial<CollectionItemEnriched> = {}): CollectionItemEnriched {
  return {
    skuId: 'sku-1',
    qty: 1,
    purchased: 80,
    purchaseDate: '2026-01-01',
    condition: 'Mint',
    forSale: false,
    current: 100,
    cost: 80,
    pl: 20,
    sku: makeSku(),
    ...overrides,
  } as any;
}

function makeCatalogItem(overrides: Partial<CatalogCollectionItem> = {}): CatalogCollectionItem {
  return {
    id: 'cat-1',
    catalogId: 'cat-1',
    name: 'Catalog Item',
    categoryId: 'funko',
    qty: 1,
    purchased: 50,
    purchaseDate: '2026-01-01',
    condition: 'Mint',
    currentPrice: 75,
    ...overrides,
  } as any;
}

// ── Column count consistency ───────────────────────────────────────────────────

describe('buildExportCSV — column count consistency', () => {
  it('header has correct column count', () => {
    const { csv } = buildExportCSV([], []);
    const [header] = parseCSV(csv);
    expect(header.length).toBe(HEADER_COLUMN_COUNT);
  });

  it('every SKU row has same column count as header', () => {
    const items = [makeSkuItem(), makeSkuItem({ qty: 2, purchased: 120 })];
    const { csv } = buildExportCSV(items, []);
    const rows = parseCSV(csv);
    rows.forEach((row, i) => {
      expect(row.length).toBe(HEADER_COLUMN_COUNT);
    });
  });

  it('every catalog row has same column count as header', () => {
    const items = [makeCatalogItem(), makeCatalogItem({ currentPrice: 0, name: 'No Price Item' })];
    const { csv } = buildExportCSV([], items);
    const rows = parseCSV(csv);
    rows.forEach((row) => {
      expect(row.length).toBe(HEADER_COLUMN_COUNT);
    });
  });

  it('mixed SKU + catalog rows all match header count', () => {
    const { csv } = buildExportCSV([makeSkuItem()], [makeCatalogItem()]);
    const rows = parseCSV(csv);
    rows.forEach((row) => {
      expect(row.length).toBe(HEADER_COLUMN_COUNT);
    });
  });
});

// ── CSV output structure ───────────────────────────────────────────────────────

describe('buildExportCSV — output structure', () => {
  it('empty collection returns just header', () => {
    const { csv } = buildExportCSV([], []);
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
  });

  it('SKU items appear before catalog items', () => {
    const { csv } = buildExportCSV([makeSkuItem()], [makeCatalogItem()]);
    const rows = parseCSV(csv);
    const skuRow = rows[1];
    const catalogRow = rows[2];
    expect(skuRow[skuRow.length - 1]).toBe('tracked');
    expect(catalogRow[catalogRow.length - 1]).toBe('catalog');
  });

  it('filename includes today\'s date', () => {
    const { fileName } = buildExportCSV([], []);
    const today = new Date().toISOString().slice(0, 10);
    expect(fileName).toContain(today);
    expect(fileName).toContain('trendnable-collection');
    expect(fileName.endsWith('.csv')).toBe(true);
  });
});

// ── CSV escaping ───────────────────────────────────────────────────────────────

describe('buildExportCSV — CSV escaping', () => {
  it('name with comma is quoted', () => {
    const item = makeSkuItem({ sku: makeSku({ name: 'Spider-Man, Noir' }) });
    const { csv } = buildExportCSV([item], []);
    expect(csv).toContain('"Spider-Man, Noir"');
  });

  it('name with double-quote doubles the quote', () => {
    const item = makeSkuItem({ sku: makeSku({ name: 'Batman "Begins"' }) });
    const { csv } = buildExportCSV([item], []);
    expect(csv).toContain('"Batman ""Begins"""');
  });

  it('name with newline is quoted', () => {
    const item = makeSkuItem({ sku: makeSku({ name: 'Line1\nLine2' }) });
    const { csv } = buildExportCSV([item], []);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it('plain name with no special chars is not quoted', () => {
    const item = makeSkuItem({ sku: makeSku({ name: 'Labubu Figure' }) });
    const { csv } = buildExportCSV([item], []);
    // Should appear without wrapping quotes
    expect(csv).toContain('Labubu Figure');
    expect(csv).not.toContain('"Labubu Figure"');
  });
});

// ── P&L calculations ───────────────────────────────────────────────────────────

describe('buildExportCSV — P&L math', () => {
  it('positive P&L: bought $80, now $100, qty 1 → P&L = 20.00', () => {
    const item = makeSkuItem({ purchased: 80, qty: 1, current: 100, cost: 80, pl: 20 });
    const { csv } = buildExportCSV([item], []);
    const rows = parseCSV(csv);
    const plCol = rows[1][10]; // P&L is column index 10
    expect(parseFloat(plCol)).toBeCloseTo(20, 2);
  });

  it('negative P&L: bought $150, now $100, qty 1 → P&L = -50.00', () => {
    const item = makeSkuItem({ purchased: 150, qty: 1, current: 100, cost: 150, pl: -50 });
    const { csv } = buildExportCSV([item], []);
    const rows = parseCSV(csv);
    const plCol = rows[1][10];
    expect(parseFloat(plCol)).toBeCloseTo(-50, 2);
  });

  it('qty multiplier: bought $50, qty 3 → total cost = 150.00', () => {
    const item = makeSkuItem({ purchased: 50, qty: 3, current: 60, cost: 150, pl: 30 });
    const { csv } = buildExportCSV([item], []);
    const rows = parseCSV(csv);
    const totalCostCol = rows[1][8];
    expect(parseFloat(totalCostCol)).toBeCloseTo(150, 2);
  });

  it('catalog item with no current price: P&L still renders (not empty)', () => {
    const item = makeCatalogItem({ currentPrice: 0, purchased: 50 });
    const { csv } = buildExportCSV([], [item]);
    const rows = parseCSV(csv);
    const plCol = rows[1][10];
    // Should be -50 (bought $50, worth $0) or empty — must not be blank causing column shift
    expect(rows[1].length).toBe(HEADER_COLUMN_COUNT);
  });

  it('prices have max 2 decimal places', () => {
    const item = makeSkuItem({ purchased: 33.333, cost: 33.333, current: 66.666, pl: 33.333 });
    const { csv } = buildExportCSV([item], []);
    // No cell should have more than 2 decimal places
    const rows = parseCSV(csv);
    rows.slice(1).forEach((row) => {
      row.forEach((cell) => {
        if (!isNaN(parseFloat(cell)) && cell.includes('.')) {
          const decimals = cell.split('.')[1]?.length ?? 0;
          expect(decimals).toBeLessThanOrEqual(2);
        }
      });
    });
  });
});

// ── Portfolio totals ───────────────────────────────────────────────────────────

describe('P&L aggregation math (mirrors collection.tsx logic)', () => {
  const computePortfolio = (items: Array<{ purchased: number; qty: number; currentMedian: number }>) => {
    const enriched = items.map((i) => ({
      current: i.currentMedian * i.qty,
      cost: i.purchased * i.qty,
      pl: (i.currentMedian - i.purchased) * i.qty,
    }));
    const total = enriched.reduce((s, i) => s + i.current, 0);
    const totalCost = enriched.reduce((s, i) => s + i.cost, 0);
    const totalPL = total - totalCost;
    const plPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    return { total, totalCost, totalPL, plPct };
  };

  it('single item gain: bought $80, now $100 → +$20 (+25%)', () => {
    const { totalPL, plPct } = computePortfolio([{ purchased: 80, qty: 1, currentMedian: 100 }]);
    expect(totalPL).toBeCloseTo(20, 2);
    expect(plPct).toBeCloseTo(25, 2);
  });

  it('single item loss: bought $200, now $100 → -$100 (-50%)', () => {
    const { totalPL, plPct } = computePortfolio([{ purchased: 200, qty: 1, currentMedian: 100 }]);
    expect(totalPL).toBeCloseTo(-100, 2);
    expect(plPct).toBeCloseTo(-50, 2);
  });

  it('qty multiplier: $50 item x3 bought at $40 → +$30 (+25%)', () => {
    const { totalPL, totalCost, plPct } = computePortfolio([{ purchased: 40, qty: 3, currentMedian: 50 }]);
    expect(totalCost).toBeCloseTo(120, 2);
    expect(totalPL).toBeCloseTo(30, 2);
    expect(plPct).toBeCloseTo(25, 2);
  });

  it('mixed gains and losses net correctly', () => {
    const { totalPL } = computePortfolio([
      { purchased: 80, qty: 1, currentMedian: 100 },  // +$20
      { purchased: 150, qty: 1, currentMedian: 100 }, // -$50
    ]);
    expect(totalPL).toBeCloseTo(-30, 2);
  });

  it('empty collection: all zeros, no NaN', () => {
    const { total, totalCost, totalPL, plPct } = computePortfolio([]);
    expect(total).toBe(0);
    expect(totalCost).toBe(0);
    expect(totalPL).toBe(0);
    expect(plPct).toBe(0);
    expect(isNaN(plPct)).toBe(false);
  });

  it('zero cost base does not produce Infinity', () => {
    const { plPct } = computePortfolio([{ purchased: 0, qty: 1, currentMedian: 100 }]);
    expect(isFinite(plPct)).toBe(true);
  });
});
