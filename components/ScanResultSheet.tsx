import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';

import Sheet from '@/components/Sheet';
import { Theme, categoryColor } from '@/lib/theme';
import { ScanResult } from '@/lib/types';
import { catById, fmtPrice } from '@/lib/appConfig';

// Inline category thumb using the same colour system as ProductPlaceholder
function CatalogThumb({ categoryId, size, theme }: { categoryId: string; size: number; theme: Theme }) {
  const c   = categoryColor(categoryId, theme.dark);
  const cat = catById(categoryId);
  return (
    <View style={{
      width: size, height: size,
      borderRadius: Math.max(8, size * 0.18),
      backgroundColor: c.tint,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Text style={{
        fontFamily: 'Inter_700Bold',
        fontSize: size * 0.24,
        color: c.ink,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        {cat?.short?.slice(0, 3) ?? '???'}
      </Text>
    </View>
  );
}

function ResultImage({ uri, size, theme }: { uri: string; size: number; theme: Theme }) {
  const [errored, setErrored] = useState(false);
  if (errored) return <CatalogThumb categoryId="" size={size} theme={theme} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: Math.max(8, size * 0.18) }}
      resizeMode="cover"
      onError={() => setErrored(true)}
    />
  );
}

interface CategoryBadgeProps {
  categoryId: string;
  theme: Theme;
}

function CategoryBadge({ categoryId, theme }: CategoryBadgeProps) {
  const c   = categoryColor(categoryId, theme.dark);
  const cat = catById(categoryId);
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.tint,
    }}>
      <Text style={{
        fontFamily: 'Inter_700Bold',
        fontSize: 10,
        color: c.ink,
        letterSpacing: 0.08 * 10,
        textTransform: 'uppercase',
      }}>
        {cat?.short ?? categoryId}
      </Text>
    </View>
  );
}

interface ScoreBarProps {
  score: number;
  theme: Theme;
}

function ScoreBar({ score, theme }: ScoreBarProps) {
  const fillColor =
    score >= 80 ? theme.gold :
    score >= 65 ? theme.accent :
    score >= 40 ? theme.text :
    theme.faint;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{
        flex: 1, height: 10, borderRadius: 5,
        backgroundColor: theme.surface2,
        overflow: 'hidden',
      }}>
        <View style={{
          width: `${Math.min(100, Math.max(0, score))}%`,
          height: '100%',
          backgroundColor: fillColor,
          borderRadius: 5,
        }} />
      </View>
      <Text style={{
        fontFamily: 'Inter_700Bold',
        fontSize: 14,
        color: fillColor,
        minWidth: 28,
        textAlign: 'right',
      }}>
        {score}
      </Text>
    </View>
  );
}

interface ScanResultSheetProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  result: ScanResult | null;
  onWatch: () => void;
  onCollect: () => void;
  onDiscard: () => void;
}

export default function ScanResultSheet({
  open,
  onClose,
  theme,
  result,
  onWatch,
  onCollect,
  onDiscard,
}: ScanResultSheetProps) {
  const router = useRouter();

  if (!result) return null;

  const isHot       = result.scoreEstimate >= 65;
  const scoreLabel  = result.skuId ? 'Hot Score' : 'Estimated Score';

  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="Scan Result">
      {/* ── Identity ──────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
        {result.imageUrl
          ? <ResultImage uri={result.imageUrl} size={64} theme={theme} />
          : <CatalogThumb categoryId={result.categoryId} size={64} theme={theme} />
        }
        <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
          <Text
            style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: theme.text, letterSpacing: -0.3, lineHeight: 22 }}
            numberOfLines={2}
          >
            {result.name}
          </Text>
          {!!result.series && (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted }} numberOfLines={1}>
              {result.series}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            <CategoryBadge categoryId={result.categoryId} theme={theme} />
            {result.isNewToCatalog && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#065F46' }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#6EE7B7', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  New Discovery
                </Text>
              </View>
            )}
            {isHot && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.gold }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.goldInk, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Hot
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── Score ─────────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: theme.surface2,
        borderRadius: theme.radius,
        padding: 14,
        marginBottom: 14,
        gap: 8,
      }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.muted, letterSpacing: 0.1 * 11, textTransform: 'uppercase' }}>
          {scoreLabel}
        </Text>
        <ScoreBar score={result.scoreEstimate} theme={theme} />
      </View>

      {/* ── Price ─────────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: theme.surface2,
        borderRadius: theme.radius,
        padding: 14,
        marginBottom: 14,
        gap: 10,
      }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { label: 'Low',    value: result.price.low    },
            { label: 'Median', value: result.price.median },
            { label: 'High',   value: result.price.high   },
          ] as { label: string; value: number }[]).map((p) => (
            <View key={p.label} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.text }}>
                {fmtPrice(p.value)}
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.muted }}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.faint, textAlign: 'center' }}>
          {result.listings} active listing{result.listings !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        {/* View full details — only when SKU is already tracked */}
        {!!result.skuId && (
          <Pressable
            onPress={() => { onClose(); router.push(`/sku/${result.skuId}`); }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 14,
              borderRadius: theme.radius,
              borderWidth: 1,
              borderColor: theme.accent,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: theme.accent }}>
              View Full Details →
            </Text>
          </Pressable>
        )}

        {/* Watch */}
        <Pressable
          onPress={onWatch}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            borderRadius: theme.radius,
            backgroundColor: theme.accent,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.accentInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <Path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill={theme.accentInk} />
          </Svg>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: theme.accentInk }}>
            Add to Watchlist
          </Text>
        </Pressable>

        {/* Collect */}
        <Pressable
          onPress={onCollect}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            borderRadius: theme.radius,
            backgroundColor: theme.surface2,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.text} strokeWidth={2.2} strokeLinecap="round">
            <Path d="M12 5v14M5 12h14" />
          </Svg>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: theme.text }}>
            Add to Collection
          </Text>
        </Pressable>

        {/* Discard */}
        <Pressable
          onPress={onDiscard}
          style={({ pressed }) => ({
            alignItems: 'center',
            paddingVertical: 10,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted }}>
            Not the right product? Discard
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
