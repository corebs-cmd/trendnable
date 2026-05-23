import React, { useState } from 'react';
import { View, Text, StyleSheet, ViewStyle, Image } from 'react-native';
import Svg, { Path, Circle, Ellipse, G, Rect, Polygon, Text as SvgText } from 'react-native-svg';
import { Theme, categoryColor } from '@/lib/theme';
import { SKU } from '@/lib/types';
import { catById } from '@/lib/appConfig';

// ── Size map ──────────────────────────────────────────────────────────────────
type SizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
const SIZE_MAP: Record<SizeKey, { w: number; h: number; tagFs: number; pad: number }> = {
  xs:   { w: 44,  h: 55,  tagFs: 7,  pad: 4  },
  sm:   { w: 72,  h: 90,  tagFs: 8,  pad: 6  },
  md:   { w: 96,  h: 120, tagFs: 9,  pad: 8  },
  lg:   { w: 144, h: 180, tagFs: 10, pad: 12 },
  xl:   { w: 220, h: 275, tagFs: 11, pad: 14 },
  hero: { w: 320, h: 320, tagFs: 11, pad: 16 },
};

// ── Figure glyph (Funko/Hot Toys/NECA) ───────────────────────────────────────
function FigureGlyph({ ink, variant, dark }: { ink: string; variant: number; dark: boolean }) {
  const eyeFill = dark ? '#0F1A2E' : '#FFFFFF';
  return (
    <Svg viewBox="0 0 120 150" width="60%" height="64%">
      <G fill={ink} opacity={0.92}>
        <Circle cx={60} cy={42} r={34} />
        {variant === 1 && (
          <>
            <Path d="M30 18 L36 32 L42 22 Z" />
            <Path d="M90 18 L84 32 L78 22 Z" />
          </>
        )}
        {variant !== 3 && (
          <Path d="M40 18 Q50 4 64 14 Q72 6 80 18 Q70 24 60 22 Q48 24 40 18 Z" />
        )}
        <Path
          d={
            variant === 2
              ? 'M40 76 Q60 70 80 76 L82 124 Q60 132 38 124 Z'
              : 'M42 76 Q60 70 78 76 L80 124 Q60 130 40 124 Z'
          }
        />
        <Ellipse cx={32} cy={98} rx={9} ry={20} />
        <Ellipse cx={88} cy={98} rx={9} ry={20} />
      </G>
      <Ellipse cx={60} cy={138} rx={32} ry={4} fill={ink} opacity={0.12} />
      <Circle cx={50} cy={46} r={2.4} fill={eyeFill} opacity={0.9} />
      <Circle cx={70} cy={46} r={2.4} fill={eyeFill} opacity={0.9} />
    </Svg>
  );
}

// ── Card glyph (TCG) ──────────────────────────────────────────────────────────
function CardGlyph({ ink, variant, dark }: { ink: string; variant: number; dark: boolean }) {
  const rotation = variant === 1 ? '-3' : variant === 2 ? '2' : '0';
  const cx = 50;
  const cy = 70;
  return (
    <Svg viewBox="0 0 100 140" width="58%" height="76%">
      <G transform={`rotate(${rotation} ${cx} ${cy})`}>
        <Rect x={8} y={4} width={84} height={132} rx={5} fill={ink} opacity={0.92} />
        <Rect x={16} y={14} width={68} height={58} rx={2} fill="#fff" opacity={0.95} />
        <Path d="M16 30 Q50 8 84 30" stroke="#5EE2E8" strokeWidth={2.2} fill="none" opacity={0.7} />
        <Circle cx={50} cy={42} r={10} fill="#5EE2E8" opacity={0.85} />
        <Rect x={16} y={80} width={50} height={3} fill="#fff" opacity={0.55} />
        <Rect x={16} y={88} width={40} height={2.5} fill="#fff" opacity={0.4} />
        <Rect x={16} y={116} width={68} height={2.5} fill="#fff" opacity={0.55} />
        <Rect x={16} y={122} width={44} height={2.5} fill="#fff" opacity={0.4} />
        <Circle cx={80} cy={124} r={6} fill="#fff" opacity={0.65} />
      </G>
    </Svg>
  );
}

// ── Blind box glyph (Pop Mart) ────────────────────────────────────────────────
function BlindBoxGlyph({ ink, dark }: { ink: string; dark: boolean }) {
  const qFill = dark ? '#0F1A2E' : '#FFFFFF';
  return (
    <Svg viewBox="0 0 140 140" width="66%" height="68%">
      <Path d="M70 18 L120 42 L70 66 L20 42 Z" fill={ink} opacity={0.78} />
      <Path d="M20 42 L70 66 L70 122 L20 98 Z" fill={ink} opacity={0.92} />
      <Path d="M120 42 L70 66 L70 122 L120 98 Z" fill={ink} opacity={0.7} />
      <SvgText
        x={44}
        y={100}
        fontFamily="serif"
        fontSize={40}
        fontWeight="700"
        fill={qFill}
        opacity={0.9}
      >
        ?
      </SvgText>
      <Ellipse cx={70} cy={128} rx={42} ry={3} fill={ink} opacity={0.12} />
    </Svg>
  );
}

