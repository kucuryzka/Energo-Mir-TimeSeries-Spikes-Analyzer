import dayjs from 'dayjs';
import type { SpikePoint } from '../../types/analytics.types';

export const VIEW_W = 1000;
export const VIEW_H = 340; 
export const TOP_PADDING = 25;
export const BASELINE_Y = 255;
export const LEFT_PADDING = 70;
export const CHART_W = VIEW_W - LEFT_PADDING; 
export const MAX_POINTS = 3000;

export const X_LABEL_FONT_SIZE = 6.5;
export const X_LABEL_ROTATE_DEG = 60;
const X_LABEL_CHARS = 'DD.MM HH:mm'.length;
const X_LABEL_TEXT_LENGTH = X_LABEL_CHARS * X_LABEL_FONT_SIZE * 0.62; 
export const MIN_X_LABEL_SPACING = Math.ceil(
  X_LABEL_TEXT_LENGTH * Math.cos((X_LABEL_ROTATE_DEG * Math.PI) / 180) + 4,
); 

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
  timestamp: string;
  index: number;
}

export function lttbSampling(data: SpikePoint[], threshold: number): SpikePoint[] {
  if (data.length <= threshold) return data;

  const bucketSize = (data.length - 2) / (threshold - 2);
  const sampled: SpikePoint[] = [];

  sampled.push(data[0]);

  for (let i = 0; i < threshold - 2; i++) {
    const start = Math.floor((i + 1) * bucketSize);
    const end = Math.floor((i + 2) * bucketSize);
    const bucket = data.slice(start, end);

    if (bucket.length === 0) continue;

    let maxArea = -1;
    let maxIdx = 0;
    const prev = sampled[sampled.length - 1];
    const next = data[Math.min(end, data.length - 1)];

    for (let j = 0; j < bucket.length; j++) {
      const area = Math.abs(
        (prev.value - next.value) * (bucket[j].value - prev.value) -
        (prev.value - bucket[j].value) * (next.value - prev.value)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(bucket[maxIdx]);
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

export function buildScale(values: number[]) {
  const maxValue = values.length ? Math.max(...values) : 0;
  const domainMax = maxValue > 0 ? maxValue * 1.12 : 1;
  const usableHeight = BASELINE_Y - TOP_PADDING;

  const yForValue = (v: number) => BASELINE_Y - (v / domainMax) * usableHeight;
  const xForIndex = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * CHART_W);

  return { yForValue, xForIndex };
}

export function toChartPoints(series: { timestamp: string; value: number }[]): ChartPoint[] {
  const values = series.map(s => s.value);
  const { yForValue, xForIndex } = buildScale(values);
  return series.map((s, i) => ({
    x: xForIndex(i, series.length) + LEFT_PADDING,
    y: yForValue(s.value),
    value: s.value,
    timestamp: s.timestamp,
    index: i,
  }));
}

export function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  const step = points.length > 2000 ? Math.max(1, Math.floor(points.length / 1500)) : 1;

  for (let i = step; i < points.length; i += step) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  return d;
}

export function buildAreaPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  const line = buildLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${BASELINE_Y} L ${first.x.toFixed(1)} ${BASELINE_Y} Z`;
}

export function getXAxisLabels(data: SpikePoint[], maxCount: number): { timestamp: string; x: number }[] {
  if (data.length === 0) return [];
  const count = Math.max(2, Math.min(maxCount, data.length));

  if (data.length <= count) {
    return data.map((d, i) => ({
      timestamp: dayjs(d.timestamp).format('DD.MM HH:mm'),
      x: data.length === 1 ? LEFT_PADDING : (i / (data.length - 1)) * CHART_W + LEFT_PADDING,
    }));
  }

  const step = (data.length - 1) / (count - 1);
  const seenIdx = new Set<number>();
  const labels: { timestamp: string; x: number }[] = [];
  for (let k = 0; k < count; k += 1) {
    const idx = Math.round(k * step);
    if (seenIdx.has(idx)) continue;
    seenIdx.add(idx);
    labels.push({
      timestamp: dayjs(data[idx].timestamp).format('DD.MM HH:mm'),
      x: (idx / (data.length - 1)) * CHART_W + LEFT_PADDING,
    });
  }
  return labels;
}

export function getYAxisLabels(maxValue: number, count: number = 5): number[] {
  if (maxValue === 0) return [0];
  const step = Math.ceil(maxValue / count / Math.pow(10, Math.floor(Math.log10(maxValue / count)))) * Math.pow(10, Math.floor(Math.log10(maxValue / count)));
  const labels = [];
  for (let v = 0; v <= maxValue + step; v += step) {
    labels.push(v);
  }
  return labels;
}

export const fmtDate = (iso: string) => dayjs(iso).format('DD.MM HH:mm');
