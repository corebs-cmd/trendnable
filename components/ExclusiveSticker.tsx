import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet } from 'react-native';
import { StickerDef, STICKER_IMAGES } from '@/lib/stickers';

interface Props {
  sticker: StickerDef;
  /** Uniform display width — height derives from ar */
  size?: number;
  delay?: number;
  /** Show peel-in entrance + glow pulse */
  animate?: boolean;
}

export default function ExclusiveSticker({ sticker, size = 66, delay = 0, animate = true }: Props) {
  const w = size;
  const h = Math.round(size / sticker.ar);
  const isCard = sticker.shape === 'card';
  const cardRadius = Math.round(h * 0.16);

  // Peel-in: single progress value drives scale + translateY + opacity
  const peel = useRef(new Animated.Value(0)).current;
  // Glow pulse: drives the halo opacity
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      peel.setValue(1);
      return;
    }
    const peelAnim = Animated.spring(peel, {
      toValue: 1,
      delay,
      tension: 140,
      friction: 8,
      useNativeDriver: true,
    });
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, delay: delay + 600, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, useNativeDriver: false }),
      ])
    );
    peelAnim.start();
    glowAnim.start();
    return () => {
      peelAnim.stop();
      glowAnim.stop();
    };
  }, [animate, delay]);

  const scale = peel.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.65, 1.06, 1] });
  const translateY = peel.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] });
  const opacity = peel.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });

  // Halo behind the sticker — animated opacity
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.48] });

  const src: any = sticker.imageUrl ? { uri: sticker.imageUrl } : STICKER_IMAGES[sticker.key];

  return (
    <Animated.View style={[styles.wrapper, { width: w, height: h, transform: [{ scale }, { translateY }], opacity }]}>
      {/* Glow halo */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: w + 14,
            height: h + 14,
            top: -7,
            left: -7,
            borderRadius: isCard ? cardRadius + 5 : (w + 14) / 2,
            backgroundColor: sticker.glow,
            opacity: haloOpacity,
          },
        ]}
      />

      {/* Sticker art */}
      {isCard ? (
        <View
          style={[
            styles.cardClip,
            {
              width: w,
              height: h,
              borderRadius: cardRadius,
              shadowColor: sticker.glow,
            },
          ]}
        >
          <Image
            source={src}
            style={{ width: w, height: h, borderRadius: cardRadius }}
            resizeMode="cover"
            accessibilityLabel={sticker.label}
          />
        </View>
      ) : (
        <Image
          source={src}
          style={[styles.roundImg, { width: w, height: h, shadowColor: sticker.glow }]}
          resizeMode="contain"
          accessibilityLabel={sticker.label}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
  },
  cardClip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  roundImg: {
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
