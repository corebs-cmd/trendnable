import { Linking } from 'react-native';
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

// ── Row builders ──────────────────────────────────────────────────────────────

function skuRow(item: CollectionItemEnriched): string {
  const cat = catById(item.sku.category)?.label ?? item.sku.category;
  return row(
    item.sku.name,
    cat,
    item.sku.series ?? '',
    item.condition,
    item.qty,
    item.purchased,
    item.purchaseDate,
    item.sku.price.median,
    item.purchased * item.qty,
    item.current,
    item.pl,
    item.notes ?? '',
    item.cardVariant ?? '',
    item.cardGrader ?? '',
    item.cardGrade ?? '',
    'tracked',
  );
}

function catalogRow(item: CatalogCollectionItem): string {
  const cat = catById(item.categoryId)?.label ?? item.categoryId;
  const currentPrice = item.currentPrice ?? 0;
  const totalCost    = item.purchased * item.qty;
  const totalValue   = currentPrice * item.qty;
  return row(
    item.name,
    cat,
    '',
    item.condition,
    item.qty,
    item.purchased,
    item.purchaseDate,
    currentPrice || '',
    totalCost,
    totalValue || '',
    totalValue ? totalValue - totalCost : '',
    item.notes ?? '',
    '', '', '',
    'catalog',
  );
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportCollectionAsCSV(
  skuItems: CollectionItemEnriched[],
  catalogItems: CatalogCollectionItem[],
): Promise<void> {
  const lines: string[] = [HEADER];

  for (const item of skuItems)     lines.push(skuRow(item));
  for (const item of catalogItems) lines.push(catalogRow(item));

  const csv      = lines.join('\n');
  const dateStr  = new Date().toISOString().slice(0, 10);
  const fileName = `trendnable-collection-${dateStr}.csv`;

  // Upload CSV to Supabase Storage via edge function, get signed URL
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('export-collection', {
    body: { csv, fileName },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    const detail = (error as any)?.context?.error ?? error.message ?? 'Export failed';
    throw new Error(detail);
  }
  if (!data?.url) throw new Error('No download URL returned');

  // Open signed URL — iOS opens in Safari where user can save or share
  await Linking.openURL(data.url);
}
