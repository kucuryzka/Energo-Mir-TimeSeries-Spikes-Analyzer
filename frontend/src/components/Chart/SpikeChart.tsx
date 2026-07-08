import React, { useMemo, useRef, useState } from 'react';
import { Switch } from 'antd';
import type { SpikePoint } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface Props {
  data: SpikePoint[];
  showMarkers?: boolean;
  showCriticalMarkers?: boolean;
  showWarningMarkers?: boolean;
  hideToolbar?: boolean;
  onShowMarkersChange?: (value: boolean) => void;
  onPointClick?: (point: SpikePoint) => void;
}

// Константы для SVG
const VIEW_W = 1000;
const VIEW_H = 260;
const TOP_PADDING = 20;
const BASELINE_Y = 240;

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  timestamp: string;
  index: number;
}

// Построение масштаба
function buildScale(values: number[]) {
  const maxValue = values.length ? Math.max(...values) : 0;
  const domainMax = maxValue > 0 ? maxValue * 1.12 : 1;
  const usableHeight = BASELINE_Y - TOP_PADDING;

  const yForValue = (v: number) => BASELINE_Y - (v / domainMax) * usableHeight;
  const xForIndex = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * VIEW_W);

  return { yForValue, xForIndex };
}

// Преобразование данных в точки
function toChartPoints(series: { timestamp: string; value: number }[]): ChartPoint[] {
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

// Прямая линия через все точки
function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return d;
}

