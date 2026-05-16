import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Theme } from '@/lib/theme';

interface SectionHeaderProps {
  title: string;
  sub?: string;
  action?: string;
  onAction?: () => void;
  theme: Theme;
  sticky?: boolean;
}

export default function SectionHeader({
  title,
  sub,
  action,
  onAction,
  theme,
  sticky = false,
}: SectionHeaderProps) {
  return (
    <View
      style={[
        styles.container,
        sticky && { backgroundColor: theme.bg },
      ]}
    >
      {/* Left accent rail + title block */}
      <View style={styles.titleBlock}>
        {/* Almanac accent rail */}
        <View
          style={[styles.accentRail, { backgroundColor: theme.accent }]}
        />

        <View style={styles.titleInner}>
          <Text style={[styles.titleText, { color: theme.text }]}>
            {title}
          </Text>
          {sub ? (
            <Text style={[styles.subText, { color: theme.muted }]}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Action right */}
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.actionBtn}>
          <Text style={[styles.actionText, { color: theme.accent }]}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  accentRail: {
    width: 4,
    height: 22,
    borderRadius: 2,
    flexShrink: 0,
  },
  titleInner: {
    flex: 1,
    gap: 2,
  },
  titleText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  subText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  actionBtn: {
    paddingLeft: 12,
  },
  actionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: -0.1,
  },
});
