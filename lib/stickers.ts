export interface StickerDef {
  key: string;
  label: string;
  sub: string;
  family: 'chase' | 'program' | 'convention' | 'retailer';
  shape: 'round' | 'card';
  glow: string;
  ar: number;
  /** Network image URL from Supabase Storage — preferred over bundled asset when set */
  imageUrl?: string;
}

export const STICKERS: Record<string, StickerDef> = {
  glowChase:             { key:'glowChase',             label:'Glow Chase',                family:'chase',      shape:'round', glow:'#bdef5a', ar:1.007, sub:'Limited glow-in-the-dark chase edition' },
  glowInTheDark:         { key:'glowInTheDark',         label:'Glows in the Dark',         family:'chase',      shape:'round', glow:'#d6ec3a', ar:0.971, sub:'Glow-in-the-dark variant' },
  flockedChase:          { key:'flockedChase',          label:'Flocked Chase',             family:'chase',      shape:'round', glow:'#ec4899', ar:1,     sub:'Limited flocked chase edition' },
  chaseGlossy:           { key:'chaseGlossy',           label:'Chase',                     family:'chase',      shape:'round', glow:'#f5c518', ar:1,     sub:'Limited chase edition' },
  chaseFlat:             { key:'chaseFlat',             label:'Chase (Classic)',           family:'chase',      shape:'round', glow:'#e0a92e', ar:1.006, sub:'Limited chase edition' },
  specialEditionSeal:    { key:'specialEditionSeal',    label:'Special Edition',           family:'chase',      shape:'round', glow:'#d9433f', ar:1.312, sub:'Special edition release' },
  specialtySeries:       { key:'specialtySeries',       label:'Specialty Series',          family:'program',    shape:'round', glow:'#5ec5e8', ar:1.001, sub:'Funko Specialty Series — limited edition exclusive' },
  funkoShop:             { key:'funkoShop',             label:'Funko Shop',                family:'program',    shape:'round', glow:'#33a0e0', ar:0.984, sub:'shop.funko.com limited edition' },
  specialEditionCard:    { key:'specialEditionCard',    label:'Special Edition (Card)',    family:'program',    shape:'card',  glow:'#3b82f6', ar:1.647, sub:'Funko Special Edition — verified original' },
  hotTopic:              { key:'hotTopic',              label:'Hot Topic',                 family:'retailer',   shape:'card',  glow:'#f5a623', ar:2.239, sub:'Hot Topic store exclusive' },
  amazon:                { key:'amazon',                label:'Amazon',                    family:'retailer',   shape:'card',  glow:'#ff9900', ar:1.85,  sub:'Amazon exclusive' },
  bam:                   { key:'bam',                   label:'Books-A-Million',           family:'retailer',   shape:'card',  glow:'#6b7280', ar:1.31,  sub:'BAM! exclusive' },
  boxlunch:              { key:'boxlunch',              label:'BoxLunch',                  family:'retailer',   shape:'card',  glow:'#b5532a', ar:2.217, sub:'BoxLunch exclusive' },
  entertainmentEarth:    { key:'entertainmentEarth',    label:'Entertainment Earth',       family:'retailer',   shape:'card',  glow:'#f2c200', ar:1.654, sub:'Entertainment Earth exclusive' },
  fye:                   { key:'fye',                   label:'FYE',                       family:'retailer',   shape:'card',  glow:'#9aa6b5', ar:1.618, sub:'FYE exclusive' },
  galacticToys:          { key:'galacticToys',          label:'GalacticToys',              family:'retailer',   shape:'card',  glow:'#2f6fb0', ar:2.61,  sub:'GalacticToys & Collectibles exclusive' },
  gamestop:              { key:'gamestop',              label:'GameStop',                  family:'retailer',   shape:'card',  glow:'#e0252b', ar:2.15,  sub:'Only at GameStop' },
  toysrus:               { key:'toysrus',               label:'Toys"R"Us',                 family:'retailer',   shape:'card',  glow:'#2f6fb0', ar:2.409, sub:'Only at Toys"R"Us' },
  walmart:               { key:'walmart',               label:'Walmart',                   family:'retailer',   shape:'card',  glow:'#0071ce', ar:2.411, sub:'Only at Walmart' },
  sdcc2011:              { key:'sdcc2011',              label:'SDCC 2011',                 family:'convention', shape:'round', glow:'#9b7bb8', ar:1,     sub:'San Diego Comic-Con 2011 — 480 piece limited' },
  sdcc2012:              { key:'sdcc2012',              label:'SDCC 2012',                 family:'convention', shape:'round', glow:'#c0392b', ar:1,     sub:'San Diego Comic-Con 2012 — 480 piece limited' },
  sdcc2013:              { key:'sdcc2013',              label:'SDCC 2013',                 family:'convention', shape:'round', glow:'#9bb06a', ar:1,     sub:'San Diego Comic-Con 2013 — 480 piece limited' },
  sdcc2016:              { key:'sdcc2016',              label:'SDCC 2016',                 family:'convention', shape:'card',  glow:'#16b5a8', ar:1.64,  sub:'San Diego Comic-Con 2016 exclusive' },
  sdcc2018:              { key:'sdcc2018',              label:'SDCC 2018',                 family:'convention', shape:'card',  glow:'#e23b3b', ar:1.463, sub:'San Diego Comic-Con 2018 exclusive' },
  sdcc2020:              { key:'sdcc2020',              label:'SDCC 2020',                 family:'convention', shape:'card',  glow:'#2f6fb0', ar:1.548, sub:'San Diego Comic-Con 2020 limited' },
  sdcc50:                { key:'sdcc50',                label:'SDCC 50th',                 family:'convention', shape:'card',  glow:'#2f6fb0', ar:1.463, sub:'Comic-Con 50 — 1000 pcs limited edition' },
  nycc2020:              { key:'nycc2020',              label:'NYCC 2020',                 family:'convention', shape:'card',  glow:'#e23b3b', ar:1.344, sub:'New York Comic Con 2020 limited' },
  fallConvention2022:    { key:'fallConvention2022',    label:'Fall Convention 2022',      family:'convention', shape:'card',  glow:'#2f6fb0', ar:1.442, sub:'Funko 2022 Fall Convention limited' },
  galacticConvention2022:{ key:'galacticConvention2022',label:'Galactic Convention 2022', family:'convention', shape:'card',  glow:'#9aa6b5', ar:0.801, sub:'Funko 2022 Galactic Convention exclusive' },
  wondercon2021:         { key:'wondercon2021',         label:'WonderCon 2021',            family:'convention', shape:'card',  glow:'#f08a24', ar:1,     sub:'WonderCon 2021 limited edition' },
  starWarsCelebration2022:{ key:'starWarsCelebration2022',label:'Star Wars Celebration 2022',family:'convention',shape:'card', glow:'#c0c6d0', ar:1.669, sub:'Star Wars Celebration Anaheim 2022' },
};