// Построение области под графиком
function buildAreaPath(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  const line = buildLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${BASELINE_Y} L ${first.x.toFixed(1)} ${BASELINE_Y} Z`;
}

const fmtDate = (iso: string) => dayjs(iso).format('DD.MM HH:mm');

export const SpikeChart: React.FC<Props> = ({
  data,
  showMarkers = true,
  showCriticalMarkers = true,
  showWarningMarkers = true,
  hideToolbar = false,
  onShowMarkersChange,
  onPointClick,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; value: number; timestamp: string } | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, 100]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'from' | 'to' | null>(null);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [data]);

  // Применяем зум к данным
  const visibleData = useMemo(() => {
    if (sortedData.length === 0) return [];
    const n = sortedData.length;
    const startIdx = Math.floor((zoomRange[0] / 100) * (n - 1));
    const endIdx = Math.ceil((zoomRange[1] / 100) * (n - 1));
    return sortedData.slice(startIdx, endIdx + 1);
  }, [sortedData, zoomRange]);

  const points = useMemo(() => toChartPoints(visibleData), [visibleData]);
  const linePath = useMemo(() => buildLinePath(points), [points]);
  const areaPath = useMemo(() => buildAreaPath(points), [points]);

  const stats = useMemo(() => {
    const values = visibleData.map(s => s.value);
    if (values.length === 0) return { avg: 0, max: 0, min: 0 };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    return { avg, max, min };
  }, [visibleData]);

  const { yForValue } = useMemo(() => buildScale(visibleData.map(s => s.value)), [visibleData]);

  const peakIndex = useMemo(() => {
    if (visibleData.length === 0) return -1;
    let idx = 0;
    let maxV = -Infinity;
    visibleData.forEach((s, i) => { if (s.value > maxV) { maxV = s.value; idx = i; } });
    return idx;
  }, [visibleData]);

  const markers = points.filter((_p, i) => {
    const s = visibleData[i];
    if (!s.isSpike) return false;
    if (s.pValue < 0.01 && !showCriticalMarkers) return false;
    if (s.pValue >= 0.01 && !showWarningMarkers) return false;
    return true;
  });

  const handleMarkerEnter = (p: { x: number; y: number; value: number; timestamp: string }, id: string) => {
    setHoveredId(id);
    setHoverPoint(p);
  };
  const handleMarkerLeave = () => {
    setHoveredId(null);
    setHoverPoint(null);
  };

  const handlePointClick = (timestamp: string) => {
    const point = visibleData.find(d => d.timestamp === timestamp);
    if (point && onPointClick) onPointClick(point);
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
      setZoomRange([Math.min(pct, zoomRange[1] - 2), zoomRange[1]]);
    } else {
      setZoomRange([zoomRange[0], Math.max(pct, zoomRange[0] + 2)]);
    }
  };
  const endDrag = () => setDragging(null);

  const firstTs = visibleData[0]?.timestamp;
  const lastTs = visibleData[visibleData.length - 1]?.timestamp;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {onShowMarkersChange && !hideToolbar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            marginBottom: 8,
            fontSize: 12,
            color: '#7A8B9E',
            fontWeight: 600,
          }}
        >
          <span>Маркеры пиков</span>
          <Switch
            size="small"
            checked={showMarkers}
            onChange={onShowMarkersChange}
            style={{ background: showMarkers ? '#4761BF' : undefined }}
          />
        </div>
      )}

      <div className="chart-card" style={{ padding: '22px 24px 18px' }}>

        <div className="chart-wrap" style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            style={{ width: '100%', height: 'auto', aspectRatio: '1000/260', display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4761BF" stopOpacity="0.38" />
                <stop offset="55%" stopColor="#4761BF" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#4761BF" stopOpacity="0" />
              </linearGradient>
              <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Среднее, максимум, минимум */}
            <line x1="0" y1={yForValue(stats.avg)} x2={VIEW_W} y2={yForValue(stats.avg)} stroke="var(--chart-avg-line)" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="4 4" />
            <line x1="0" y1={yForValue(stats.max)} x2={VIEW_W} y2={yForValue(stats.max)} stroke="var(--chart-max-line)" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1={yForValue(stats.min)} x2={VIEW_W} y2={yForValue(stats.min)} stroke="var(--chart-min-line)" strokeWidth="1" strokeDasharray="4 4" />

            {/* Площадь под графиком */}
            {areaPath && <path d={areaPath} fill="url(#areaGrad)" stroke="none" />}
            
            {/* Линия графика */}
            {linePath && (
              <path
                key={linePath}
                d={linePath}
                fill="none"
                stroke="#4761BF"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#lineGlow)"
                pathLength={1}
                className="chart-draw-line"
              />
            )}

            {/* Анимация пульсации на пике */}
            {showMarkers && peakIndex >= 0 && markers.some(m => m.index === peakIndex) && (
              <circle
                cx={points[peakIndex].x}
                cy={points[peakIndex].y}
                r="5"
                fill="none"
                stroke={visibleData[peakIndex]?.pValue < 0.01 ? '#d64933' : '#e2a339'}
                strokeWidth="2"
                className="peak-ring"
              />
            )}

            {/* Маркеры аномалий */}
            {showMarkers && markers.map(m => {
              const s = visibleData[m.index];
              const id = s.timestamp;
              const isCritical = s.pValue < 0.01;
              const color = isCritical ? '#d64933' : '#e2a339';
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
                    onClick={() => handlePointClick(s.timestamp)}
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

          {/* Кастомный тултип */}
          {hoverPoint && (
            <div
              className="tooltip"
              style={{
                left: `${(hoverPoint.x / VIEW_W) * 100}%`,
                top: `${(hoverPoint.y / VIEW_H) * 100}%`,
                transform: 'translate(-50%,-148%)',
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            >
              <div className="tooltip-box" style={{
                background: 'var(--tooltip-bg)',
                borderRadius: '13px',
                padding: '9px 13px',
                boxShadow: 'var(--tooltip-shadow)',
                whiteSpace: 'nowrap',
              }}>
                <div className="tooltip-value" style={{ font: '700 15px JetBrains Mono, monospace', color: 'var(--text-heading)' }}>
                  {Math.round(hoverPoint.value)}
                </div>
                <div className="tooltip-date" style={{ font: '500 10.5px Manrope, sans-serif', color: 'var(--text-muted)' }}>
                  {fmtDate(hoverPoint.timestamp)}
                </div>
              </div>
              <div className="tooltip-arrow" style={{
                width: '10px',
                height: '10px',
                background: 'var(--tooltip-bg)',
                transform: 'rotate(45deg)',
                marginTop: '-5px',
              }} />
            </div>
          )}
        </div>

        {/* Зум */}
        <div
          className="zoom-row"
          onPointerMove={onTrackPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 12 }}
        >
          <span className="zoom-label" style={{ font: '500 10.5px JetBrains Mono, monospace', color: 'var(--line-legend-color)' }}>
            {firstTs ? dayjs(firstTs).format('DD.MM') : ''}
          </span>
          <div className="zoom-track" ref={trackRef} style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--zoom-track-bg)', position: 'relative' }}>
            <div className="zoom-fill" style={{ position: 'absolute', top: 0, bottom: 0, left: `${zoomRange[0]}%`, right: `${100 - zoomRange[1]}%`, background: 'rgba(61,99,221,.28)', borderRadius: '999px' }} />
            <div
              className="zoom-handle"
              style={{ position: 'absolute', top: '50%', left: `${zoomRange[0]}%`, transform: 'translate(-50%,-50%)', width: '11px', height: '11px', borderRadius: '50%', background: '#3D63DD', boxShadow: '0 0 0 3px var(--zoom-handle-ring),0 1px 3px rgba(0,0,0,.2)', cursor: 'grab', touchAction: 'none' }}
              onPointerDown={startDrag('from')}
            />
            <div
              className="zoom-handle"
              style={{ position: 'absolute', top: '50%', left: `${zoomRange[1]}%`, transform: 'translate(-50%,-50%)', width: '11px', height: '11px', borderRadius: '50%', background: '#3D63DD', boxShadow: '0 0 0 3px var(--zoom-handle-ring),0 1px 3px rgba(0,0,0,.2)', cursor: 'grab', touchAction: 'none' }}
              onPointerDown={startDrag('to')}
            />
          </div>
          <span className="zoom-label" style={{ font: '500 10.5px JetBrains Mono, monospace', color: 'var(--line-legend-color)' }}>
            {lastTs ? dayjs(lastTs).format('DD.MM') : ''}
          </span>
        </div>
      </div>
    </div>
  );
};