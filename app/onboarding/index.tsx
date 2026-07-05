import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, Animated, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../stores/appStore';
import { buildTheme, Theme, categoryColor } from '../../lib/theme';
import { CATEGORIES, FANDOMS, CATEGORY_FANDOM_MAP, catById, fandomById, fmtPrice } from '../../lib/appConfig';
import { SKU } from '../../lib/types';
import * as api from '../../lib/api';
import { ProductThumb } from '../../components/ProductPlaceholder';
import { HotScoreBadge } from '../../components/HotScore';
import DeltaPill from '../../components/DeltaPill';

const BG = '#0D0D0D';
const ACCENT = '#FF5500';
const MUTED = '#8A9296';
const HEADING = '#EDEFF0';
const CAT_TILE_BG = '#141414';
const CHIP_BG = '#202020';

const DEFAULT_CATS = ['funko', 'tcg'];

function deriveFandoms(cats: string[]): string[] {
  return [...new Set(cats.flatMap((c) => CATEGORY_FANDOM_MAP[c] ?? []))];
}

// ── Shimmer block ─────────────────────────────────────────────────────────────

function ShimmerBlock({ w, h, r = 4 }: { w: number | string; h: number; r?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <View style={{ width: w as number, height: h, borderRadius: r, backgroundColor: '#252525', overflow: 'hidden' }}>
      <Animated.View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#fff',
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.07] }),
        }}
      />
    </View>
  );
}

// ── Category tile ─────────────────────────────────────────────────────────────

