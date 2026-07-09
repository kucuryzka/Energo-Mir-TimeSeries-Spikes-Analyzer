import React from 'react';
import { useCountUp } from './useCountUp';

interface KpiRowProps {
  totalCalls: number;
  totalPoints: number;
  spikesCount: number;
  criticalCount: number;
  average: number;
  max: number;
  averageDecimals?: number;
  maxDecimals?: number;
  animate?: boolean;
}

const MiniBars: React.FC<{ color: string; variant: 1 | 2 | 3 | 4 }> = ({ color, variant }) => {
  const bars: Record<number, [number, number, number][]> = {
    1: [[0, 6, 8], [8, 3, 11], [16, 0, 14]],
    2: [[0, 8, 6], [8, 2, 12], [16, 5, 9]],
    3: [[0, 2, 12], [8, 5, 9], [16, 8, 6]],
    4: [[0, 9, 5], [8, 6, 8], [16, 0, 14]],
  };
  const opacities = [0.4, 0.65, 1];
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" style={{ color }}>
      {bars[variant].map(([x, y, h], i) => (
        <rect key={x} x={x} y={y} width={4} height={h} rx={1.5} fill="currentColor" opacity={opacities[i]} />
      ))}
    </svg>
  );
};

const KpiValue: React.FC<{
  target: number;
  decimals?: number;
  color?: string;
  animate?: boolean;
  formatLocale?: boolean;
}> = ({ target, decimals = 0, color, animate = true, formatLocale = false }) => {
  const animated = useCountUp(target, animate ? 900 : 0);
  const text = formatLocale
    ? Math.round(animated).toLocaleString('ru-RU')
    : animated.toFixed(decimals);
  return <div className="kpi-value" style={color ? { color } : undefined}>{text}</div>;
};

export const KpiRow: React.FC<KpiRowProps> = ({
  totalCalls,
  totalPoints,
  spikesCount,
  criticalCount,
  average,
  max,
  averageDecimals = 0,
  maxDecimals = 0,
  animate = true,
}) => {
  return (
    <div className="kpi-row">
      <div className="kpi kpi-blue1">
        <div className="kpi-label-row">
          <span className="kpi-label" style={{ color: 'var(--kpi-label-blue)' }}>Всего значений</span>
          <MiniBars color="var(--kpi-label-blue)" variant={1} />
        </div>
        <KpiValue target={totalCalls} animate={animate} formatLocale />
      </div>

      <div className="kpi kpi-blue2">
        <div className="kpi-label-row">
          <span className="kpi-label" style={{ color: 'var(--kpi-label-blue2)' }}>Обнаружено аномалий</span>
          <MiniBars color="var(--kpi-label-blue2)" variant={2} />
        </div>
        <KpiValue target={spikesCount} animate={animate} />
      </div>

      <div className="kpi kpi-red">
        <div className="kpi-label-row">
          <span className="kpi-label" style={{ color: 'var(--kpi-label-red)' }}>Критических</span>
          <MiniBars color="#d64933" variant={3} />
        </div>
        <KpiValue target={criticalCount} color="#d64933" animate={animate} />
      </div>

      <div className="kpi kpi-white">
        <span className="kpi-label" style={{ color: 'var(--kpi-label-muted)' }}>Среднее значение</span>
        <KpiValue target={average} decimals={averageDecimals} animate={animate} />
      </div>

      <div className="kpi kpi-blue1">
        <div className="kpi-label-row">
          <span className="kpi-label" style={{ color: 'var(--kpi-label-blue)' }}>Максимум</span>
          <MiniBars color="var(--kpi-label-blue)" variant={4} />
        </div>
        <KpiValue target={max} decimals={maxDecimals} animate={animate} />
      </div>

      <div className="kpi kpi-white">
        <span className="kpi-label" style={{ color: 'var(--kpi-label-muted)' }}>Всего точек</span>
        <KpiValue target={totalPoints} animate={animate} />
      </div>
    </div>
  );
};
