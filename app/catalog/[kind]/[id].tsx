import React, { useState, useMemo, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { useAppStore } from '@/stores/appStore';
import { buildTheme } from '@/lib/theme';
import { getFeaturedSku } from '@/lib/featured';
import { catById, fandomById } from '@/lib/appConfig';

import AppHeader from '@/components/AppHeader';
import IconButton from '@/components/IconButton';
import SKUCard from '@/components/SKUCard';

type SortBy = 'hot' | 'velocity' | 'price';

export default function CatalogListScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const router = useRouter();

  const isDark = useAppStore((s) => s.isDark);
  const hotSkus = useAppStore((s) => s.hotSkus);
  const theme = buildTheme(isDark);

  const [sortBy, setSortBy] = useState<SortBy>('hot');
  const [scrolled, setScrolled] = useState(false);

  const label =
    kind === 'category' ? catById(id ?? '')?.label :
    kind === 'fandom'   ? fandomById(id ?? '')?.label :
    id ?? '';

  const filtered = useMemo(() => {
    const list = hotSkus.filter((s) =>
      kind === 'category' ? s.category === id : s.fandomIds.includes(id ?? '')
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'velocity') return b.delta - a.delta;
      if (sortBy === 'price')    return b.price.median - a.price.median;
      return b.hot - a.hot;
    });
  }, [hotSkus, kind, id, sortBy]);

  const hero = getFeaturedSku(filtered);
  const rest = filtered.filter((s) => s.id !== hero?.id);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      setScrolled(e.nativeEvent.contentOffset.y > 4);
    },
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader
        title={label ?? ''}
        theme={theme}
        scrolled={scrolled}
        leading={
          <IconButton
            theme={theme}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Svg
              width={20} height={20} viewBox="0 0 24 24"
              fill="none" stroke={theme.text} strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round"
            >
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
          </IconButton>
        }
      />

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Sort / count row ── */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 14,
          justifyContent: 'space-between',
        }}>
          <Text style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 12.5,
            color: theme.muted,
          }}>
            {filtered.length} tracked
          </Text>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {([['hot', 'Hot'], ['velocity', 'Δ'], ['price', '$']] as [SortBy, string][]).map(([sid, slabel]) => (
              <Pressable
                key={sid}
                onPress={() => setSortBy(sid)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: sortBy === sid ? theme.surface2 : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontFamily: sortBy === sid ? 'Inter_700Bold' : 'Inter_400Regular',
                  fontSize: 12,
                  color: sortBy === sid ? theme.text : theme.muted,
                }}>
                  {slabel}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── SKU list ── */}
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {filtered.length === 0 ? (
            <View style={{
              padding: 36,
              alignItems: 'center',
              backgroundColor: theme.surface,
              borderRadius: theme.radius,
              borderWidth: 0.5,
              borderStyle: 'dashed',
              borderColor: theme.hairline,
            }}>
              <Text style={{
                color: theme.text,
                fontSize: 17,
                fontFamily: theme.fontDispBold,
              }}>
                Nothing here yet
              </Text>
              <Text style={{
                color: theme.muted,
                fontSize: 13,
                fontFamily: 'Inter_400Regular',
                marginTop: 4,
                textAlign: 'center',
              }}>
                The pipeline will surface items soon.
              </Text>
            </View>
          ) : (
            <>
              {hero && (
                <SKUCard
                  key={hero.id}
                  sku={hero}
                  theme={theme}
                  density="hero"
                  onPress={() =>
                    router.push(`/sku/${hero.id}?filterKind=${kind}&filterId=${id}`)
                  }
                />
              )}
              {rest.map((sku, index) => (
                <SKUCard
                  key={sku.id}
                  sku={sku}
                  theme={theme}
                  density="medium"
                  rank={index + 2}
                  onPress={() =>
                    router.push(`/sku/${sku.id}?filterKind=${kind}&filterId=${id}`)
                  }
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