// ── Car glyph (Hot Wheels) ────────────────────────────────────────────────────
function CarGlyph({ ink, dark }: { ink: string; dark: boolean }) {
  const glassFill = dark ? '#0F1A2E' : '#FFFFFF';
  return (
    <Svg viewBox="0 0 160 90" width="78%" height="58%">
      <G fill={ink}>
        <Path
          d="M10 56 Q14 42 30 40 L52 38 Q60 22 80 22 L100 22 Q118 22 128 38 L150 42 Q156 48 154 58 L150 64 L138 64 Q136 50 122 50 Q108 50 106 64 L52 64 Q50 50 36 50 Q22 50 20 64 L14 64 Q8 62 10 56 Z"
          opacity={0.92}
        />
        <Path
          d="M58 38 Q66 28 80 28 L98 28 Q112 28 118 38 Z"
          fill={glassFill}
          opacity={0.75}
        />
        <Circle cx={36} cy={62} r={14} opacity={0.95} />
        <Circle cx={124} cy={62} r={14} opacity={0.95} />
        <Circle cx={36} cy={62} r={6} fill={glassFill} opacity={0.75} />
        <Circle cx={124} cy={62} r={6} fill={glassFill} opacity={0.75} />
      </G>
      <Ellipse cx={80} cy={80} rx={60} ry={3} fill={ink} opacity={0.12} />
    </Svg>
  );
}

// ── Signed glyph (Autographed) — certification star seal ─────────────────────
function SignedGlyph({ ink, dark }: { ink: string; dark: boolean }) {
  return (
    <Svg viewBox="0 0 100 100" width="62%" height="62%">
      {/* outer seal ring */}
      <Circle cx={50} cy={50} r={46} fill="none" stroke={ink} strokeWidth={2.5} opacity={0.28} />
      <Circle cx={50} cy={50} r={40} fill="none" stroke={ink} strokeWidth={1} opacity={0.18} />
      {/* 5-pointed star */}
      <Polygon
        points="50,12 59.4,37.1 86.1,38.3 65.2,54.9 72.3,80.7 50,66 27.7,80.7 34.8,54.9 13.9,38.3 40.6,37.1"
        fill={ink}
        opacity={0.92}
      />
      {/* centre pip */}
      <Circle cx={50} cy={50} r={5.5} fill={dark ? '#0F1A2E' : '#FFFFFF'} opacity={0.7} />
    </Svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ProductPlaceholderProps {
  sku: SKU;
  theme: Theme;
  size?: SizeKey;
  showTag?: boolean;
  style?: ViewStyle;
}

export default function ProductPlaceholder({
  sku,
  theme,
  size = 'md',
  showTag = true,
  style,
}: ProductPlaceholderProps) {
  const [imageError, setImageError] = useState(false);
  const dims = SIZE_MAP[size];
  const c = categoryColor(sku.category, theme.dark);
  const cat = catById(sku.category);
  const kind = cat?.type ?? 'figure';
  const variant = parseInt(sku.id.replace(/\D/g, ''), 10) % 4;
  const showRealImage = !!sku.imageUrl && !imageError;

  return (
    <View
      style={[
        {
          width: dims.w,
          height: dims.h,
          backgroundColor: c.tint,
          borderRadius: Math.max(10, theme.radius * 0.7),
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        },
        style,
      ]}
    >
      {/* Vignette */}
      {!showRealImage && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: '#000000',
              opacity: theme.dark ? 0.15 : 0.04,
            },
          ]}
          pointerEvents="none"
        />
      )}

      {showRealImage ? (
        <Image
          source={{ uri: sku.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
          onError={() => setImageError(true)}
        />
      ) : (
        <>
          {/* Category tag */}
          {showTag && (
            <View
              style={{
                position: 'absolute',
                top: dims.pad,
                left: dims.pad,
                backgroundColor: theme.dark
                  ? 'rgba(0,0,0,0.28)'
                  : 'rgba(255,255,255,0.65)',
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: dims.tagFs,
                  color: c.ink,
                  letterSpacing: 0.08 * dims.tagFs,
                  textTransform: 'uppercase',
                  lineHeight: dims.tagFs * 1.3,
                }}
              >
                {c.name}
              </Text>
            </View>
          )}

          {/* Glyph */}
          {kind === 'card' ? (
            <CardGlyph ink={c.ink} variant={variant} dark={theme.dark} />
          ) : kind === 'box' ? (
            <BlindBoxGlyph ink={c.ink} dark={theme.dark} />
          ) : kind === 'car' ? (
            <CarGlyph ink={c.ink} dark={theme.dark} />
          ) : kind === 'signed' ? (
            <SignedGlyph ink={c.ink} dark={theme.dark} />
          ) : (
            <FigureGlyph ink={c.ink} variant={variant} dark={theme.dark} />
          )}
        </>
      )}
    </View>
  );
}

// ── ProductThumb — compact square variant ─────────────────────────────────────
interface ProductThumbProps {
  sku: SKU;
  theme: Theme;
  size?: number;
  radius?: number;
  style?: ViewStyle;
}

export function ProductThumb({ sku, theme, size = 56, radius, style }: ProductThumbProps) {
  const [imageError, setImageError] = useState(false);
  const c = categoryColor(sku.category, theme.dark);
  const cat = catById(sku.category);
  const kind = cat?.type ?? 'figure';
  const variant = parseInt(sku.id.replace(/\D/g, ''), 10) % 4;
  const showRealImage = !!sku.imageUrl && !imageError;
  const r = radius ?? Math.max(8, theme.radius * 0.5);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: c.tint,
          borderRadius: r,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
        style,
      ]}
    >
      {showRealImage ? (
        <Image
          source={{ uri: sku.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <View
          style={{
            width: '76%',
            height: '76%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {kind === 'card' ? (
            <CardGlyph ink={c.ink} variant={variant} dark={theme.dark} />
          ) : kind === 'box' ? (
            <BlindBoxGlyph ink={c.ink} dark={theme.dark} />
          ) : kind === 'car' ? (
            <CarGlyph ink={c.ink} dark={theme.dark} />
          ) : kind === 'signed' ? (
            <SignedGlyph ink={c.ink} dark={theme.dark} />
          ) : (
            <FigureGlyph ink={c.ink} variant={variant} dark={theme.dark} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({});
