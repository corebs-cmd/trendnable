import { CollectionItemEnriched, CatalogCollectionItem } from './types';
import { catById, fmtPrice } from './appConfig';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function esc(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  // Wrap in quotes if the value contains a comma, quote, or newline
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

  // SKU-linked items first (have live prices), then catalog items
  for (const item of skuItems)     lines.push(skuRow(item));
  for (const item of catalogItems) lines.push(catalogRow(item));

  const csv = lines.join('\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `trendnable-collection-${dateStr}.csv`;

  // Import FileSystem dynamically to get actual directory
  const FileSystem = await import('expo-file-system');
  const dirKey = Object.keys(FileSystem).find(k => k.includes('Directory') && typeof (FileSystem as any)[k] === 'string');
  if (!dirKey) {
    throw new Error('No valid directory found in expo-file-system');
  }

  const directory = (FileSystem as any)[dirKey];
  const filePath = directory + fileName;

  // Write file
  const writeAsync = (FileSystem as any).writeAsStringAsync || (FileSystem as any).write;
  if (!writeAsync) {
    throw new Error('No write method found in expo-file-system');
  }
  await writeAsync(filePath, csv);

  // Share the file
  const Sharing = await import('expo-sharing');
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(filePath, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Collection',
    UTI: 'public.comma-separated-values-text',
  });
}
