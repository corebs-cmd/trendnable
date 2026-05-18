import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '@/lib/theme';
import { AppNotification } from '@/lib/types';
import { useAppStore } from '@/stores/appStore';
import Sheet from '@/components/Sheet';

interface Props {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onNavigate?: (skuId: string) => void;
}

export default function NotificationsSheet({ open, theme, onClose, onNavigate }: Props) {
  const allNotifications   = useAppStore((s) => s.notifications);
  const markRead           = useAppStore((s) => s.markNotificationRead);
  const reactivateAlert    = useAppStore((s) => s.reactivatePriceAlert);
  const notifications      = allNotifications.filter((n) => !n.isRead);

  const handleKeepActive = (n: AppNotification) => {
    const alertId = n.metadata.alert_id as string | undefined;
    if (alertId) reactivateAlert(alertId, n.id);
    else markRead(n.id);
  };

  return (
    <Sheet open={open} onClose={onClose} theme={theme} title="Price Alerts">
      {notifications.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 01-3.46 0" />
          </Svg>
          <Text style={{ fontFamily: 'Fraunces_700Bold', fontSize: 17, color: theme.text }}>
            All caught up
          </Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, textAlign: 'center' }}>
            No new price alerts.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginBottom: 2 }}>
            {notifications.length} unread · tap an item to view the SKU
          </Text>

          {notifications.map((n) => (
            <View key={n.id} style={{
              backgroundColor: theme.surface2,
              borderRadius: theme.radius,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: `${theme.premium}30`,
            }}>
              {/* Body */}
              <Pressable
                onPress={() => {
                  if (n.skuId && onNavigate) {
                    onNavigate(n.skuId);
                    onClose();
                  }
                }}
                style={({ pressed }) => ({
                  padding: 14,
                  opacity: pressed && n.skuId ? 0.72 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <View style={{
                    width: 8, height: 8, borderRadius: 999,
                    backgroundColor: theme.premium, flexShrink: 0,
                  }} />
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.text, flex: 1 }}>
                    {n.title}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.muted, lineHeight: 18 }}>
                  {n.body}
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.faint, marginTop: 6 }}>
                  {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>

              {/* Actions */}
              <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: theme.hairline }}>
                <Pressable
                  onPress={() => handleKeepActive(n)}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: 13, alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.gold }}>
                    Keep active
                  </Text>
                </Pressable>
                <View style={{ width: 0.5, backgroundColor: theme.hairline }} />
                <Pressable
                  onPress={() => markRead(n.id)}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: 13, alignItems: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.muted }}>
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}
