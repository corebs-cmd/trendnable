import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, Animated, Easing,
  Image, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAppStore } from '../../stores/appStore';
import { CATEGORIES, CATEGORY_FANDOM_MAP } from '../../lib/appConfig';
import { SKU, CollectionItem } from '../../lib/types';
import * as api from '../../lib/api';

// ── Design tokens (spec-exact) ────────────────────────────────────────────────

const BG      = '#0A0A0B';
const SURF    = '#131316';
const CTRL    = '#1C1C1F';
const ORANGE  = '#FF5B04';
const ORANGEL = '#FF8A50';
const TEAL    = '#2DD4BF';
const TEXT1   = '#F5F4F2';
const TEXT2   = '#9A9891';
const TEXT3   = '#6F6E68';
const HAIR    = 'rgba(255,255,255,0.07)';

// ── Fandom chip data ──────────────────────────────────────────────────────────

type OFandom = { id: string; label: string; mono: string; color: string };

const ONBOARDING_FANDOMS: OFandom[] = [
  { id: 'pokemon',    label: 'Pokémon',     mono: 'PK', color: '#FFCB05' },
  { id: 'starwars',   label: 'Star Wars',   mono: 'SW', color: '#AEB8C6' },
  { id: 'marvel',     label: 'Marvel',      mono: 'MV', color: '#ED1D24' },
  { id: 'dc',         label: 'DC / Batman', mono: 'DC', color: '#2563EB' },
  { id: 'anime',      label: 'Anime',       mono: 'AN', color: '#FF4FA3' },
  { id: 'sports',     label: 'Sports',      mono: 'SP', color: '#34C759' },
  { id: 'videogames', label: 'Video Games', mono: 'VG', color: '#9146FF' },
  { id: 'nostalgia',  label: 'Nostalgia',   mono: 'NS', color: '#FF9E3D' },
];

// ── Category photo-area accent colors + placeholder labels ────────────────────

const CAT_ACCENT: Record<string, string> = {
  funko:       '#4A7DFF',
  tcg:         '#8B5CF6',
  popmart:     '#EC4899',
  hottoys:     '#D4A028',
  neca:        '#E23D3D',
  hwheels:     '#35C0ED',
  autographed: '#2DD4BF',
  thrilljoy:   '#4CAF50',
};

const CAT_LABEL: Record<string, string> = {
  funko:       'FUNKO POP',
  tcg:         'GRADED CARD',
  popmart:     'BLIND BOX',
  hottoys:     '1:6 FIGURE',
  neca:        'NECA FIGURE',
  hwheels:     'DIECAST CAR',
  autographed: 'SIGNED ITEM',
  thrilljoy:   'THRILLJOY BOX',
};

const DEFAULT_CATS    = [] as string[];
const DEFAULT_FANDOMS = [] as string[];

// ── Category photo images ─────────────────────────────────────────────────────

const CAT_IMAGE: Record<string, any> = {
  funko:       require('../../assets/cat_funko.jpg'),
  tcg:         require('../../assets/cat_tcg.jpg'),
  popmart:     require('../../assets/cat_popmart.jpg'),
  hottoys:     require('../../assets/cat_hottoys.jpg'),
  neca:        require('../../assets/cat_neca.jpg'),
  hwheels:     require('../../assets/cat_hwheels.jpg'),
  autographed: require('../../assets/cat_autographed.jpg'),
  thrilljoy:   require('../../assets/cat_thrilljoy.jpg'),
};

