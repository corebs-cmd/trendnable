'use client';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAppStore } from '@/stores/appStore';
import { buildTheme } from '@/lib/theme';
import { fetchSparkLedger } from '@/lib/api';
import type { SparkLedgerEntry } from '@/lib/types';

const EVENT_LABELS: Record<string, string> = {
  ppg_price:    'Price shared',
  retail_price: 'Retail price shared',
  new_sku:      'First to price this!',
  consensus:    'Price matched market',
  referral:     'Friend joined',
  streak:       '7-day streak',
  collection:   'First collection add',
  redemption:   'Reward redeemed',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function SparkLedgerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isDark  = useAppStore((s) => s.isDark);
  const user    = useAppStore((s) => s.user);
  const theme   = buildTheme(isDark);

  const [entries, setEntries] = useState<SparkLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    fetchSparkLedger(user.id, 50)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12, paddingBottom: 14,
        paddingHorizontal: 20,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderBottomWidth: 1, borderBottomColor: theme.border,
      }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
            stroke={theme.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 12H5M12 5l-7 7 7 7" />
          </Svg>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: theme.text }}>
            Sparks History
          </Text>
        </View>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={theme.premium} />
        </Svg>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.premium} />
        </View>
      ) : entries.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.faint, textAlign: 'center', lineHeight: 22 }}>
            No sparks yet. Share a price during a scan to start earning.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {entries.map((e) => {
            const isPositive = e.units > 0;
            const label      = e.note ?? EVENT_LABELS[e.event_type] ?? e.event_type;
            return (
              <View key={e.id} style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 14, paddingHorizontal: 20,
                borderBottomWidth: 1, borderBottomColor: theme.border,
              }}>
                {/* Icon */}
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: isPositive ? theme.premium + '20' : theme.surface2,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 14,
                }}>
                  <Svg width={16} height={16} viewBox="0 0 24 24">
                    <Path
                      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                      fill={isPositive ? theme.premium : theme.muted}
                    />
                  </Svg>
                </View>

                {/* Label + date */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: theme.text, marginBottom: 2 }}>
                    {label}
                  </Text>
                  {e.sku_name && (
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.faint }}>
                      {e.sku_name}
                    </Text>
                  )}
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.faint, marginTop: 2 }}>
                    {fmtDate(e.created_at)}
                  </Text>
                </View>

                {/* Amount */}
                <Text style={{
                  fontFamily: 'Inter_700Bold', fontSize: 15,
                  color: isPositive ? theme.premium : theme.muted,
                  minWidth: 42, textAlign: 'right',
                }}>
                  {isPositive ? `+${e.units}` : String(e.units)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