function CategoryTile({
  catId, label, selected, onToggle, tileWidth,
}: {
  catId: string; label: string; selected: boolean; onToggle: (id: string) => void; tileWidth: number;
}) {
  const c = categoryColor(catId, true);
  const cat = catById(catId);
  const typeLabel = cat?.type === 'card' ? 'CARD' : cat?.type === 'box' ? 'BOX' : cat?.type === 'car' ? 'CAR' : 'FIGURE';

  return (
    <Pressable
      onPress={() => onToggle(catId)}
      style={[
        {
          width: tileWidth,
          backgroundColor: CAT_TILE_BG,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: selected ? ACCENT : 'rgba(255,255,255,0.06)',
          padding: 7,
        },
        selected && {
          shadowColor: ACCENT,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 8,
          shadowOpacity: 0.22,
        },
      ]}
    >
      {/* Image area */}
      <View style={{
        height: 52,
        borderRadius: 12,
        backgroundColor: c.tint,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 9, color: c.ink, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>
          {typeLabel}
        </Text>
        {selected && (
          <View style={{
            position: 'absolute', top: 5, right: 5,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: ACCENT,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, shadowOpacity: 0.5,
          }}>
            <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_700Bold', lineHeight: 14 }}>✓</Text>
          </View>
        )}
      </View>

      {/* Label */}
      <Text style={{
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
        color: '#E1E4E6',
        marginTop: 7,
        textAlign: 'center',
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Preview item card ─────────────────────────────────────────────────────────

function PreviewItemCard({ sku, theme }: { sku: SKU; theme: Theme }) {
  const cat = catById(sku.category);
  const fandom = fandomById(sku.fandom);
  const subLine = [fandom?.label, cat?.label].filter(Boolean).join(' · ');

  return (
    <View style={{
      flexDirection: 'row',
      gap: 14,
      backgroundColor: '#171717',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      alignItems: 'center',
    }}>
      <ProductThumb sku={sku} theme={theme} size={58} radius={14} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15.5, color: '#E1E4E6' }}>
          {sku.name}
        </Text>
        {!!subLine && (
          <Text numberOfLines={1} style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#8A9296', marginTop: 2 }}>
            {subLine}
          </Text>
        )}
        <Text style={{ fontFamily: 'JetBrainsMono_400Regular', fontSize: 12.5, marginTop: 3 }}>
          <Text style={{ color: '#B9BDBF' }}>{fmtPrice(sku.price.median)}</Text>
          <Text style={{ color: '#8A9296' }}> median</Text>
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <HotScoreBadge sku={sku} theme={theme} size="sm" showSpark={false} />
        <DeltaPill delta={sku.delta} theme={theme} size="sm" />
      </View>
    </View>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={{
      flexDirection: 'row',
      gap: 14,
      backgroundColor: '#171717',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      alignItems: 'center',
    }}>
      <ShimmerBlock w={58} h={58} r={14} />
      <View style={{ flex: 1, gap: 6 }}>
        <ShimmerBlock w="72%" h={14} r={6} />
        <ShimmerBlock w="46%" h={11} r={5} />
        <ShimmerBlock w="30%" h={11} r={5} />
      </View>
      <ShimmerBlock w={50} h={26} r={13} />
    </View>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({
  onBack, onAction, actionLabel, disabled, insets,
}: {
  onBack: () => void;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <LinearGradient
        colors={['rgba(13,13,13,0)', 'rgba(13,13,13,1)']}
        style={{ height: 32 }}
        pointerEvents="none"
      />
      <View style={{
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 24,
        paddingBottom: insets.bottom + 16,
        backgroundColor: BG,
      }}>
        <Pressable
          onPress={onBack}
          style={{
            width: 54, height: 54, borderRadius: 16,
            backgroundColor: CHIP_BG,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 20, color: '#E1E4E6', lineHeight: 26 }}>←</Text>
        </Pressable>

        <Pressable
          onPress={disabled ? undefined : onAction}
          style={{
            flex: 1, height: 54, borderRadius: 16,
            backgroundColor: disabled ? 'rgba(255,85,0,0.4)' : ACCENT,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: ACCENT,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 16,
            shadowOpacity: disabled ? 0 : 0.5,
          }}
        >
          <Text style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 16.5,
            color: disabled ? 'rgba(255,255,255,0.75)' : '#fff',
          }}>
            {actionLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Screen 1 — Personalize ────────────────────────────────────────────────────

function PersonalizeStep({
  tileWidth, theme, selectedCats, selectedFandoms, onToggleCat, onToggleFandom, onBack, onContinue, insets,
}: {
  tileWidth: number;
  theme: Theme;
  selectedCats: string[];
  selectedFandoms: string[];
  onToggleCat: (id: string) => void;
  onToggleFandom: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{
          fontFamily: 'Fraunces_600SemiBold',
          fontSize: 30,
          lineHeight: 32,
          letterSpacing: -0.5,
          color: HEADING,
          marginBottom: 8,
        }}>
          What do you collect?
        </Text>
        <Text style={{
          fontFamily: 'Inter_400Regular',
          fontSize: 14.5,
          lineHeight: 21,
          color: MUTED,
          marginBottom: 24,
        }}>
          Pick anything you actively follow. You can change this later.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {CATEGORIES.map((cat) => (
            <CategoryTile
              key={cat.id}
              catId={cat.id}
              label={cat.label}
              selected={selectedCats.includes(cat.id)}
              onToggle={onToggleCat}
              tileWidth={tileWidth}
            />
          ))}
        </View>

        {/* Fandoms section label */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 28, marginBottom: 14 }}>
          <Text style={{
            fontFamily: 'Inter_700Bold',
            fontSize: 11.5,
            letterSpacing: 0.09 * 11.5,
            textTransform: 'uppercase',
            color: '#9a9fa2',
          }}>
            FANDOMS
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12.5, color: '#6d7376' }}>
            · optional · auto-picked from your categories
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {FANDOMS.map((fandom) => {
            const active = selectedFandoms.includes(fandom.id);
            return (
              <Pressable
                key={fandom.id}
                onPress={() => onToggleFandom(fandom.id)}
                style={{
                  backgroundColor: active ? ACCENT : CHIP_BG,
                  borderWidth: 1,
                  borderColor: active ? ACCENT : 'rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text style={{
                  fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium',
                  fontSize: 14,
                  color: active ? '#fff' : '#A9AEB1',
                }}>
                  {fandom.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Footer
        onBack={onBack}
        onAction={onContinue}
        actionLabel="Continue"
        insets={insets}
      />
    </>
  );
}

// ── Screen 2 — Live preview ───────────────────────────────────────────────────

function PreviewStep({
  theme, items, loading, pickCount, onBack, onOpen, insets,
}: {
  theme: Theme;
  items: SKU[];
  loading: boolean;
  pickCount: number;
  onBack: () => void;
  onOpen: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{
          fontFamily: 'Fraunces_600SemiBold',
          fontSize: 29,
          lineHeight: 32,
          letterSpacing: -0.4,
          color: HEADING,
          marginBottom: 10,
        }}>
          Here's what's hot in your fandoms today
        </Text>

        {/* Tuned-to flourish */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <View style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: ACCENT,
            shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6, shadowOpacity: 0.9,
          }} />
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13.5, color: '#B0B4B6' }}>
            Tuned to your{' '}
            <Text style={{ fontFamily: 'Inter_700Bold', color: ACCENT }}>{pickCount}</Text>
            {' '}picks
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : items.length > 0 ? (
            items.map((sku) => (
              <PreviewItemCard key={sku.id} sku={sku} theme={theme} />
            ))
          ) : (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}
        </View>
      </ScrollView>

      <Footer
        onBack={onBack}
        onAction={onOpen}
        actionLabel="Open Trendnable"
        disabled={loading}
        insets={insets}
      />
    </>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isDark = useAppStore((s) => s.isDark);
  const theme = buildTheme(isDark);
  const { setHasOnboarded, setFollowedCategories, setFollowedFandoms } = useAppStore();

  const [step, setStep] = useState<0 | 1>(0);
  const [selectedCats, setSelectedCats] = useState<string[]>(DEFAULT_CATS);
  const [selectedFandoms, setSelectedFandoms] = useState<string[]>(() => deriveFandoms(DEFAULT_CATS));
  const [previewItems, setPreviewItems] = useState<SKU[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const toggleCat = useCallback((id: string) => {
    setSelectedCats((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const next = [...cur, id];
      const mapped = CATEGORY_FANDOM_MAP[id] ?? [];
      setSelectedFandoms((prev) => {
        const toAdd = mapped.filter((f) => !prev.includes(f));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
      return next;
    });
  }, []);

  const toggleFandom = useCallback((id: string) => {
    setSelectedFandoms((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }, []);

  const handleContinue = async () => {
    setPreviewLoading(true);
    setStep(1);
    try {
      const items = await api.fetchOnboardingPreview(selectedCats, selectedFandoms);
      setPreviewItems(items);
    } catch {
      // render empty → skeleton fallback in PreviewStep
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpen = async () => {
    setFollowedCategories(selectedCats);
    setFollowedFandoms(selectedFandoms);
    const { user } = useAppStore.getState();
    if (user) {
      api.updateUserPreferences(user.id, {
        followedCategories: selectedCats,
        followedFandoms: selectedFandoms,
      }).catch(() => {});
    }
    setHasOnboarded(true);
    router.replace('/');
  };

  const handleSkip = () => {
    setHasOnboarded(true);
    router.replace('/');
  };

  const tileWidth = (screenWidth - 48 - 9) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Progress bar */}
      <View style={{
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 24,
        paddingTop: insets.top + 16,
        marginBottom: 0,
      }}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= step ? ACCENT : 'rgba(255,255,255,0.13)',
            }}
          />
        ))}
      </View>

      {/* Skip — only on step 0 */}
      {step === 0 && (
        <Pressable
          onPress={handleSkip}
          style={{ position: 'absolute', top: insets.top + 14, right: 24, padding: 6, zIndex: 10 }}
        >
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: MUTED }}>Skip</Text>
        </Pressable>
      )}

      {step === 0 ? (
        <PersonalizeStep
          tileWidth={tileWidth}
          theme={theme}
          selectedCats={selectedCats}
          selectedFandoms={selectedFandoms}
          onToggleCat={toggleCat}
          onToggleFandom={toggleFandom}
          onBack={handleSkip}
          onContinue={handleContinue}
          insets={insets}
        />
      ) : (
        <PreviewStep
          theme={theme}
          items={previewItems}
          loading={previewLoading}
          pickCount={selectedCats.length + selectedFandoms.length}
          onBack={() => setStep(0)}
          onOpen={handleOpen}
          insets={insets}
        />
      )}
    </View>
  );
}
