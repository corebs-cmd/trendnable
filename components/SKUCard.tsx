import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Theme } from '@/lib/theme';
import { SKU, CardDensity } from '@/lib/types';
import { catById, fandomById, fmtPrice } from '@/lib/appConfig';
import ProductPlaceholder from '@/components/ProductPlaceholder';
import { HotScoreBadge } from '@/components/HotScore';
import DeltaPill from '@/components/DeltaPill';
import Chip from '@/components/Chip';

interface SKUCardProps {
  sku: SKU;
  theme: Theme;
  density?: CardDensity;
  onPress: () => void;
  onLongPress?: () => void;
  rank?: number;
}

// ── Hero card — "TOP FIND" editorial showcase ─────────────────────────────────
// Layout matches prototype SKUHeroCard exactly:
// [eyebrow row padding] → [body: ProductPlaceholder lg + info] → [narrative] → [footer]
function HeroCard({ sku, theme, onPress, onLongPress }: SKUCardProps) {
  const cat = catById(sku.category);
  const fandom = fandomById(sku.fandom);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        backgroundColor: theme.surface,
        borderRadius: theme.radiusLg,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Eyebrow row */}
      <View style={styles.eyebrowRow}>
        <View style={[styles.topFindPill, { backgroundColor: '#FF0025' }]}>
          <Svg width={9} height={9} viewBox="0 0 16 16">
            <Defs>
              <LinearGradient id="topFindFlameGrad" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#FFCC00" />
                <Stop offset="0.5" stopColor="#FF6B00" />
                <Stop offset="1" stopColor="#FF2D00" />
              </LinearGradient>
            </Defs>
            <Path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16z" fill="url(#topFindFlameGrad)" />
          </Svg>
          <Text style={[styles.topFindText, { color: '#FFFFFF' }]}>TOP FIND</Text>
        </View>
        <Text style={[styles.rankLabel, { color: theme.faint, fontFamily: theme.fontMonoBold }]}>
          NO. 01
        </Text>
      </View>

      {/* Body: ProductPlaceholder left, info right */}
      <View style={styles.heroBody}>
        <ProductPlaceholder sku={sku} theme={theme} size="lg" showTag={false} />

        <View style={styles.heroInfo}>
          <Text
            style={[styles.heroName, { color: theme.text, fontFamily: theme.fontDispBold }]}
            numberOfLines={3}
          >
            {sku.name}
          </Text>
          <Text
            style={[styles.heroSeries, { color: theme.muted }]}
            numberOfLines={2}
          >
            {sku.series}
          </Text>
          <View style={styles.chipsRow}>
            {cat && <Chip theme={theme} size="xs">{cat.short}</Chip>}
            {fandom && <Chip theme={theme} size="xs">{fandom.label}</Chip>}
            {sku.category === 'tcg' && sku.cardVariant && (
              <Chip theme={theme} size="xs" active>
                {sku.cardVariant === 'raw'
                  ? 'Raw'
                  : `Graded${sku.cardGrader ? ` · ${sku.cardGrader}` : ''}${sku.cardGrade ? ` ${sku.cardGrade}` : ''}`}
              </Chip>
            )}
          </View>
        </View>
      </View>

      {/* Narrative — italic Fraunces with gold left border */}
      {sku.narrative ? (
        <View style={[styles.narrativeBlock, { borderLeftColor: theme.gold }]}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.narrativeText, { color: theme.text, fontFamily: theme.fontDispItalic }]}>
            "{sku.narrative}"
          </Text>
        </View>
      ) : null}

      {/* Footer: price + listings | score badge + delta */}
      <View style={[styles.heroFooter, { borderTopColor: theme.hairline }]}>
        <View>
          <Text style={[styles.heroPrice, { color: theme.premium, fontFamily: theme.fontMonoBold }]}>
            {fmtPrice(sku.price.median)}
          </Text>
          <Text style={[styles.heroListings, { color: theme.muted, fontFamily: 'Inter_400Regular' }]}>
            {(() => {
              const sold = (sku.priceMintCount ?? 0) + (sku.priceLooseCount ?? 0);
              return sold > 0 ? `${sold} recent sales` : `${sku.listings} listed`;
            })()}
          </Text>
        </View>
        <View style={styles.footerRight}>
          <HotScoreBadge sku={sku} theme={theme} size="md" showSpark={false} />
          <DeltaPill delta={sku.delta} theme={theme} size="md" />
        </View>
      </View>
    </Pressable>
  );
}

