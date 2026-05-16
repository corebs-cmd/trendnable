import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Theme } from '@/lib/theme';

type DeltaSize = 'sm' | 'md';

interface DeltaPillProps {
  delta: number;
  theme: Theme;
  size?: DeltaSize;
}

export default function DeltaPill({ delta, theme, size = 'md' }: DeltaPillProps) {
  const fontSize = size === 'sm' ? 11 : 13;

  let color: string;
  let label: string;

  if (delta > 0) {
    color = theme.pos;
    label = `↑${delta}`;
  } else if (delta < 0) {
    color = theme.neg;
    label = `↓${Math.abs(delta)}`;
  } else {
    color = theme.muted;
    label = '·0';
  }

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.text,
          {
            fontSize,
            color,
            lineHeight: fontSize * 1.3,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontVariant: ['tabular-nums'],
  },
});
