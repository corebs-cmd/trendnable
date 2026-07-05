import { Category, Fandom } from './types';

export const CATEGORIES: Category[] = [
  { id: 'funko',        label: 'Funko Pop',            short: 'Funko',     type: 'figure' },
  { id: 'tcg',          label: 'Trading Cards',         short: 'TCG',       type: 'card'   },
  { id: 'popmart',      label: 'Pop Mart',              short: 'PopMart',   type: 'box'    },
  { id: 'hottoys',      label: 'Hot Toys',              short: 'HotToys',   type: 'figure' },
  { id: 'neca',         label: 'NECA',                  short: 'NECA',      type: 'figure' },
  { id: 'hwheels',      label: 'Hot Wheels',            short: 'HWheels',   type: 'car'    },
  { id: 'autographed',  label: 'Signed & Autographed',  short: 'Signed',    type: 'signed' },
  { id: 'thrilljoy',    label: 'ThrillJoy',             short: 'ThrillJoy', type: 'box'    },
];

export const FANDOMS: Fandom[] = [
  { id: 'pokemon',    label: 'Pokémon' },
  { id: 'starwars',   label: 'Star Wars' },
  { id: 'marvel',     label: 'Marvel' },
  { id: 'dc',         label: 'DC / Batman' },
  { id: 'anime',      label: 'Anime' },
  { id: 'sports',     label: 'Sports' },
  { id: 'videogames', label: 'Video Games' },
  { id: 'nostalgia',  label: 'Nostalgia' },
];

export const CATEGORY_FANDOM_MAP: Record<string, string[]> = {
  funko:       ['marvel', 'dc', 'starwars', 'anime'],
  tcg:         ['pokemon', 'anime'],
  popmart:     ['anime', 'nostalgia'],
  hottoys:     ['marvel', 'dc', 'starwars'],
  neca:        ['marvel', 'dc', 'starwars'],
  hwheels:     ['nostalgia', 'sports'],
  autographed: ['marvel', 'starwars', 'sports'],
  thrilljoy:   ['anime', 'nostalgia'],
};

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
