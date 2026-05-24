import React from 'react';
import { View, Text, Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/lib/theme';

interface AppHeaderProps {
  theme: Theme;
  title: string;
  scrolled?: boolean;
  brandLogo?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export default function AppHeader({
  theme,
  title,
  scrolled = false,
  brandLogo = false,
  leading,
  trailing,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top > 0 ? insets.top : Platform.OS === 'android' ? 28 : 54;

  return (
    <View
      style={{
        paddingTop: topPad,
        paddingHorizontal: 20,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: scrolled ? theme.navBg : 'transparent',
        borderBottomWidth: scrolled ? 0.5 : 0,
        borderBottomColor: theme.hairline,
      }}
    >
      {/* Left */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        {leading ?? null}
        {brandLogo && (
          <Image
            source={require('@/assets/trendnable_logo_b.png')}
            style={{ width: 37, height: 37, borderRadius: 11, marginTop: -4 }}
          />
        )}
        <Text
          style={{
            fontFamily: theme.fontDispBold,
            fontSize: 28,
            color: theme.text,
            letterSpacing: -0.56,
            lineHeight: 32,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      {/* Right */}
      <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
        {trailing ?? null}
      </View>
    </View>
  );
}
