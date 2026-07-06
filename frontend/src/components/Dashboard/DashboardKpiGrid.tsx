import React from 'react';
import { AreaChartOutlined } from '@ant-design/icons';

export interface DashboardStats {
  totalPoints: number;
  totalCalls: number;
  average: number;
  max: number;
  min: number;
  spikesCount: number;
  criticalSpikes: number;
}

interface DashboardKpiGridProps {
  stats: DashboardStats;
  averageDecimals?: number;
  maxDecimals?: number;
}

export const DashboardKpiGrid: React.FC<DashboardKpiGridProps> = ({
  stats,
  averageDecimals = 0,
  maxDecimals = 0,
}) => {
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 20,
    height: 140,
    borderRadius: 12,
    boxSizing: 'border-box',
  };

  return (
    <div className="kpi-grid">
      <div className="kpi-gradient-blue" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B65B2', fontSize: 13, fontWeight: 600 }}>
          <span>ВСЕГО ЗНАЧЕНИЙ</span>
          <AreaChartOutlined style={{ opacity: 0.5 }} />
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto' }}>
          {stats.totalCalls.toLocaleString()}
        </span>
      </div>

      <div className="kpi-gradient-blue" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B65B2', fontSize: 13, fontWeight: 600 }}>
          <span>ОБНАРУЖЕНО АНОМАЛИЙ</span>
          <AreaChartOutlined style={{ opacity: 0.5 }} />
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#3B65D9', marginTop: 'auto' }}>
          {stats.spikesCount}
        </span>
      </div>

      <div className="kpi-gradient-red" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#D94A4A', fontSize: 13, fontWeight: 600 }}>
          <span>КРИТИЧЕСКИХ</span>
          <AreaChartOutlined style={{ color: '#D94A4A', opacity: 0.5 }} />
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#D94A4A', marginTop: 'auto' }}>
          {stats.criticalSpikes}
        </span>
      </div>

      <div className="kpi-gradient-white" style={{ ...cardStyle, border: '1px solid #E9EEFA', background: '#FFF' }}>
        <span style={{ color: '#7A8B9E', fontSize: 13, fontWeight: 600 }}>СРЕДНЕЕ ЗНАЧЕНИЕ</span>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto' }}>
          {stats.average.toFixed(averageDecimals)}
        </span>
      </div>

      <div className="kpi-gradient-blue" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B65B2', fontSize: 13, fontWeight: 600 }}>
          <span>МАКСИМУМ</span>
          <AreaChartOutlined style={{ opacity: 0.5 }} />
        </div>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto' }}>
          {stats.max.toFixed(maxDecimals)}
        </span>
      </div>

      <div className="kpi-gradient-white" style={{ ...cardStyle, border: '1px solid #E9EEFA', background: '#FFF' }}>
        <span style={{ color: '#7A8B9E', fontSize: 13, fontWeight: 600 }}>ВСЕГО ТОЧЕК</span>
        <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto' }}>
          {stats.totalPoints}
        </span>
      </div>
    </div>
  );
};
