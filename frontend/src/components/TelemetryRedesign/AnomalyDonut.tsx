import React from 'react';
import { useCountUp } from './useCountUp';

interface AnomalyDonutProps {
  critical: number;
  warning: number;
}

const R = 40;
const CIRC = 2 * Math.PI * R;

export const AnomalyDonut: React.FC<AnomalyDonutProps> = ({ critical, warning }) => {
  const total = critical + warning;
  const criticalPct = total > 0 ? Math.round((critical / total) * 100) : 0;
  const criticalLen = total > 0 ? (critical / total) * CIRC : 0;
  const warningLen = total > 0 ? (warning / total) * CIRC : 0;

  const animatedPct = useCountUp(criticalPct, 900);
  const animatedCritical = useCountUp(critical, 900);
  const animatedWarning = useCountUp(warning, 900);

  return (
    <div className="donut-card">
      <div className="donut-title">Критичность аномалий</div>
      <div className="donut-wrap">
        <div className="donut-glow" />
        <svg width="150" height="150" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={R} fill="none" stroke="#eef2fb" strokeWidth="11" />
          {total > 0 && (
            <>
              <circle
                cx="48" cy="48" r={R} fill="none" stroke="#d64933" strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${criticalLen} ${CIRC - criticalLen}`}
                transform="rotate(-90 48 48)"
                style={{ filter: 'drop-shadow(0 3px 5px rgba(214,73,51,.25))', transition: 'stroke-dasharray .6s ease' }}
              />
              <circle
                cx="48" cy="48" r={R} fill="none" stroke="#e2a339" strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${warningLen} ${CIRC - warningLen}`}
                strokeDashoffset={-criticalLen}
                transform="rotate(-90 48 48)"
                style={{ filter: 'drop-shadow(0 3px 5px rgba(226,163,57,.2))', transition: 'stroke-dasharray .6s ease' }}
              />
            </>
          )}
        </svg>
        <div className="donut-center">
          <span className="donut-pct">{Math.round(animatedPct)}%</span>
          <span className="donut-sub">КРИТИЧНО</span>
        </div>
      </div>
      <div className="donut-legend">
        <div className="donut-legend-col">
          <span className="donut-legend-label"><span className="dot7" style={{ background: '#d64933' }} />Критических</span>
          <span className="donut-legend-value">{Math.round(animatedCritical)}</span>
        </div>
        <div className="donut-legend-col" style={{ alignItems: 'flex-end' }}>
          <span className="donut-legend-label">Предупреждений<span className="dot7" style={{ background: '#e2a339' }} /></span>
          <span className="donut-legend-value">{Math.round(animatedWarning)}</span>
        </div>
      </div>
    </div>
  );
};
