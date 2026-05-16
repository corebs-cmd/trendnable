import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Chip from '@/components/Chip';
import { Theme, RADIUS } from '@/lib/theme';

interface FilterGroupOption {
  id: string;
  label: string;
}

interface FilterGroupProps {
  title: string;
  options: FilterGroupOption[];
  selected: string[];
  onToggle: (id: string) => void;
  theme: Theme;
  multi?: boolean; // if false, acts as a radio group
}

export default function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  theme,
  multi = true,
}: FilterGroupProps) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          color: theme.muted,
          fontSize: 11,
          fontFamily: 'Inter_700Bold',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, flexDirection: 'row' }}
      >
        {options.map((opt) => (
          <Chip
            key={opt.id}
            theme={theme}
            active={selected.includes(opt.id)}
            onClick={() => onToggle(opt.id)}
            size="sm"
          >
            {opt.label}
          </Chip>
        ))}
      </ScrollView>
    </View>
  );
}
