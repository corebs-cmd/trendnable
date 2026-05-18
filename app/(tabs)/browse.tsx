import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useAppStore } from '@/stores/appStore';
import { buildTheme, categoryColor } from '@/lib/theme';
import { CATEGORIES, FANDOMS, fmtPrice } from '@/lib/appConfig';
import { Category, Fandom, SKU } from '@/lib/types';

import AppHeader from '@/components/AppHeader';
import { HotScoreBadge } from '@/components/HotScore';
import DeltaPill from '@/components/DeltaPill';
import ProductPlaceholder, { ProductThumb } from '@/components/ProductPlaceholder';
import BrowseLogo from '@/components/BrowseLogo';

type BrowseMode = 'category' | 'fandom';

function topSkuFor(skus: SKU[], filterKey: 'category' | 'fandom', id: string): SKU | undefined {
  const list = skus.filter((s) =>
    filterKey === 'fandom' ? s.fandomIds.includes(id) : s.category === id
  );
  if (list.length === 0) return undefined;
  return list.reduce((best, s) => (s.hot > best.hot ? s : best));
}

function skuCountFor(skus: SKU[], filterKey: 'category' | 'fandom', id: string): number {
  return skus.filter((s) =>
    filterKey === 'fandom' ? s.fandomIds.includes(id) : s.category === id
  ).length;
}

export default function BrowseScreen() {
  const router = useRouter();
  const isDark = useAppStore((s) => s.isDark);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const theme = buildTheme(isDark);

  const [mode, setMode] = useState<BrowseMode>('category');
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [segmentWidth, setSegmentWidth] = useState(0);

  const indicatorAnim = useRef(new Animated.Value(4)).current;

  const trimmedQuery = query.trim().toLowerCase();

  const skuMatches: SKU[] = useMemo(() => {
    if (!trimmedQuery) return [];
    return hotSkus.filter((s) => s.name.toLowerCase().includes(trimmedQuery)).slice(0, 5);
  }, [hotSkus, trimmedQuery]);

  const groups = useMemo(() => {
    const items = mode === 'category'
      ? CATEGORIES.filter((c) => !trimmedQuery || c.label.toLowerCase().includes(trimmedQuery))
      : FANDOMS.filter((f) => !trimmedQuery || f.label.toLowerCase().includes(trimmedQuery));

    return items.map((g) => {
      const topSku = topSkuFor(hotSkus, mode === 'category' ? 'category' : 'fandom', g.id);
      const count = skuCountFor(hotSkus, mode === 'category' ? 'category' : 'fandom', g.id);
      return { group: g, topSku, count };
    });
  }, [hotSkus, mode, trimmedQuery]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    setScrolled(e.nativeEvent.contentOffset.y > 10);
  }, []);

  const switchMode = useCallback((next: BrowseMode) => {
    setMode(next);
    Animated.spring(indicatorAnim, {
      toValue: next === 'category' ? 4 : segmentWidth / 2,
      useNativeDriver: true,
      damping: 22,
      stiffness: 240,
    }).start();
  }, [indicatorAnim, segmentWidth]);

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
          marginHorizontal: 20, marginTop: 6, marginBottom: 16,
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
            placeholder="Search SKUs, categories, fandoms"
            placeholderTextColor={theme.faint}
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 15,
              fontFamily: 'Inter_400Regular',
            }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* SKU search results */}
        {skuMatches.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 16, gap: 6 }}>
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

        {/* Mode toggle */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <View
            onLayout={(e) => setSegmentWidth(e.nativeEvent.layout.width)}
            style={{
              height: 46, backgroundColor: theme.surface,
              borderRadius: 14, flexDirection: 'row', position: 'relative',
              padding: 4, borderWidth: 0.5, borderColor: theme.hairline,
            }}
          >
            <Animated.View style={{
              position: 'absolute', top: 4, bottom: 4, width: '50%',
              backgroundColor: theme.accent, borderRadius: 10,
              transform: [{ translateX: indicatorAnim }],
            }} />
            <Pressable onPress={() => switchMode('category')} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: mode === 'category' ? theme.accentInk : theme.text }}>
                By category
              </Text>
            </Pressable>
            <Pressable onPress={() => switchMode('fandom')} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: mode === 'fandom' ? theme.accentInk : theme.text }}>
                By fandom
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Group grid */}
        {groups.length === 0 ? (
          <View style={{ padding: 36, alignItems: 'center', marginHorizontal: 20, backgroundColor: theme.surface, borderRadius: theme.radius }}>
            <Text style={{ fontFamily: theme.fontDispBold, fontSize: 16, color: theme.text }}>
              No {mode === 'category' ? 'categories' : 'fandoms'}
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, marginTop: 4 }}>
              Nothing matches "{query}".
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {groups.map(({ group, topSku, count }) => {
              return (
                <Pressable
                  key={group.id}
                  onPress={() => router.push(`/catalog/${mode}/${group.id}`)}
                  style={({ pressed }) => ({
                    width: '47%',
                    backgroundColor: theme.surface, borderRadius: theme.radius,
                    overflow: 'hidden', opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {/* Full-bleed logo in 1:1 */}
                  <View style={{ aspectRatio: 1, width: '100%', position: 'relative' }}>
                    <BrowseLogo id={group.id} label={group.label} />
                    {/* Hot score pill — only when SKUs exist */}
                    {topSku && (
                      <View style={{
                        position: 'absolute', top: 8, right: 8,
                        backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.88)',
                        borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }}>
                        <Svg width={10} height={10} viewBox="0 0 16 16">
                          <Defs>
                            <LinearGradient id="flameGrad" x1="0" y1="1" x2="0" y2="0">
                              <Stop offset="0" stopColor="#FFCC00" />
                              <Stop offset="0.5" stopColor="#FF6B00" />
                              <Stop offset="1" stopColor="#FF2D00" />
                            </LinearGradient>
                          </Defs>
                          <Path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16z" fill="url(#flameGrad)" />
                        </Svg>
                        <Text style={{ fontFamily: theme.fontMonoBold, fontSize: 11, color: theme.text }}>
                          {topSku.hot}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Footer */}
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontFamily: theme.fontDispBold, fontSize: 15, color: theme.text, letterSpacing: -0.2, lineHeight: 18, marginBottom: 6 }} numberOfLines={1}>
                      {group.label}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: theme.muted }}>
                        {count} tracked
                      </Text>
                      {topSku && <DeltaPill delta={topSku.delta} theme={theme} size="sm" />}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
