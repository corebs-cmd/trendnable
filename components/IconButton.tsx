import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Theme } from '@/lib/theme';

type IconButtonTone = 'soft' | 'solid' | 'ghost';

interface IconButtonProps {
  children: React.ReactNode;
  theme: Theme;
  onPress?: () => void;
  tone?: IconButtonTone;
  size?: number;
  accessibilityLabel?: string;
}

export default function IconButton({
  children,
  theme,
  onPress,
  tone = 'soft',
  size = 36,
  accessibilityLabel,
}: IconButtonProps) {
  const backgroundColor =
    tone === 'solid'
      ? theme.text
      : tone === 'soft'
      ? theme.surface2
      : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor,
          opacity: pressed ? 0.62 : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
