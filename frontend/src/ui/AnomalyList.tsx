import React from 'react';
import dayjs from 'dayjs';
import type { SpikePoint } from '../types/analytics.types';

interface AnomalyListProps {
  spikes: SpikePoint[];
  showCritical: boolean;
  showWarning: boolean;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  onRowClick?: (timestamp: string) => void;
}

export const AnomalyList: React.FC<AnomalyListProps> = ({ spikes, showCritical, showWarning, hoveredId, onHoverChange, onRowClick }) => {
  const filtered = spikes.filter(s => (s.severity === 'critical' ? showCritical : showWarning));

  return (
    <div className="list-card">
      <div className="list-title">Аномалии <span className="list-count">({filtered.length})</span></div>
      {filtered.length === 0 && (
        <div className="anomaly-empty" style={{ fontSize: 13, padding: '12px 4px' }}>Аномалий не обнаружено</div>
      )}
      {filtered.map(s => {
        const isCritical = s.severity === 'critical';
        const color = isCritical ? '#d64933' : '#e2a339';
        const bg = isCritical ? 'rgba(214,73,51,.1)' : 'rgba(226,163,57,.13)';
        const id = s.timestamp;
        const isHovered = hoveredId === id;
        return (
          <div
            key={id}
            className="anomaly-row"
            style={{ background: isHovered ? bg : 'transparent', cursor: onRowClick ? 'pointer' : 'default' }}
            onMouseEnter={() => onHoverChange(id)}
            onMouseLeave={() => onHoverChange(null)}
            onClick={() => onRowClick?.(id)}
          >
            <div className="anomaly-icon" style={{ background: bg }}>
              <span className="anomaly-icon-dot" style={{ background: color, boxShadow: `0 0 0 4px ${bg}` }} />
            </div>
            <div className="anomaly-body">
              <div className="anomaly-value">{Math.round(s.value).toLocaleString('ru-RU')} сообщений</div>
              <div className="anomaly-date">{dayjs(s.timestamp).format('DD.MM HH:mm')}</div>
            </div>
            <div className="anomaly-chip" style={{ background: bg, color }}>
              {isCritical ? 'Критическая' : 'Предупреждение'}
            </div>
          </div>
        );
      })}
    </div>
  );
};
