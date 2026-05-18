import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';

interface Props {
  theme: Theme;
  onPress: () => void;
}

export default function NotificationBanner({ theme, onPress }: Props) {
  const unreadCount = useAppStore((s) => s.unreadCount);

  if (unreadCount === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        marginHorizontal: 20,
        marginBottom: 12,
        backgroundColor: `${theme.premium}15`,
        borderWidth: 1,
        borderColor: `${theme.premium}40`,
        borderRadius: theme.radius,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 999,
        backgroundColor: theme.premium,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={theme.premiumInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path d="M13.73 21a2 2 0 01-3.46 0" />
        </Svg>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.text }}>
          {unreadCount} price alert{unreadCount !== 1 ? 's' : ''} triggered
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.muted, marginTop: 2 }}>
          Tap to view and manage
        </Text>
      </View>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.faint} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9 6l6 6-6 6" />
      </Svg>
    </Pressable>
  );
}
