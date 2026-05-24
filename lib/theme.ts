// lib/theme.ts — Trendnable redesign: editorial-collector aesthetic.
// Warm paper light mode, rich navy dark mode, brand blue CTAs,
// per-category color identity, gold coral for hot/top-find moments.

export const CATEGORY_COLORS = {
  funko:       { tint: '#FFE9D6', tintDark: '#161C3E', tintDark2: '#0C1128', ink: '#0869BF', name: 'Pop' },
  tcg:         { tint: '#E8E0FA', tintDark: '#131A40', tintDark2: '#0B1030', ink: '#6B46C1', name: 'TCG' },
  popmart:     { tint: '#FCDCE8', tintDark: '#17133C', tintDark2: '#0F0D28', ink: '#BE185D', name: 'Pop Mart' },
  hottoys:     { tint: '#D5E4FF', tintDark: '#0F1C3E', tintDark2: '#091430', ink: '#1D4ED8', name: 'Hot Toys' },
  neca:        { tint: '#D5EFDC', tintDark: '#0E1D36', tintDark2: '#081524', ink: '#CA0000', name: 'NECA' },
  hwheels:     { tint: '#FDDEDE', tintDark: '#131624', tintDark2: '#0C0F1A', ink: '#FDEE38', name: 'Hot Wheels' },
  autographed: { tint: '#FDE8FB', tintDark: '#260020', tintDark2: '#180014', ink: '#B5059C', name: 'Signed' },
  thrilljoy:   { tint: '#DCFAD4', tintDark: '#0C2010', tintDark2: '#071509', ink: '#5FD551', name: 'ThrillJoy' },
} as const;

export function categoryColor(catId: string, dark: boolean) {
  const c = CATEGORY_COLORS[catId as keyof typeof CATEGORY_COLORS] ?? CATEGORY_COLORS.funko;
  return {
    tint:  dark ? c.tintDark  : c.tint,
    tint2: dark ? c.tintDark2 : c.tint,
    ink:   c.ink,
    name:  c.name,
  };
}

// Brand constants
export const ACCENT = '#2563EB';

const DARK = {
  bg:            '#0A1426',
  surface:       '#0F1A2E',
  surface2:      '#162640',
  border:        'rgba(245,240,228,0.10)',
  text:          '#F5F0E4',
  muted:         'rgba(245,240,228,0.62)',
  faint:         'rgba(245,240,228,0.38)',
  accentInk:     '#FFFFFF',
  pos:           '#3DD68C',
  neg:           '#FF7A6B',
  hairline:      'rgba(245,240,228,0.10)',
  navBg:         'rgba(15,26,46,0.85)',
  // Legacy tokens kept for backward compat
  hotBarTrack:   'rgba(245,240,228,0.10)',
  imagePlinth:   '#162640',
  imageStripe:   'rgba(245,240,228,0.04)',
} as const;

const LIGHT = {
  bg:            '#F7F4ED',
  surface:       '#FFFFFF',
  surface2:      '#EFEAE0',
  border:        'rgba(21,23,26,0.08)',
  text:          '#15171A',
  muted:         'rgba(21,23,26,0.62)',
  faint:         'rgba(21,23,26,0.40)',
  accentInk:     '#FFFFFF',
  pos:           '#16A06B',
  neg:           '#D04848',
  hairline:      'rgba(21,23,26,0.08)',
  navBg:         'rgba(255,255,255,0.85)',
  // Legacy tokens
  hotBarTrack:   'rgba(21,23,26,0.08)',
  imagePlinth:   '#EFEAE0',
  imageStripe:   'rgba(0,0,0,0.02)',
} as const;

export const RADIUS = {
  card:   16,
  chip:   999,
  button: 14,
  sheet:  28,
} as const;

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentInk: string;
  pos: string;
  neg: string;
  gold: string;
  goldInk: string;
  premium: string;
  premiumInk: string;
  premiumGradient: string;
  cyan: string;
  hairline: string;
  navBg: string;
  hotBarTrack: string;
  imagePlinth: string;
  imageStripe: string;
  // Font family names (loaded via useFonts)
  fontDisp: string;
  fontDispBold: string;
  fontDispItalic: string;
  fontMono: string;
  fontMonoBold: string;
  // Shape
  radius: number;
  radiusLg: number;
  radiusSm: number;
};

export function buildTheme(dark: boolean): Theme {
  const base = dark ? DARK : LIGHT;
  return {
    ...base,
    dark,
    accent: ACCENT,
    gold:    '#F43F5E',
    goldInk: '#FFFFFF',
    premium:    '#E8A33D',
    premiumInk: '#1A1206',
    premiumGradient: dark
      ? 'linear-gradient(135deg, #2A1D08 0%, #6E4A14 100%)'
      : 'linear-gradient(135deg, #FFF8EC 0%, #FBE3A0 100%)',
    cyan: '#5EE2E8',
    fontDisp:     'Fraunces_600SemiBold',
    fontDispBold: 'Fraunces_700Bold',
    fontDispItalic: 'Fraunces_400Regular_Italic',
    fontMono:     'JetBrainsMono_400Regular',
    fontMonoBold: 'JetBrainsMono_700Bold',
    radius:   RADIUS.card,
    radiusLg: 22,
    radiusSm: 10,
  };
}
