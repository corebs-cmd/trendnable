/**
 * MostPopularCarousel — horizontally-scrolling image-first card strip.
 *
 * Design spec: /Downloads/recent_products_carousel/design_handoff_most_popular_carousel/README.md
 * Cards: 154px wide, 176px image, ±2.4° alternating tilt, −14px overlap,
 * per-category glow shadow, monospace rank chip, subtle image parallax.
 * Hides when fewer than 3 products are available.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, Pressable, Animated, Image,
  AccessibilityInfo, StyleSheet, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { fetchPopularSkus } from '@/lib/api';
import { fmtPrice } from '@/lib/appConfig';
import { SKU } from '@/lib/types';
import { buildTheme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_W       = 154;
const CARD_OVERLAP = 14;
const CARD_STEP    = CARD_W - CARD_OVERLAP;   // 140 — snap interval
const CARD_IMG_H   = 176;
const PAD_SIDE     = 30;
const PAD_TOP      = 14;
const PAD_BOTTOM   = 20;

// Image window inner width (card has 8px padding each side)
const IMG_WIN_W    = CARD_W - 16;             // 138

// Oversized image: +26% width, +16% height — allows ±16px parallax without edge exposure
const IMG_W        = Math.round(IMG_WIN_W * 1.26);    // ~174
const IMG_H        = Math.round(CARD_IMG_H * 1.16);   // ~204
const IMG_LEFT     = -Math.round(IMG_WIN_W * 0.13);   // −18
const IMG_TOP      = -Math.round(CARD_IMG_H * 0.08);  // −14

// Category glow accent colors (spec §Design Tokens)
const CAT_GLOW: Record<string, string> = {
  funko:       '#3b82f6',
  tcg:         '#f2b32c',
  hottoys:     '#f0632a',
  neca:        '#bfbfbf',
  autographed: '#e6ddc8',
  popmart:     '#d7263d',
  hwheels:     '#e23a2e',
  thrilljoy:   '#4CAF50',
};

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard({ index }: { index: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          marginRight: -CARD_OVERLAP,
          zIndex: 10 - index,
          backgroundColor: '#151515',
          opacity: anim,
          transform: [
            { rotate: index % 2 === 0 ? '-2.4deg' : '2.4deg' },
            { translateY: index % 2 === 1 ? 10 : 0 },
          ],
        },
      ]}
    >
      <View style={[styles.imgWin, { backgroundColor: '#1c1c1c' }]} />
    </Animated.View>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function CarouselCard({
  sku, index, scrollX, viewportW, reduceMotion, showPrices, bgColor,
}: {
  sku: SKU;
  index: number;
  scrollX: Animated.Value;
  viewportW: number;
  reduceMotion: boolean;
  showPrices: boolean;
  bgColor: string;
}) {
  const router = useRouter();
  const glow   = CAT_GLOW[sku.category] ?? '#3b82f6';
  const rotate = index % 2 === 0 ? '-2.4deg' : '2.4deg';
  const yOff   = index % 2 === 1 ? 10 : 0;

  // Parallax: interpolate image translateX as card traverses viewport
  const cardCenterInContent = PAD_SIDE + index * CARD_STEP + CARD_W / 2;
  const imageX = scrollX.interpolate({
    inputRange: [
      cardCenterInContent - viewportW,        // card fully to the right
      cardCenterInContent - viewportW / 2,    // card centered in viewport
      cardCenterInContent,                    // card fully to the left
    ],
    outputRange: [16, 0, -16],
    extrapolate: 'clamp',
  });

  return (
    <Pressable
      onPress={() => router.push(`/sku/${sku.id}`)}
      accessibilityLabel={`${sku.name}, ranked #${index + 1}`}
      style={[
        styles.card,
        {
          marginRight: -CARD_OVERLAP,
          zIndex: 10 - index,
          transform: [{ rotate }, { translateY: yOff }],
          shadowColor: glow,
          shadowOffset: { width: 0, height: 22 },
          shadowRadius: 22,
          shadowOpacity: 0.4,
          elevation: 12, // Android fallback
        },
      ]}
    >
      {/* Image window */}
      <View style={styles.imgWin}>
        <Animated.Image
          source={{ uri: sku.imageUrl ?? undefined }}
          style={{
            position: 'absolute',
            width: IMG_W,
            height: IMG_H,
            top: IMG_TOP,
            left: IMG_LEFT,
            transform: reduceMotion ? [] : [{ translateX: imageX }],
          }}
          resizeMode="cover"
        />

        {/* Rank chip */}
        <View style={styles.rankChip}>
          <Text style={styles.rankText}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
      </View>

      {/* Name */}
      <Text numberOfLines={1} style={styles.cardName}>{sku.name}</Text>

      {/* Price — feature-flagged via showPrices */}
      {showPrices && (
        <Text style={styles.cardPrice}>{fmtPrice(sku.price.median)}</Text>
      )}
    </Pressable>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MostPopularCarousel({ showPrices = true }: { showPrices?: boolean }) {
  const isDark          = useAppStore((s) => s.isDark);
  const theme           = buildTheme(isDark);
  const { width: sw }   = useWindowDimensions();
  const scrollX         = useRef(new Animated.Value(0)).current;

  const [products,     setProducts]     = useState<SKU[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    fetchPopularSkus(10)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  // Hide when not enough data
  if (!loading && products.length < 3) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      {/* Section header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Most Popular</Text>
        <Text style={[styles.headerMeta, { color: theme.muted }]}>top 10</Text>
      </View>

      {/* Scroll strip + right-edge fade */}
      <View>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_STEP}
          contentContainerStyle={{
            paddingLeft:   PAD_SIDE,
            paddingRight:  PAD_SIDE + 24,
            paddingTop:    PAD_TOP,
            paddingBottom: PAD_BOTTOM,
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {loading
            ? Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} index={i} />)
            : products.map((sku, i) => (
                <CarouselCard
                  key={sku.id}
                  sku={sku}
                  index={i}
                  scrollX={scrollX}
                  viewportW={sw}
                  reduceMotion={reduceMotion}
                  showPrices={showPrices}
                  bgColor={theme.bg}
                />
              ))
          }
          {/* Trailing spacer */}
          <View style={{ width: 24 }} />
        </Animated.ScrollView>

        {/* 44px right-edge fade — entices scrolling, hides next-card peek cleanly */}
        <LinearGradient
          colors={['transparent', theme.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.edgeFade}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
  },
  headerMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
  },
  card: {
    width: CARD_W,
    backgroundColor: '#171717',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#282828',
    padding: 8,
    paddingBottom: 10,
  },
  imgWin: {
    height: CARD_IMG_H,
    borderRadius: 9,
    backgroundColor: '#131313',
    overflow: 'hidden',
  },
  rankChip: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rankText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9,
    color: '#dddddd',
  },
  cardName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: '#ececec',
    textAlign: 'center',
    marginTop: 8,
  },
  cardPrice: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10.5,
    color: '#9a9a9a',
    textAlign: 'center',
    marginTop: 3,
  },
  edgeFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
  },
});
