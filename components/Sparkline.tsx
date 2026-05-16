import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '@/lib/theme';

interface SparklineProps {
  data: number[];
  theme: Theme;
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
}

function buildPath(data: number[], w: number, h: number): { line: string; area: string } {
  if (!data || data.length < 2) return { line: '', area: '' };

  const valid = data.filter((v) => typeof v === 'number' && !isNaN(v));
  if (valid.length < 2) return { line: '', area: '' };

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  const pad = 1;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;

  const points = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * chartW,
    y: pad + chartH - ((v - min) / range) * chartH,
  }));

  // Build smooth line using quadratic bezier curves
  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    line += ` Q ${cpx} ${prev.y} ${cpx} ${(prev.y + curr.y) / 2}`;
    line += ` Q ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
  }

  const area =
    line +
    ` L ${points[points.length - 1].x} ${h}` +
    ` L ${points[0].x} ${h}` +
    ' Z';

  return { line, area };
}

export default function Sparkline({
  data,
  theme,
  w = 70,
  h = 22,
  color,
  fill = true,
}: SparklineProps) {
  const lineColor = color ?? theme.pos;
  const { line, area } = buildPath(data, w, h);

  if (!line) return <View style={{ width: w, height: h }} />;

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {fill && area ? (
          <Path
            d={area}
            fill={lineColor}
            fillOpacity={0.10}
            stroke="none"
          />
        ) : null}
        <Path
          d={line}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
