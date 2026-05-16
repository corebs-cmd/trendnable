import { Category, Fandom } from './types';

export const CATEGORIES: Category[] = [
  { id: 'funko',   label: 'Funko Pop',     short: 'Funko',   type: 'figure' },
  { id: 'tcg',     label: 'Trading Cards', short: 'TCG',     type: 'card' },
  { id: 'popmart', label: 'Pop Mart',      short: 'PopMart', type: 'box' },
  { id: 'hottoys', label: 'Hot Toys',      short: 'HotToys', type: 'figure' },
  { id: 'neca',    label: 'NECA',          short: 'NECA',    type: 'figure' },
  { id: 'hwheels', label: 'Hot Wheels',    short: 'HWheels', type: 'car' },
];

export const FANDOMS: Fandom[] = [
  { id: 'onepiece',  label: 'One Piece' },
  { id: 'demon',     label: 'Demon Slayer' },
  { id: 'starwars',  label: 'Star Wars' },
  { id: 'pokemon',   label: 'Pokémon' },
  { id: 'marvel',    label: 'Marvel' },
  { id: 'mha',       label: 'My Hero Academia' },
  { id: 'stranger',  label: 'Stranger Things' },
  { id: 'labubu',    label: 'Labubu' },
  { id: 'disney',    label: 'Disney' },
  { id: 'jjk',       label: 'Jujutsu Kaisen' },
];

export const catById = (id: string): Category | undefined =>
  CATEGORIES.find((c) => c.id === id);

export const fandomById = (id: string): Fandom | undefined =>
  FANDOMS.find((f) => f.id === id);

export const fmtPrice = (n: number): string => {
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export const fmtPriceRange = (p: { low: number; high: number }): string =>
  `${fmtPrice(p.low)}–${fmtPrice(p.high)}`;
