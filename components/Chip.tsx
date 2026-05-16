import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Theme } from '@/lib/theme';

type ChipSize = 'xs' | 'sm' | 'md';
type ChipTone = 'default' | 'accent' | 'gold' | 'pos' | 'neg';

interface ChipProps {
  children: React.ReactNode;
  theme: Theme;
  active?: boolean;
  onClick?: () => void;
  size?: ChipSize;
  tone?: ChipTone;
}

const SIZE_MAP: Record<ChipSize, { height: number; paddingH: number; fontSize: number }> = {
  xs: { height: 22, paddingH: 9,  fontSize: 11   },
  sm: { height: 36, paddingH: 16, fontSize: 13.5 },
  md: { height: 40, paddingH: 16, fontSize: 14   },
};

export default function Chip({
  children,
  theme,
  active = false,
  onClick,
  size = 'sm',
  tone = 'default',
}: ChipProps) {
  const { height, paddingH, fontSize } = SIZE_MAP[size];

  const backgroundColor = active
    ? tone === 'gold' ? theme.gold : theme.accent
    : size === 'xs'
      ? (theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
      : theme.surface;

  const color = active
    ? tone === 'gold' ? theme.goldInk : theme.accentInk
    : size === 'xs' ? theme.muted : theme.text;

  const borderColor = active ? 'transparent' : size === 'xs' ? 'transparent' : theme.hairline;

  const containerStyle = {
    height,
    paddingHorizontal: paddingH,
    backgroundColor,
    borderRadius: 999,
    borderWidth: active || size === 'xs' ? 0 : 0.5,
    borderColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    alignSelf: 'flex-start' as const,
  };

  const textStyle = {
    fontSize,
    color,
    fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium',
    lineHeight: fontSize * 1.25,
  };

  if (onClick) {
    return (
      <Pressable
        onPress={onClick}
        style={({ pressed }) => [containerStyle, pressed && { opacity: 0.72 }]}
        hitSlop={4}
      >
        <Text style={textStyle} numberOfLines={1}>{children}</Text>
      </Pressable>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={textStyle} numberOfLines={1}>{children}</Text>
    </View>
  );
}
