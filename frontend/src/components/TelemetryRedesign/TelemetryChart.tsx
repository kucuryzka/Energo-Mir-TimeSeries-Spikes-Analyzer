import React, { useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import type { SpikePoint } from '../../types/analytics.types';
import { toChartPoints, buildSmoothLinePath, buildAreaPath, buildScale, VIEW_W } from './chartMath';

interface TelemetryChartProps {
  series: SpikePoint[];
  granularity: 'Hour' | 'Day' | 'Week';
  onGranularityChange: (g: 'Hour' | 'Day' | 'Week') => void;
  showCritical: boolean;
  showWarning: boolean;
  onToggleCritical: () => void;
  onToggleWarning: () => void;
  showMarkers: boolean;
  onToggleMarkers: () => void;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  zoomRange: [number, number];
  onZoomChange: (range: [number, number]) => void;
  onMarkerClick?: (timestamp: string) => void;
}

const fmtDate = (iso: string) => dayjs(iso).format('DD.MM HH:mm');

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  series,
  granularity,
  onGranularityChange,
  showCritical,
  showWarning,
  onToggleCritical,
  onToggleWarning,
  showMarkers,
  onToggleMarkers,
  hoveredId,
  onHoverChange,
  zoomRange,
  onZoomChange,
  onMarkerClick,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'from' | 'to' | null>(null);

  const visibleSeries = useMemo(() => {
    if (series.length === 0) return [];
    const n = series.length;
    const startIdx = Math.floor((zoomRange[0] / 100) * (n - 1));
    const endIdx = Math.ceil((zoomRange[1] / 100) * (n - 1));
    return series.slice(startIdx, endIdx + 1);
  }, [series, zoomRange]);

  const points = useMemo(() => toChartPoints(visibleSeries), [visibleSeries]);
  const linePath = useMemo(() => buildSmoothLinePath(points), [points]);
  const areaPath = useMemo(() => buildAreaPath(points), [points]);

  const stats = useMemo(() => {
    const values = visibleSeries.map(s => s.value);
    if (values.length === 0) return { avg: 0, max: 0 };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    return { avg, max };
  }, [visibleSeries]);

  const { yForValue, domainMax } = useMemo(() => buildScale(visibleSeries.map(s => s.value)), [visibleSeries]);

  const peakIndex = useMemo(() => {
    if (visibleSeries.length === 0) return -1;
    let idx = 0;
    let maxV = -Infinity;
    visibleSeries.forEach((s, i) => { if (s.value > maxV) { maxV = s.value; idx = i; } });
    return idx;
  }, [visibleSeries]);

  const markers = points.filter((p, i) => {
    const s = visibleSeries[i];
    if (!s.isSpike) return false;
    if (s.severity === 'critical' && !showCritical) return false;
    if (s.severity !== 'critical' && !showWarning) return false;
    return true;
  });

  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; value: number; timestamp: string } | null>(null);

  const handleMarkerEnter = (p: { x: number; y: number; value: number; timestamp: string }, id: string) => {
    onHoverChange(id);
    setHoverPoint(p);
  };
  const handleMarkerLeave = () => {
    onHoverChange(null);
    setHoverPoint(null);
  };

  const startDrag = (handle: 'from' | 'to') => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(handle);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    if (dragging === 'from') {
      onZoomChange([Math.min(pct, zoomRange[1] - 2), zoomRange[1]]);
    } else {
      onZoomChange([zoomRange[0], Math.max(pct, zoomRange[0] + 2)]);
    }
  };
  const endDrag = () => setDragging(null);

  const firstTs = series[0]?.timestamp;
  const lastTs = series[series.length - 1]?.timestamp;

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-title">Обзор показателей</div>
        <div className="chart-controls">
          <div className="segmented">
            {(['Hour', 'Day', 'Week'] as const).map(g => (
              <button
                key={g}
                type="button"
                className={`seg-btn ${granularity === g ? 'active' : ''}`}
                onClick={() => onGranularityChange(g)}
              >
                {g === 'Hour' ? 'Час' : g === 'Day' ? 'День' : 'Неделя'}
              </button>
            ))}
          </div>
          <button type="button" className={`legend-chip crit ${!showCritical ? 'off' : ''}`} onClick={onToggleCritical}>
            <span className="dot7" style={{ background: '#d64933' }} />Критическая
          </button>
          <button type="button" className={`legend-chip warn ${!showWarning ? 'off' : ''}`} onClick={onToggleWarning}>
            <span className="dot7" style={{ background: '#e2a339' }} />Предупреждение
          </button>
          <span className="line-legend">
            <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#c3cadb' }} />Среднее</span>
            <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#e79b90' }} />Максимум</span>
          </span>
          <button
            type="button"
            className="switch-track"
            style={{ background: showMarkers ? '#3D63DD' : '#d7dceb' }}
            onClick={onToggleMarkers}
            title="Маркеры"
          >
            <span className="switch-knob" style={{ transform: showMarkers ? 'translateX(16px)' : 'translateX(0)' }} />
          </button>
        </div>
      </div>

      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${VIEW_W} 260`}
          style={{ width: '100%', height: 'auto', aspectRatio: '1000/260', display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3D63DD" stopOpacity="0.38" />
              <stop offset="55%" stopColor="#3D63DD" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#3D63DD" stopOpacity="0" />
            </linearGradient>
            <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <line x1="0" y1={yForValue(stats.avg)} x2={VIEW_W} y2={yForValue(stats.avg)} stroke="#d7dceb" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="4 4" />
          <line x1="0" y1={yForValue(stats.max)} x2={VIEW_W} y2={yForValue(stats.max)} stroke="#f0c9c2" strokeWidth="1" strokeDasharray="4 4" />

          {areaPath && <path d={areaPath} fill="url(#areaGrad)" stroke="none" />}
          {linePath && (
            <path
              key={linePath}
              d={linePath}
              fill="none"
              stroke="#3D63DD"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#lineGlow)"
              pathLength={1}
              className="chart-draw-line"
            />
          )}

          {showMarkers && peakIndex >= 0 && markers.some(m => m.index === peakIndex) && (
            <circle
              cx={points[peakIndex].x}
              cy={points[peakIndex].y}
              r="5"
              fill="none"
              stroke={visibleSeries[peakIndex]?.severity === 'critical' ? '#d64933' : '#e2a339'}
              strokeWidth="2"
              className="peak-ring"
            />
          )}

          {showMarkers && markers.map(m => {
            const s = visibleSeries[m.index];
            const id = s.timestamp;
            const color = s.severity === 'critical' ? '#d64933' : '#e2a339';
            const isHovered = hoveredId === id;
            return (
              <g key={id}>
                <circle
                  cx={m.x}
                  cy={m.y}
                  r="13"
                  fill="transparent"
                  onMouseEnter={() => handleMarkerEnter({ x: m.x, y: m.y, value: s.value, timestamp: s.timestamp }, id)}
                  onMouseLeave={handleMarkerLeave}
                  onClick={() => onMarkerClick?.(s.timestamp)}
                  style={{ cursor: 'pointer' }}
                />
                <circle
                  cx={m.x}
                  cy={m.y}
                  r={isHovered ? 8.5 : 5}
                  fill={color}
                  stroke="#fff"
                  strokeWidth="1.5"
                  className="anomaly-marker"
                  style={{ filter: 'drop-shadow(0 2px 3px rgba(20,30,60,.25))', pointerEvents: 'none' }}
                />
              </g>
            );
          })}
        </svg>

        {hoverPoint && (
          <div
            className="tooltip"
            style={{
              left: `${(hoverPoint.x / VIEW_W) * 100}%`,
              top: `${(hoverPoint.y / 260) * 100}%`,
              transform: 'translate(-50%,-148%)',
            }}
          >
            <div className="tooltip-box">
              <div className="tooltip-value">{Math.round(hoverPoint.value)}</div>
              <div className="tooltip-date">{fmtDate(hoverPoint.timestamp)}</div>
            </div>
            <div className="tooltip-arrow" />
          </div>
        )}
      </div>

      <div
        className="zoom-row"
        onPointerMove={onTrackPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <span className="zoom-label">{firstTs ? dayjs(firstTs).format('DD.MM') : ''}</span>
        <div className="zoom-track" ref={trackRef}>
          <div className="zoom-fill" style={{ left: `${zoomRange[0]}%`, right: `${100 - zoomRange[1]}%` }} />
          <div
            className="zoom-handle"
            style={{ left: `${zoomRange[0]}%`, transform: 'translate(-50%,-50%)' }}
            onPointerDown={startDrag('from')}
          />
          <div
            className="zoom-handle"
            style={{ left: `${zoomRange[1]}%`, transform: 'translate(-50%,-50%)' }}
            onPointerDown={startDrag('to')}
          />
        </div>
        <span className="zoom-label">{lastTs ? dayjs(lastTs).format('DD.MM') : ''}</span>
      </div>
    </div>
  );
};
