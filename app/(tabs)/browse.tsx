import React, { useState, useMemo, useCallback } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';

import { useAppStore } from '@/stores/appStore';
import { buildTheme } from '@/lib/theme';
import { CATEGORIES, fmtPrice } from '@/lib/appConfig';
import { SKU } from '@/lib/types';

import AppHeader from '@/components/AppHeader';
import { HotScoreBadge } from '@/components/HotScore';
import { ProductThumb } from '@/components/ProductPlaceholder';

// ── Category images (same assets as onboarding) ───────────────────────────────

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

// ── Category card (matches onboarding design exactly) ─────────────────────────

function CategoryCard({
  catId, label, cardWidth, onPress,
}: {
  catId: string; label: string; cardWidth: number; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: cardWidth,
        backgroundColor: '#131316',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.07)',
        padding: 7,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      {/* Photo area */}
      <View style={{ height: 68, borderRadius: 10, overflow: 'hidden' }}>
        <Image
          source={CAT_IMAGE[catId]}
          style={{ width: '100%', height: 68 }}
          resizeMode="cover"
        />
      </View>
      {/* Label */}
      <Text style={{
        fontFamily: 'Inter_600SemiBold',
        fontSize: 14,
        color: '#F5F4F2',
        textAlign: 'center',
        marginTop: 7,
        marginBottom: 2,
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const router  = useRouter();
  const isDark  = useAppStore((s) => s.isDark);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const theme   = buildTheme(isDark);
  const { width: sw } = useWindowDimensions();

  const [query, setQuery]     = useState('');
  const [scrolled, setScrolled] = useState(false);

  const CARD_W = (sw - 40 - 10) / 2; // 20px padding each side, 10px gap

  const trimmedQuery = query.trim().toLowerCase();

  const skuMatches: SKU[] = useMemo(() => {
    if (!trimmedQuery) return [];
    return hotSkus.filter((s) => s.name.toLowerCase().includes(trimmedQuery)).slice(0, 5);
  }, [hotSkus, trimmedQuery]);

  const filteredCategories = useMemo(() =>
    CATEGORIES.filter((c) => !trimmedQuery || c.label.toLowerCase().includes(trimmedQuery)),
  [trimmedQuery]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    setScrolled(e.nativeEvent.contentOffset.y > 10);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader title="Browse" theme={theme} scrolled={scrolled} />

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Search */}
        <View style={{
          marginHorizontal: 20, marginTop: 6, marginBottom: 20,
          height: 48, backgroundColor: theme.surface,
          borderRadius: 14, flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 14, gap: 10,
          borderWidth: 0.5, borderColor: theme.hairline,
        }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={7} />
            <Path d="M21 21l-4.3-4.3" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search SKUs and categories"
            placeholderTextColor={theme.faint}
            style={{ flex: 1, color: theme.text, fontSize: 15, fontFamily: 'Inter_400Regular' }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* SKU search results */}
        {skuMatches.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 20, gap: 6 }}>
            <Text style={{
              fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.faint,
              letterSpacing: 0.1 * 11, textTransform: 'uppercase', paddingLeft: 4, marginBottom: 2,
            }}>
              Matching SKUs
            </Text>
            {skuMatches.map((sku) => (
              <Pressable
                key={sku.id}
                onPress={() => router.push(`/sku/${sku.id}`)}
                style={({ pressed }) => ({
                  backgroundColor: theme.surface, borderRadius: theme.radius, padding: 10,
                  flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.78 : 1,
                })}
              >
                <ProductThumb sku={sku} theme={theme} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: theme.fontDispBold, fontSize: 14, color: theme.text, letterSpacing: -0.2 }} numberOfLines={1}>
                    {sku.name}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    {fmtPrice(sku.price.median)}
                  </Text>
                </View>
                <HotScoreBadge sku={sku} theme={theme} size="sm" showSpark={false} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Category grid */}
        {filteredCategories.length === 0 ? (
          <View style={{ padding: 36, alignItems: 'center', marginHorizontal: 20, backgroundColor: theme.surface, borderRadius: theme.radius }}>
            <Text style={{ fontFamily: theme.fontDispBold, fontSize: 16, color: theme.text }}>
              No categories
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, marginTop: 4 }}>
              Nothing matches "{query}".
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {filteredCategories.map((cat) => (
              <CategoryCard
                key={cat.id}
                catId={cat.id}
                label={cat.label}
                cardWidth={CARD_W}
                onPress={() => router.push(`/catalog/category/${cat.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