export const STICKER_ORDER = [
  'glowChase','glowInTheDark','flockedChase','chaseGlossy','chaseFlat','specialEditionSeal',
  'specialtySeries','funkoShop','specialEditionCard',
  'hotTopic','amazon','bam','boxlunch','entertainmentEarth','fye','galacticToys','gamestop','toysrus','walmart',
  'sdcc2011','sdcc2012','sdcc2013','sdcc2016','sdcc2018','sdcc2020','sdcc50',
  'nycc2020','fallConvention2022','galacticConvention2022','wondercon2021','starWarsCelebration2022',
];

export const FAMILY_ORDER: StickerDef['family'][] = ['chase', 'program', 'convention', 'retailer'];
export const FAMILIES: Record<string, string> = {
  chase:      'Chase & Editions',
  program:    'Funko Programs',
  convention: 'Conventions',
  retailer:   'Retailers',
};

// Metro bundler requires static require() — explicit map for all 31 assets
export const STICKER_IMAGES: Record<string, ReturnType<typeof require>> = {
  glowChase:              require('../assets/stickers/glow-chase.png'),
  glowInTheDark:          require('../assets/stickers/glow-in-the-dark.png'),
  flockedChase:           require('../assets/stickers/flocked-chase.png'),
  chaseGlossy:            require('../assets/stickers/chase-glossy.png'),
  chaseFlat:              require('../assets/stickers/chase-flat.png'),
  specialEditionSeal:     require('../assets/stickers/special-edition-seal.png'),
  specialtySeries:        require('../assets/stickers/specialty-series.png'),
  funkoShop:              require('../assets/stickers/funko-shop.png'),
  specialEditionCard:     require('../assets/stickers/special-edition-card.png'),
  hotTopic:               require('../assets/stickers/hot-topic.png'),
  amazon:                 require('../assets/stickers/amazon.png'),
  bam:                    require('../assets/stickers/bam.png'),
  boxlunch:               require('../assets/stickers/boxlunch.png'),
  entertainmentEarth:     require('../assets/stickers/entertainment-earth.png'),
  fye:                    require('../assets/stickers/fye.png'),
  galacticToys:           require('../assets/stickers/galactic-toys.png'),
  gamestop:               require('../assets/stickers/gamestop.png'),
  toysrus:                require('../assets/stickers/toys-r-us.png'),
  walmart:                require('../assets/stickers/walmart.png'),
  sdcc2011:               require('../assets/stickers/sdcc-2011.png'),
  sdcc2012:               require('../assets/stickers/sdcc-2012.png'),
  sdcc2013:               require('../assets/stickers/sdcc-2013.png'),
  sdcc2016:               require('../assets/stickers/sdcc-2016.png'),
  sdcc2018:               require('../assets/stickers/sdcc-2018.png'),
  sdcc2020:               require('../assets/stickers/sdcc-2020.png'),
  sdcc50:                 require('../assets/stickers/sdcc-50.png'),
  nycc2020:               require('../assets/stickers/nycc-2020.png'),
  fallConvention2022:     require('../assets/stickers/fall-convention-2022.png'),
  galacticConvention2022: require('../assets/stickers/galactic-convention-2022.png'),
  wondercon2021:          require('../assets/stickers/wondercon-2021.png'),
  starWarsCelebration2022:require('../assets/stickers/star-wars-celebration-2022.png'),
};

// Runtime catalog loaded from DB — overrides the static catalog for updated metadata/images
let _runtimeCatalog: Record<string, StickerDef> = {};

/** Call once at app start with rows fetched from the `stickers` DB table */
export function setStickerCatalog(rows: StickerDef[]) {
  _runtimeCatalog = {};
  for (const row of rows) _runtimeCatalog[row.key] = row;
}

export function resolveStickerKeys(keys: string[] | null | undefined): StickerDef[] {
  if (!keys || keys.length === 0) return [];
  return keys.slice(0, 3)
    .map((k) => _runtimeCatalog[k] ?? STICKERS[k])
    .filter(Boolean);
}
