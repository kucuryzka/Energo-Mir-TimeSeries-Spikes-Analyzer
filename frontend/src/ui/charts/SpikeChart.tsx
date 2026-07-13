import React, { useMemo, useState, useCallback } from 'react';
import { Switch } from 'antd';
import type { SpikePoint } from '../../types/analytics.types';
import dayjs from 'dayjs';
import {
  VIEW_W,
  VIEW_H,
  BASELINE_Y,
  LEFT_PADDING,
  CHART_W,
  MAX_POINTS,
  X_LABEL_FONT_SIZE,
  X_LABEL_ROTATE_DEG,
  MIN_X_LABEL_SPACING,
  lttbSampling,
  buildScale,
  toChartPoints,
  buildLinePath,
  buildAreaPath,
  getXAxisLabels,
  getYAxisLabels,
  fmtDate,
  ZOOM_EDGE_DATE_FORMAT,
} from './spikeChartGeometry';
import { useSpikeZoom } from './useSpikeZoom';

interface Props {
  data: SpikePoint[];
  yAxisLabel?: string;
  showMarkers?: boolean;
  showCriticalMarkers?: boolean;
  showWarningMarkers?: boolean;
  hideToolbar?: boolean;
  onShowMarkersChange?: (value: boolean) => void;
  onPointClick?: (point: SpikePoint) => void;
}

