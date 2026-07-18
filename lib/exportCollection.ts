import { supabase } from './supabase';
import { CollectionItemEnriched, CatalogCollectionItem } from './types';
import { catById } from './appConfig';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function esc(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(esc).join(',');
}

const HEADER = row(
  'Name', 'Category', 'Series', 'Condition', 'Qty',
  'Purchase Price', 'Purchase Date',
  'Current Market Price', 'Total Cost', 'Total Value', 'P&L',
  'Notes', 'Card Variant', 'Card Grader', 'Card Grade',
  'Source',
);

function skuRow(item: CollectionItemEnriched): string {
  const cat = catById(item.sku.category)?.label ?? item.sku.category;
  return row(
    item.sku.name, cat, item.sku.series ?? '', item.condition, item.qty,
    item.purchased, item.purchaseDate, item.sku.price.median,
    item.purchased * item.qty, item.current, item.pl,
    item.notes ?? '', item.cardVariant ?? '', item.cardGrader ?? '', item.cardGrade ?? '',
    'tracked',
  );
}

function catalogRow(item: CatalogCollectionItem): string {
  const cat = catById(item.categoryId)?.label ?? item.categoryId;
  const currentPrice = item.currentPrice ?? 0;
  const totalCost    = item.purchased * item.qty;
  const totalValue   = currentPrice * item.qty;
  return row(
    item.name, cat, '', item.condition, item.qty,
    item.purchased, item.purchaseDate, currentPrice || '',
    totalCost, totalValue || '', totalValue ? totalValue - totalCost : '',
    item.notes ?? '', '', '', '',
    'catalog',
  );
}

// ── Build CSV locally (no network) ───────────────────────────────────────────

export function buildExportCSV(
  skuItems: CollectionItemEnriched[],
  catalogItems: CatalogCollectionItem[],
): { csv: string; fileName: string } {
  const lines = [HEADER];
  for (const item of skuItems)     lines.push(skuRow(item));
  for (const item of catalogItems) lines.push(catalogRow(item));
  const dateStr  = new Date().toISOString().slice(0, 10);
  return {
    csv:      lines.join('\n'),
    fileName: `trendnable-collection-${dateStr}.csv`,
  };
}

// ── Send via edge function (Resend with attachment) ───────────────────────────

export interface ExportSummary {
  itemCount:  number;
  totalValue: number;
  totalCost:  number;
  pl:         number;
  plPct:      number;
}

export async function sendCollectionExport(
  csv: string,
  fileName: string,
  userEmail: string,
  summary: ExportSummary,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('export-collection', {
    body: { csv, fileName, userEmail, summary },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    // Try to read the actual error body from the edge function response
    let detail = error.message ?? 'Export failed';
    try {
      const ctx = (error as any)?.context;
      if (ctx instanceof Response) {
        const body = await ctx.json();
        detail = body?.error ?? detail;
      } else if (typeof ctx?.error === 'string') {
        detail = ctx.error;
      }
    } catch {}
    throw new Error(detail);
  }
  if (!data?.ok) throw new Error('Unexpected response from export function');
}