// ── Standard card — flush-left ProductPlaceholder, editorial row ──────────────
// Card has no padding. ProductPlaceholder is flush with card edges (borderRadius: 0).
// Card overflow: hidden clips the placeholder to the card's border radius.
function StandardCard({ sku, theme, rank, onPress, onLongPress }: SKUCardProps) {
  const cat = catById(sku.category);
  const fandom = fandomById(sku.fandom);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        backgroundColor: theme.surface,
        borderRadius: theme.radius,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'stretch',
        opacity: pressed ? 0.78 : 1,
      })}
    >
      {/* ProductPlaceholder: flush left, no border radius */}
      <ProductPlaceholder
        sku={sku}
        theme={theme}
        size="sm"
        showTag
        style={{ borderRadius: 0, flexShrink: 0 }}
      />

      {/* Text content */}
      <View style={styles.standardContent}>
        {/* Top: rank + name + score badge */}
        <View style={styles.standardTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {rank != null && (
              <Text style={[styles.standardRank, { color: theme.faint, fontFamily: theme.fontMonoBold }]}>
                NO. {String(rank).padStart(2, '0')}
              </Text>
            )}
            <Text
              style={[styles.standardName, { color: theme.text, fontFamily: theme.fontDispBold }]}
              numberOfLines={2}
            >
              {sku.name}
            </Text>
            <Text
              style={[styles.standardSeries, { color: theme.muted }]}
              numberOfLines={2}
            >
              {sku.series}
            </Text>
            {sku.category === 'tcg' && sku.cardVariant && (
              <View style={{ marginTop: 4 }}>
                <Chip theme={theme} size="xs" active>
                  {sku.cardVariant === 'raw'
                    ? 'Raw'
                    : `Graded${sku.cardGrader ? ` · ${sku.cardGrader}` : ''}${sku.cardGrade ? ` ${sku.cardGrade}` : ''}`}
                </Chip>
              </View>
            )}
          </View>
          <HotScoreBadge sku={sku} theme={theme} size="sm" showSpark={false} />
        </View>

        {/* Footer: price + delta */}
        <View style={[styles.standardFooter, { borderTopColor: theme.hairline }]}>
          <Text style={[styles.standardPrice, { color: theme.premium, fontFamily: theme.fontMonoBold }]}>
            {fmtPrice(sku.price.median)}
          </Text>
          <View style={styles.footerRight}>
            <Text style={[styles.standardListings, { color: theme.muted, fontFamily: theme.fontMono }]}>
              {(() => {
                const sold = (sku.priceMintCount ?? 0) + (sku.priceLooseCount ?? 0);
                return sold > 0 ? `${sold} sales` : `${sku.listings}`;
              })()}
            </Text>
            <DeltaPill delta={sku.delta} theme={theme} size="sm" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function SKUCard(props: SKUCardProps) {
  if (props.density === 'hero') return <HeroCard {...props} />;
  return <StandardCard {...props} />;
}

const styles = StyleSheet.create({
  // ── Hero ───────────────────────────────────────────────────────────────────
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
  },
  topFindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  topFindText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.08 * 11,
    textTransform: 'uppercase',
  },
  rankLabel: {
    fontSize: 11,
    letterSpacing: 0.12 * 11,
  },
  heroBody: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    gap: 6,
  },
  heroName: {
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.44,
  },
  heroSeries: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  narrativeBlock: {
    marginHorizontal: 16,
    marginTop: 14,
    borderLeftWidth: 2,
    paddingLeft: 12,
  },
  narrativeText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heroPrice: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  heroListings: {
    fontSize: 12,
    marginTop: 3,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // ── Standard ───────────────────────────────────────────────────────────────
  standardContent: {
    flex: 1,
    minWidth: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 12,
    justifyContent: 'space-between',
  },
  standardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  standardRank: {
    fontSize: 10.5,
    letterSpacing: 0.12 * 10.5,
    marginBottom: 3,
  },
  standardName: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  standardSeries: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 4,
  },
  standardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  standardPrice: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  standardListings: {
    fontSize: 11,
  },
});