export const SpikeChart: React.FC<Props> = ({
  data,
  yAxisLabel = 'Количество сообщений телеметрии',
  showMarkers = true,
  showCriticalMarkers = true,
  showWarningMarkers = true,
  hideToolbar = false,
  onShowMarkersChange,
  onPointClick,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; value: number; timestamp: string } | null>(null);
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number; value: number; timestamp: string } | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const { zoomRange, trackRef, startDrag, startTrackSelect, onTrackPointerMove, endDrag } = useSpikeZoom();

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [data]);

  const sampledData = useMemo(() => {
    if (sortedData.length <= MAX_POINTS) return sortedData;
    return lttbSampling(sortedData, MAX_POINTS);
  }, [sortedData]);

  const visibleData = useMemo(() => {
    if (sampledData.length === 0) return [];
    const n = sampledData.length;
    const startIdx = Math.floor((zoomRange[0] / 100) * (n - 1));
    const endIdx = Math.ceil((zoomRange[1] / 100) * (n - 1));
    return sampledData.slice(startIdx, endIdx + 1);
  }, [sampledData, zoomRange]);

  const points = useMemo(() => toChartPoints(visibleData), [visibleData]);
  const linePath = useMemo(() => buildLinePath(points), [points]);
  const areaPath = useMemo(() => buildAreaPath(points), [points]);

  const xLabels = useMemo(() => {
    const maxCount = Math.max(2, Math.floor(CHART_W / MIN_X_LABEL_SPACING));
    return getXAxisLabels(visibleData, maxCount);
  }, [visibleData]);

  const stats = useMemo(() => {
    const values = visibleData.map(s => s.value);
    if (values.length === 0) return { avg: 0, max: 0, min: 0 };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    return { avg, max, min };
  }, [visibleData]);

  const { yForValue } = useMemo(() => buildScale(visibleData.map(s => s.value)), [visibleData]);

  const maxYValue = useMemo(() => {
    const values = visibleData.map(s => s.value);
    return values.length ? Math.max(...values) : 0;
  }, [visibleData]);

  const yLabels = useMemo(() => {
    return getYAxisLabels(maxYValue, 5);
  }, [maxYValue]);

  const peakIndex = useMemo(() => {
    if (visibleData.length === 0) return -1;
    let idx = 0;
    let maxV = -Infinity;
    visibleData.forEach((s, i) => { if (s.value > maxV) { maxV = s.value; idx = i; } });
    return idx;
  }, [visibleData]);

  const markers = useMemo(() => {
    return points.filter((_, i) => {
      const s = visibleData[i];
      if (!s.isSpike) return false;
      if (s.pValue < 0.01 && !showCriticalMarkers) return false;
      if (s.pValue >= 0.01 && !showWarningMarkers) return false;
      return true;
    });
  }, [points, visibleData, showCriticalMarkers, showWarningMarkers]);

  // Обработчик движения мыши по SVG
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const viewBoxWidth = VIEW_W;
    const scaleX = viewBoxWidth / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    
    // Проверяем, что мышь в пределах графика
    if (x < LEFT_PADDING || x > VIEW_W) {
      setCursorVisible(false);
      setCursorPoint(null);
      return;
    }
    
    // Находим ближайшую точку
    let closestIdx = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    
    const point = visibleData[closestIdx];
    if (point) {
      setCursorPoint({
        x: points[closestIdx].x,
        y: points[closestIdx].y,
        value: point.value,
        timestamp: point.timestamp,
      });
      setCursorVisible(true);
    }
  }, [points, visibleData]);

  const handleSvgMouseLeave = useCallback(() => {
    setCursorVisible(false);
    setCursorPoint(null);
  }, []);

  // Обработчик клика по прозрачной области
  const handlePolylineClick = useCallback((e: React.MouseEvent<SVGPolylineElement>) => {
    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewBoxWidth = VIEW_W;
    const scaleX = viewBoxWidth / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    
    let closestIdx = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });
    
    const point = visibleData[closestIdx];
    if (point && onPointClick) {
      onPointClick(point);
    }
  }, [points, visibleData, onPointClick]);

  const handleMarkerEnter = useCallback((p: { x: number; y: number; value: number; timestamp: string }, id: string) => {
    setHoveredId(id);
    setHoverPoint(p);
  }, []);

  const handleMarkerLeave = useCallback(() => {
    setHoveredId(null);
    setHoverPoint(null);
  }, []);

  const handlePointClick = useCallback((timestamp: string) => {
    const point = visibleData.find(d => d.timestamp === timestamp);
    if (point && onPointClick) onPointClick(point);
  }, [visibleData, onPointClick]);

  const firstTs = visibleData[0]?.timestamp;
  const lastTs = visibleData[visibleData.length - 1]?.timestamp;
  const isSampled = sortedData.length > MAX_POINTS;

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
          {isSampled && (
            <span style={{
              fontSize: 10,
              color: '#E8A838',
              background: 'rgba(232,168,56,0.12)',
              padding: '2px 8px',
              borderRadius: 999,
            }}>
              {sortedData.length} → {sampledData.length} точек
            </span>
          )}
        </div>
      )}

      <div className="chart-card" style={{ padding: '22px 24px 18px' }}>
        <div className="chart-wrap" style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            style={{ width: '100%', height: 'auto', aspectRatio: `${VIEW_W}/${VIEW_H}`, display: 'block', overflow: 'visible' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={handleSvgMouseLeave}
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

            {/* Подпись оси Y (слева) */}
            <text
              x={18}
              y={VIEW_H / 2}
              textAnchor="middle"
              fill="#7A8B9E"
              fontSize="11"
              fontFamily="Manrope, sans-serif"
              transform={`rotate(-90, 18, ${VIEW_H / 2})`}
            >
              {yAxisLabel}
            </text>

            {/* Подписи оси Y — числовые значения */}
            {yLabels.map((label) => {
              const y = yForValue(label);
              if (y < 0 || y > BASELINE_Y) return null;
              return (
                <g key={label}>
                  <text
                    x={LEFT_PADDING - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill="#7A8B9E"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {Math.round(label)}
                  </text>
                  <line
                    x1={LEFT_PADDING}
                    y1={y}
                    x2={VIEW_W}
                    y2={y}
                    stroke="var(--chart-grid-line)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.4"
                  />
                </g>
              );
            })}

            {/* Среднее, максимум, минимум с подписями */}
            <line x1={LEFT_PADDING} y1={yForValue(stats.avg)} x2={VIEW_W} y2={yForValue(stats.avg)} stroke="var(--chart-avg-line)" strokeWidth="1.5" strokeDasharray="6 4" />
            <text
              x={VIEW_W - 10}
              y={yForValue(stats.avg) - 6}
              textAnchor="end"
              fill="#7A8B9E"
              fontSize="9"
              fontFamily="Manrope, sans-serif"
            >
              Ср.: {Math.round(stats.avg)}
            </text>

            <line x1={LEFT_PADDING} y1={yForValue(stats.max)} x2={VIEW_W} y2={yForValue(stats.max)} stroke="var(--chart-max-line)" strokeWidth="1.5" strokeDasharray="6 4" />
            <text
              x={VIEW_W - 10}
              y={yForValue(stats.max) - 6}
              textAnchor="end"
              fill="#C97A6E"
              fontSize="9"
              fontFamily="Manrope, sans-serif"
            >
              Макс.: {Math.round(stats.max)}
            </text>

            <line x1={LEFT_PADDING} y1={yForValue(stats.min)} x2={VIEW_W} y2={yForValue(stats.min)} stroke="var(--chart-min-line)" strokeWidth="1.5" strokeDasharray="6 4" />
            <text
              x={VIEW_W - 10}
              y={yForValue(stats.min) - 6}
              textAnchor="end"
              fill="#5A9E7A"
              fontSize="9"
              fontFamily="Manrope, sans-serif"
            >
              Мин.: {Math.round(stats.min)}
            </text>

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

            {/* Прозрачная область для клика по любой точке графика */}
            {visibleData.length > 0 && (
              <polyline
                points={points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
                style={{ cursor: 'pointer' }}
                onClick={handlePolylineClick}
              />
            )}

            {/* Темно-синяя точка-индикатор за мышкой */}
            {cursorVisible && cursorPoint && (
              <circle
                cx={cursorPoint.x}
                cy={cursorPoint.y}
                r="3.5"
                fill="#2A3A6A"
                opacity="0.85"
                stroke="#3D63DD"
                strokeWidth="1.5"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Анимация пульсации на пике */}
            {showMarkers && peakIndex >= 0 && markers.some(m => m.index === peakIndex) && (
              <circle
                cx={points[peakIndex].x}
                cy={points[peakIndex].y}
                r="3.5"
                fill="none"
                stroke={visibleData[peakIndex]?.pValue < 0.01 ? '#d64933' : '#e2a339'}
                strokeWidth="1.5"
                className="peak-ring"
              />
            )}

            {/* Маркеры аномалий */}
            {showMarkers && markers.slice(0, 200).map(m => {
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
                    r={isHovered ? 6 : 3.5}
                    fill={color}
                    className="anomaly-marker"
                    style={{ filter: 'drop-shadow(0 2px 3px rgba(20,30,60,.25))', pointerEvents: 'none' }}
                  />
                </g>
              );
            })}

            {/* Подписи оси X — вертикальные "столбики" дат */}
            {xLabels.map((label, index) => (
              <g key={index}>
                <text
                  x={label.x}
                  y={BASELINE_Y + 14}
                  textAnchor="end"
                  fill="#7A8B9E"
                  fontSize={X_LABEL_FONT_SIZE}
                  fontFamily="JetBrains Mono, monospace"
                  transform={`rotate(-${X_LABEL_ROTATE_DEG}, ${label.x}, ${BASELINE_Y + 14})`}
                >
                  {label.timestamp}
                </text>
                <line
                  x1={label.x}
                  y1={BASELINE_Y}
                  x2={label.x}
                  y2={BASELINE_Y + 6}
                  stroke="#E9EEFA"
                  strokeWidth="1"
                />
              </g>
            ))}
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
          style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 12, paddingLeft: LEFT_PADDING }}
        >
          <span className="zoom-label" style={{ font: '500 12px JetBrains Mono, monospace', color: 'var(--line-legend-color)' }}>
            {firstTs ? dayjs(firstTs).format(ZOOM_EDGE_DATE_FORMAT) : ''}
          </span>
          <div
            className="zoom-track"
            ref={trackRef}
            onPointerDown={startTrackSelect}
            style={{ flex: 1, height: '9px', borderRadius: '999px', background: 'var(--zoom-track-bg)', position: 'relative', cursor: 'pointer', touchAction: 'none' }}
          >
            <div className="zoom-fill" style={{ position: 'absolute', top: 0, bottom: 0, left: `${zoomRange[0]}%`, right: `${100 - zoomRange[1]}%`, background: 'rgba(61,99,221,.28)', borderRadius: '999px' }} />
            <div
              className="zoom-handle"
              style={{ position: 'absolute', top: '50%', left: `${zoomRange[0]}%`, transform: 'translate(-50%,-50%)', width: '13px', height: '13px', borderRadius: '50%', background: '#3D63DD', boxShadow: '0 0 0 3px var(--zoom-handle-ring),0 1px 3px rgba(0,0,0,.2)', cursor: 'grab', touchAction: 'none' }}
              onPointerDown={startDrag('from')}
            />
            <div
              className="zoom-handle"
              style={{ position: 'absolute', top: '50%', left: `${zoomRange[1]}%`, transform: 'translate(-50%,-50%)', width: '13px', height: '13px', borderRadius: '50%', background: '#3D63DD', boxShadow: '0 0 0 3px var(--zoom-handle-ring),0 1px 3px rgba(0,0,0,.2)', cursor: 'grab', touchAction: 'none' }}
              onPointerDown={startDrag('to')}
            />
          </div>
          <span className="zoom-label" style={{ font: '500 12px JetBrains Mono, monospace', color: 'var(--line-legend-color)' }}>
            {lastTs ? dayjs(lastTs).format(ZOOM_EDGE_DATE_FORMAT) : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
