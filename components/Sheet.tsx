import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, RADIUS } from '@/lib/theme';

const SCREEN_H = Dimensions.get('window').height;
const MAX_HEIGHT_FRACTION = 0.92;

interface SheetProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  children: React.ReactNode;
  title?: string;
}

export default function Sheet({
  open,
  onClose,
  theme,
  children,
  title,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 28,
          stiffness: 280,
          mass: 0.9,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_H,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [open]);

  const maxH = SCREEN_H * MAX_HEIGHT_FRACTION;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: overlayOpacity }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet panel */}
      <Animated.View
        style={[
          styles.sheet,
          {
            maxHeight: maxH,
            backgroundColor: theme.surface,
            borderTopLeftRadius: RADIUS.sheet,
            borderTopRightRadius: RADIUS.sheet,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: theme.hairline }]} />
        </View>

        {/* Title row */}
        {title ? (
          <View
            style={[
              styles.titleRow,
              { borderBottomColor: theme.hairline },
            ]}
          >
            <Text style={[styles.titleText, { color: theme.text }]}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={[styles.doneText, { color: theme.accent }]}>
                Done
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleText: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 17,
    letterSpacing: -0.3,
  },
  doneText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});