function CategoryPhotoArea({ catId }: { catId: string }) {
  return (
    <View style={{ height: 68, borderRadius: 10, overflow: 'hidden' }}>
      <Image
        source={CAT_IMAGE[catId]}
        style={{ width: '100%', height: 68 }}
        resizeMode="cover"
      />
    </View>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

interface CardProps {
  catId: string;
  label: string;
  selected: boolean;
  onToggle: (id: string) => void;
  cardWidth: number;
  isDefault: boolean;
}

function CategoryCard({ catId, label, selected, onToggle, cardWidth, isDefault }: CardProps) {
  const badgeAnim = useRef(new Animated.Value(isDefault ? 1 : 0)).current;

  useEffect(() => {
    if (selected) {
      Animated.timing(badgeAnim, {
        toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(badgeAnim, {
        toValue: 0, duration: 100, useNativeDriver: true,
      }).start();
    }
  }, [selected]);

  return (
    <Pressable
      onPress={() => onToggle(catId)}
      style={[
        styles.card,
        { width: cardWidth },
        selected && {
          borderColor: ORANGE,
          shadowColor: ORANGE,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 20,
          shadowOpacity: 0.22,
        },
      ]}
    >
      {/* Photo area */}
      <View style={{ position: 'relative' }}>
        <CategoryPhotoArea catId={catId} />
        {/* Check badge — always mounted, animated in/out */}
        <Animated.View
          style={[
            styles.checkBadge,
            {
              opacity: badgeAnim,
              transform: [{ scale: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.checkGlyph}>✓</Text>
        </Animated.View>
      </View>

      {/* Label */}
      <Text style={styles.cardLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Fandom chip ───────────────────────────────────────────────────────────────

function FandomChip({ fandom, selected, onToggle }: {
  fandom: OFandom; selected: boolean; onToggle: (id: string) => void;
}) {
  const chipBg     = selected ? fandom.color : SURF;
  const chipBorder = selected ? fandom.color : 'rgba(255,255,255,0.1)';
  const chipText   = selected ? '#0A0A0B' : TEXT1;
  const dotBg      = selected ? 'rgba(0,0,0,0.28)' : fandom.color;
  const monoText   = selected ? '#FFFFFF' : '#0A0A0B';

  return (
    <Pressable
      onPress={() => onToggle(fandom.id)}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: chipBg,
        borderWidth: 1.5, borderColor: chipBorder,
        borderRadius: 22,
        paddingLeft: 10, paddingRight: 16,
        minHeight: 44,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: dotBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 9.5, color: monoText }}>
          {fandom.mono}
        </Text>
      </View>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: chipText }}>
        {fandom.label}
      </Text>
    </Pressable>
  );
}

// ── Mover row (Step 2) ────────────────────────────────────────────────────────

type MoverStatus = 'own' | 'hunt' | null;

function MoverRow({ sku, status, onToggle }: {
  sku: SKU; status: MoverStatus; onToggle: (id: string, action: 'own' | 'hunt') => void;
}) {
  const accent = CAT_ACCENT[sku.category] ?? '#9A9891';
  const deltaText  = sku.delta > 0 ? `↑${sku.delta}` : sku.delta < 0 ? `↓${Math.abs(sku.delta)}` : null;
  const deltaColor = sku.delta > 0 ? '#4ADE80' : '#F87171';
  const subLine    = [sku.fandom ? sku.fandom.replace(/_/g, ' ') : null, sku.category ? sku.category.replace(/_/g, ' ') : null]
    .filter(Boolean).join(' · ');

  const ownSelected  = status === 'own';
  const huntSelected = status === 'hunt';

  return (
    <View style={styles.moverRow}>
      {/* Thumbnail */}
      {sku.imageUrl ? (
        <Image source={{ uri: sku.imageUrl }} style={styles.moverThumb} />
      ) : (
        <View style={[styles.moverThumb, { backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, color: accent }}>
            {sku.category.slice(0, 3).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Middle */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.moverName}>{sku.name}</Text>
        {!!subLine && (
          <Text numberOfLines={1} style={styles.moverSub}>{subLine}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={styles.moverPrice}>${Math.round(sku.price.median)}</Text>
          {!!deltaText && (
            <Text style={[styles.moverDelta, { color: deltaColor }]}>{deltaText}</Text>
          )}
        </View>
      </View>

      {/* Own / Hunt buttons */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {/* Own */}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Pressable
            onPress={() => onToggle(sku.id, 'own')}
            style={[
              styles.actionBtn,
              ownSelected
                ? { backgroundColor: ORANGE, borderColor: ORANGE }
                : { backgroundColor: SURF, borderColor: 'rgba(255,255,255,0.16)' },
            ]}
          >
            <Text style={{ fontSize: 17, color: ownSelected ? '#FFFFFF' : TEXT2, lineHeight: 22 }}>
              {ownSelected ? '✓' : '+'}
            </Text>
          </Pressable>
          <Text style={styles.actionLabel}>OWN</Text>
        </View>

        {/* Hunt */}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Pressable
            onPress={() => onToggle(sku.id, 'hunt')}
            style={[
              styles.actionBtn,
              huntSelected
                ? { backgroundColor: TEAL, borderColor: TEAL }
                : { backgroundColor: SURF, borderColor: 'rgba(255,255,255,0.16)' },
            ]}
          >
            <Text style={{ fontSize: 17, color: huntSelected ? '#06211D' : TEXT2, lineHeight: 22 }}>
              ◎
            </Text>
          </Pressable>
          <Text style={styles.actionLabel}>HUNT</Text>
        </View>
      </View>
    </View>
  );
}

// ── Shelf tile ────────────────────────────────────────────────────────────────

function ShelfTile({ sku, tint }: { sku: SKU; tint: string }) {
  const initials = sku.name.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
  return (
    <View style={{ width: 26, height: 26, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: tint }}>
      {sku.imageUrl ? (
        <Image source={{ uri: sku.imageUrl }} style={{ width: 26, height: 26 }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, color: tint }}>
            {initials}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Seed shelves ──────────────────────────────────────────────────────────────

function ShelfPanel({ type, skuIds, movers }: {
  type: 'collection' | 'watchlist'; skuIds: string[]; movers: SKU[];
}) {
  const isColl  = type === 'collection';
  const tint    = isColl ? ORANGE : TEAL;
  const header  = isColl ? ORANGEL : TEAL;
  const skus    = skuIds.map((id) => movers.find((m) => m.id === id)).filter(Boolean) as SKU[];

  return (
    <View style={{
      flex: 1,
      backgroundColor: SURF,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isColl ? 'rgba(255,91,4,0.25)' : 'rgba(45,212,191,0.25)',
      padding: 10,
      paddingHorizontal: 12,
      minHeight: 60,
    }}>
      <Text style={[styles.shelfHeader, { color: header }]}>
        {isColl ? 'COLLECTION' : 'WATCHLIST'} · {skuIds.length}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 26, marginTop: 6 }}>
        {skus.map((sku) => <ShelfTile key={sku.id} sku={sku} tint={tint} />)}
      </View>
    </View>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({
  onBack, onAction, actionLabel, disabled, paddingBottom,
}: {
  onBack: () => void; onAction: () => void; actionLabel: string; disabled?: boolean; paddingBottom: number;
}) {
  return (
    <View style={[styles.footer, { paddingBottom: paddingBottom + 16 }]}>
      <Pressable onPress={onBack} style={styles.backBtn} accessibilityLabel="Back">
        <Text style={styles.backGlyph}>←</Text>
      </Pressable>
      <Pressable
        onPress={disabled ? undefined : onAction}
        style={[styles.ctaBtn, { opacity: disabled ? 0.45 : 1 }]}
      >
        <Text style={styles.ctaLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step, paddingTop }: { step: 0 | 1; paddingTop: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop }}>
      {[0, 1].map((i) => (
        <View key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          backgroundColor: i <= step ? ORANGE : 'rgba(255,255,255,0.14)',
        }} />
      ))}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets            = useSafeAreaInsets();
  const { width: sw }     = useWindowDimensions();

  const {
    setHasOnboarded, setFollowedCategories, setFollowedFandoms,
    addToCollection, addToWatchlist,
  } = useAppStore();
  const user = useAppStore((s) => s.user);

  const [step, setStep]             = useState<0 | 1>(0);
  const [selectedCats, setCats]     = useState<string[]>(DEFAULT_CATS);
  const [selectedFandoms, setFands] = useState<string[]>(DEFAULT_FANDOMS);
  const [movers, setMovers]         = useState<SKU[]>([]);
  const [moverStatus, setStatus]    = useState<Record<string, MoverStatus>>({});
  const [loading, setLoading]       = useState(false);

  const CARD_W = (sw - 48 - 10) / 2;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const toggleCat = useCallback((id: string) => {
    setCats((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);

  const toggleFandom = useCallback((id: string) => {
    setFands((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);

  const toggleMover = useCallback((skuId: string, action: 'own' | 'hunt') => {
    setStatus((prev) => ({
      ...prev,
      [skuId]: prev[skuId] === action ? null : action,
    }));
  }, []);

  const handleContinue = async () => {
    setLoading(true);
    setStep(1);
    try {
      const items = await api.fetchOnboardingPreview(selectedCats, selectedFandoms);
      setMovers(items);
    } catch {
      // show whatever loaded (empty = no movers, still usable)
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setHasOnboarded(true);
    router.replace('/');
  };

  const handleOpen = async () => {
    // Persist preferences
    setFollowedCategories(selectedCats);
    setFollowedFandoms(selectedFandoms);

    // Seed collection (Own) and watchlist (Hunt)
    const today = new Date().toISOString().slice(0, 10);
    for (const [skuId, status] of Object.entries(moverStatus)) {
      if (!status) continue;
      const sku = movers.find((m) => m.id === skuId);
      if (!sku) continue;

      if (status === 'own') {
        addToCollection({
          skuId,
          qty: 1,
          purchased: Math.round(sku.price.median),
          purchaseDate: today,
          condition: 'near_mint',
          notes: 'onboarding_seed',
          forSale: false,
        } as CollectionItem);
      } else {
        addToWatchlist(skuId);
      }
    }

    // Sync to DB
    if (user?.id) {
      api.updateUserPreferences(user.id, {
        followedCategories: selectedCats,
        followedFandoms:    selectedFandoms,
      }).catch(() => {});
    }

    setHasOnboarded(true);
    router.replace('/');
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const ownIds  = Object.entries(moverStatus).filter(([, v]) => v === 'own').map(([k]) => k);
  const huntIds = Object.entries(moverStatus).filter(([, v]) => v === 'hunt').map(([k]) => k);

  const catCount    = selectedCats.length;
  const fandomCount = selectedFandoms.length;

  // ── Render: Step 0 ────────────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: BG }]}>
        <ProgressBar step={0} paddingTop={insets.top + 16} />

        {/* Skip */}
        <Pressable
          onPress={handleSkip}
          style={{ position: 'absolute', top: insets.top + 14, right: 24, padding: 6, zIndex: 10 }}
        >
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: TEXT2 }}>Skip</Text>
        </Pressable>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={styles.title}>What do you collect?</Text>
          <Text style={styles.subtitle}>
            Pick anything you actively follow. You can change this later.
          </Text>

          {/* Category 2-col grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                catId={cat.id}
                label={cat.label}
                selected={selectedCats.includes(cat.id)}
                onToggle={toggleCat}
                cardWidth={CARD_W}
                isDefault={false}
              />
            ))}
          </View>

          {/* Fandoms section */}
          <Text style={styles.eyebrow}>FANDOMS · TAP YOUR WORLDS</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {ONBOARDING_FANDOMS.map((f) => (
              <FandomChip
                key={f.id}
                fandom={f}
                selected={selectedFandoms.includes(f.id)}
                onToggle={toggleFandom}
              />
            ))}
          </View>

          {/* Count caption */}
          <Text style={styles.countCaption}>
            {catCount} {catCount === 1 ? 'category' : 'categories'} · {fandomCount} {fandomCount === 1 ? 'fandom' : 'fandoms'} selected
          </Text>
        </ScrollView>

        <Footer
          onBack={handleSkip}
          onAction={handleContinue}
          actionLabel="Continue"
          paddingBottom={insets.bottom}
        />
      </View>
    );
  }

  // ── Render: Step 1 ────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: BG }]}>
      <ProgressBar step={1} paddingTop={insets.top + 16} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={[styles.title, { fontSize: 30 }]}>
          Here's what's hot in your fandoms
        </Text>
        {/* Subtitle with tinted glyphs */}
        <Text style={[styles.subtitle, { fontSize: 14.5, marginBottom: 24 }]}>
          {"Tap "}
          <Text style={{ color: ORANGEL }}>+</Text>
          {" if it’s on your shelf, "}
          <Text style={{ color: TEAL }}>◎</Text>
          {" if you’re hunting it. Watch your shelves fill below."}
        </Text>

        {/* Mover list */}
        <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: HAIR }}>
          {loading ? (
            [0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={[styles.moverRow, { opacity: 0.4 }]}>
                <View style={[styles.moverThumb, { backgroundColor: SURF }]} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 14, width: '65%', borderRadius: 6, backgroundColor: SURF }} />
                  <View style={{ height: 11, width: '45%', borderRadius: 5, backgroundColor: SURF }} />
                  <View style={{ height: 11, width: '30%', borderRadius: 5, backgroundColor: SURF }} />
                </View>
              </View>
            ))
          ) : movers.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: TEXT3, textAlign: 'center' }}>
                No trending items found for your selections. Add them manually once you're in.
              </Text>
            </View>
          ) : (
            movers.map((sku, idx) => (
              <View key={sku.id}>
                {idx > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: HAIR, marginHorizontal: 0 }} />}
                <MoverRow sku={sku} status={moverStatus[sku.id] ?? null} onToggle={toggleMover} />
              </View>
            ))
          )}
        </View>

        {/* Seed shelves */}
        {movers.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <ShelfPanel type="collection" skuIds={ownIds}  movers={movers} />
            <ShelfPanel type="watchlist"  skuIds={huntIds} movers={movers} />
          </View>
        )}
      </ScrollView>

      <Footer
        onBack={() => setStep(0)}
        onAction={handleOpen}
        actionLabel="Open Trendnable"
        disabled={loading}
        paddingBottom={insets.bottom}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Category card
  card: {
    backgroundColor: SURF,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 7,
  },
  photoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  photoLabel: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  checkBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center',
  },
  checkGlyph: {
    color: '#FFF', fontSize: 13, fontFamily: 'Inter_700Bold', lineHeight: 15,
  },
  cardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14, color: TEXT1, textAlign: 'center', marginTop: 7, marginBottom: 2,
  },

  // Typography
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 32, lineHeight: 36,
    letterSpacing: -0.32, color: TEXT1, marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15, lineHeight: 22, color: TEXT2, marginBottom: 24,
  },
  eyebrow: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 11, color: TEXT2,
    letterSpacing: 11 * 0.14,
    textTransform: 'uppercase',
    marginTop: 24, marginBottom: 12,
  },
  countCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5, color: TEXT2, textAlign: 'center', marginTop: 20,
  },

  // Mover row
  moverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 14,
    backgroundColor: BG,
  },
  moverThumb: {
    width: 48, height: 48, borderRadius: 11, flexShrink: 0,
    backgroundColor: SURF,
  },
  moverName: {
    fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: TEXT1,
  },
  moverSub: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: TEXT2, marginTop: 1,
    textTransform: 'capitalize',
  },
  moverPrice: {
    fontFamily: 'Inter_700Bold', fontSize: 13, color: TEXT1,
  },
  moverDelta: {
    fontFamily: 'JetBrainsMono_400Regular', fontSize: 11,
  },
  actionBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  actionLabel: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 8.5, color: TEXT3, letterSpacing: 8.5 * 0.12,
    textTransform: 'uppercase',
  },

  // Shelf
  shelfHeader: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 9.5,
    letterSpacing: 9.5 * 0.14,
    textTransform: 'uppercase',
  },

  // Footer
  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 24, paddingTop: 12,
    backgroundColor: BG,
  },
  backBtn: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: CTRL,
    alignItems: 'center', justifyContent: 'center',
  },
  backGlyph: {
    fontFamily: 'Inter_400Regular', fontSize: 20, color: TEXT1, lineHeight: 24,
  },
  ctaBtn: {
    flex: 1, height: 52, borderRadius: 26,
    backgroundColor: ORANGE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    shadowOpacity: 0.35,
  },
  ctaLabel: {
    fontFamily: 'Inter_700Bold', fontSize: 17, color: '#FFF',
  },
});
