import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Theme } from '@/lib/theme';

interface LineChartProps {
  data: number[];
  theme: Theme;
  w?: number;
  h?: number;
  color: string;
  label?: string;
  units?: string;
}

function buildChartPath(
  data: number[],
  w: number,
  h: number,
): { line: string; area: string; lastX: number; lastY: number } {
  const valid = data.filter((v) => typeof v === 'number' && !isNaN(v));
  if (valid.length < 2) return { line: '', area: '', lastX: 0, lastY: h };

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  const padX = 2;
  const padY = 6;
  const chartW = w - padX * 2;
  const chartH = h - padY * 2;

  const points = data.map((v, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padY + chartH - ((v - min) / range) * chartH,
  }));

  let line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    line += ` Q ${cpx.toFixed(2)} ${prev.y.toFixed(2)} ${cpx.toFixed(2)} ${((prev.y + curr.y) / 2).toFixed(2)}`;
    line += ` Q ${cpx.toFixed(2)} ${curr.y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }

  const last = points[points.length - 1];
  const area =
    line +
    ` L ${last.x.toFixed(2)} ${(h).toFixed(2)}` +
    ` L ${points[0].x.toFixed(2)} ${(h).toFixed(2)}` +
    ' Z';

  return { line, area, lastX: last.x, lastY: last.y };
}

export default function LineChart({
  data,
  theme,
  w = 320,
  h = 120,
  color,
  label,
  units,
}: LineChartProps) {
  const { line, area, lastX, lastY } = buildChartPath(data, w, h);
  const lastValue = data[data.length - 1];

  const gridYPositions = [h * 0.15, h * 0.5, h * 0.85];

  return (
    <View style={{ width: w }}>
      {/* Optional label header */}
      {label && (
        <View style={styles.labelRow}>
          <Text style={[styles.labelText, { color: theme.faint }]}>
            {label.toUpperCase()}
          </Text>
          {lastValue != null && (
            <Text style={[styles.lastValueText, { color: theme.text }]}>
              {units ? `${units}${lastValue}` : String(lastValue)}
            </Text>
          )}
        </View>
      )}

      {/* Chart SVG */}
      <View style={{ width: w, height: h }}>
        <Svg width={w} height={h}>
          {/* Grid lines */}
          {gridYPositions.map((yPos, i) => (
            <Line
              key={i}
              x1={0}
              y1={yPos}
              x2={w}
              y2={yPos}
              stroke={theme.hairline}
              strokeWidth={1}
            />
          ))}

          {/* Filled area */}
          {area ? (
            <Path
              d={area}
              fill={color}
              fillOpacity={0.12}
              stroke="none"
            />
          ) : null}

          {/* Line */}
          {line ? (
            <Path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* End dot halo */}
          {line ? (
            <>
              <Circle
                cx={lastX}
                cy={lastY}
                r={6}
                fill={color}
                fillOpacity={0.2}
              />
              <Circle
                cx={lastX}
                cy={lastY}
                r={3}
                fill={color}
              />
            </>
          ) : null}
        </Svg>
      </View>

      {/* Axis labels */}
      <View style={styles.axisRow}>
        <Text style={[styles.axisLabel, { color: theme.faint }]}>-30d</Text>
        <Text style={[styles.axisLabel, { color: theme.faint }]}>today</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  lastValueText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 11,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  axisLabel: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9,
  },
});
