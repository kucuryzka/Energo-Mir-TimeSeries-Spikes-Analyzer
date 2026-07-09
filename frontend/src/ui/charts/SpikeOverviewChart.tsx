import React from 'react';
import type { SpikePoint } from '../../types/analytics.types';
import { SpikeChart } from './SpikeChart';

interface SpikeOverviewChartProps {
  enrichedData: SpikePoint[];
  isPartialResult: boolean;
  showMarkers: boolean;
  setShowMarkers: React.Dispatch<React.SetStateAction<boolean>>;
  showCritical: boolean;
  setShowCritical: React.Dispatch<React.SetStateAction<boolean>>;
  showWarning: boolean;
  setShowWarning: React.Dispatch<React.SetStateAction<boolean>>;
  onPointSelect: (timestamp: string) => void;
}

export const SpikeOverviewChart: React.FC<SpikeOverviewChartProps> = ({
  enrichedData,
  isPartialResult,
  showMarkers,
  setShowMarkers,
  showCritical,
  setShowCritical,
  showWarning,
  setShowWarning,
  onPointSelect,
}) => (
  <div className={`chart-card telemetry-spike-chart${isPartialResult ? ' chart-card--partial' : ''}`}>
    <div className="chart-header">
      <div className="chart-title-row">
        <div className="chart-title">Обзор показателей</div>
        {isPartialResult && <span className="chart-partial-badge">Загрузка…</span>}
      </div>
      <div className="chart-controls">
        <button type="button" className={`legend-chip crit ${!showCritical ? 'off' : ''}`} onClick={() => setShowCritical(v => !v)}>
          <span className="dot7" style={{ background: '#d64933' }} />Критическая
        </button>
        <button type="button" className={`legend-chip warn ${!showWarning ? 'off' : ''}`} onClick={() => setShowWarning(v => !v)}>
          <span className="dot7" style={{ background: '#e2a339' }} />Предупреждение
        </button>
        <span className="line-legend">
          <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#7A8B9E' }} />Среднее</span>
          <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#C97A6E' }} />Максимум</span>
          <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#5A9E7A' }} />Минимум</span>
        </span>
        <button
          type="button"
          className="switch-track"
          style={{ background: showMarkers ? '#3D63DD' : 'var(--switch-off)' }}
          onClick={() => setShowMarkers(v => !v)}
          title="Маркеры"
        >
          <span className="switch-knob" style={{ transform: showMarkers ? 'translateX(16px)' : 'translateX(0)' }} />
        </button>
      </div>
    </div>
    <SpikeChart
      data={enrichedData}
      showMarkers={showMarkers && !isPartialResult}
      showCriticalMarkers={showCritical}
      showWarningMarkers={showWarning}
      hideToolbar
      onPointClick={(point) => onPointSelect(point.timestamp)}
    />
  </div>
);
