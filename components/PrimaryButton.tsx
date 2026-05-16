import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Theme, RADIUS } from '@/lib/theme';

type ButtonTone = 'accent' | 'ink' | 'soft' | 'premium';
type ButtonSize = 'sm' | 'md' | 'lg';

interface PrimaryButtonProps {
  children: React.ReactNode;
  theme: Theme;
  onPress?: () => void;
  full?: boolean;
  tone?: ButtonTone;
  size?: ButtonSize;
  disabled?: boolean;
}

const SIZE_MAP: Record<ButtonSize, { height: number; fontSize: number; paddingH: number }> = {
  sm: { height: 36, fontSize: 13.5, paddingH: 18 },
  md: { height: 48, fontSize: 15,   paddingH: 22 },
  lg: { height: 56, fontSize: 16,   paddingH: 26 },
};

export default function PrimaryButton({
  children,
  theme,
  onPress,
  full = false,
  tone = 'accent',
  size = 'md',
  disabled = false,
}: PrimaryButtonProps) {
  const { height, fontSize, paddingH } = SIZE_MAP[size];

  const backgroundColor =
    tone === 'accent'   ? theme.accent :
    tone === 'ink'      ? theme.text :
    tone === 'premium'  ? theme.premium :
    theme.surface2;

  const color =
    tone === 'accent'   ? theme.accentInk :
    tone === 'ink'      ? theme.surface :
    tone === 'premium'  ? theme.premiumInk :
    theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: paddingH,
          backgroundColor,
          borderRadius: RADIUS.button,
          width: full ? ('100%' as const) : undefined,
          alignSelf: full ? ('stretch' as const) : ('flex-start' as const),
          opacity: pressed || disabled ? 0.62 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { fontSize, color }]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
  },
});
