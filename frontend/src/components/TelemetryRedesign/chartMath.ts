export const VIEW_W = 1000;
export const VIEW_H = 260;
export const TOP_PADDING = 20;
export const BASELINE_Y = 240;

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
  timestamp: string;
  index: number;
}

export function buildScale(values: number[]) {
  const maxValue = values.length ? Math.max(...values) : 0;
  const domainMax = maxValue > 0 ? maxValue * 1.12 : 1;
  const usableHeight = BASELINE_Y - TOP_PADDING;

  const yForValue = (v: number) => BASELINE_Y - (v / domainMax) * usableHeight;
  const xForIndex = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * VIEW_W);

  return { maxValue, domainMax, yForValue, xForIndex };
}

export function toChartPoints(
  series: { timestamp: string; value: number }[],
): ChartPoint[] {
  const values = series.map(s => s.value);
  const { yForValue, xForIndex } = buildScale(values);
  return series.map((s, i) => ({
    x: xForIndex(i, series.length),
    y: yForValue(s.value),
    value: s.value,
    timestamp: s.timestamp,
    index: i,
  }));
}

/** Smooth line through points: quadratic bezier using each point as control,
 * midpoint of consecutive points as the curve anchor. */
export function buildSmoothLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    d += ` Q ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export function buildAreaPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  const line = buildSmoothLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${BASELINE_Y} L ${first.x.toFixed(1)} ${BASELINE_Y} Z`;
}
