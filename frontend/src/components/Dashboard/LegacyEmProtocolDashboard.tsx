import React, { useState, useEffect } from 'react';
import { Spin, Row, Col } from 'antd';
import { mockData } from '../../mocks/mockData';
import { SpikeChart } from '../Chart/SpikeChart';
import { SpikeTable } from '../Stats/SpikeTable';
import { enrichSpikeData, getStatistics } from '../../utils/spikeUtils';
import type { TimeGranularity } from '../../types/analytics.types';

interface DashboardProps {
  confidence: number;
  windowSize: number;
  dateRange: [string, string];
  granularity: TimeGranularity;
  onGranularityChange: (v: TimeGranularity) => void;
}

export const LegacyEmProtocolDashboard: React.FC<DashboardProps> = ({ confidence, windowSize, granularity, onGranularityChange }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData(mockData.series);
      setLoading(false);
    }, 300);
  }, [confidence, windowSize]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>;

  const stats = getStatistics(data);
  const enriched = enrichSpikeData(data);

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-gradient-blue">
          <span style={{ color: '#4B65B2', fontSize: 11, fontWeight: 700 }}>ВСЕГО СОБЫТИЙ EM</span>
          <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.totalCalls}</span>
        </div>
        <div className="kpi-gradient-blue">
          <span style={{ color: '#4B65B2', fontSize: 11, fontWeight: 700 }}>ОБНАРУЖЕНО ВСПЛЕСКОВ</span>
          <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#3B65D9' }}>{stats.spikesCount}</span>
        </div>
        <div className="kpi-gradient-red">
          <span style={{ color: '#D94A4A', fontSize: 11, fontWeight: 700 }}>КРИТИЧЕСКИХ</span>
          <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: '#D94A4A' }}>{stats.criticalSpikes}</span>
        </div>
        <div className="kpi-gradient-white">
          <span style={{ color: '#7A8B9E', fontSize: 11, fontWeight: 700 }}>СРЕДНЯЯ ЧАСТОТА</span>
          <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.average.toFixed(1)}</span>
        </div>
        <div className="kpi-gradient-blue">
          <span style={{ color: '#4B65B2', fontSize: 11, fontWeight: 700 }}>ПИКОВОЕ ЗНАЧЕНИЕ</span>
          <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.max}</span>
        </div>
        <div className="kpi-gradient-white">
          <span style={{ color: '#7A8B9E', fontSize: 11, fontWeight: 700 }}>ИНТЕРВАЛОВ ТЕЛЕМЕТРИИ</span>
          <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{stats.totalPoints}</span>
        </div>
      </div>

      <div className="dashboard-block">
        <SpikeChart 
          data={enriched} 
          showMarkers={true} 
          onPointClick={() => {}} 
          granularity={granularity}
          onGranularityChange={onGranularityChange}
        />
      </div>

      <Row gutter={[24, 24]} style={{ marginTop: 20 }}>
        <Col span={8}>
          <div className="dashboard-block" style={{ height: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border-split)' }}>Критичность аномалий</h3>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <div style={{ width: 120, height: 120, borderRadius: '50%', border: '12px solid #E8A838', borderTopColor: '#D94A4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>55%</div>
            </div>
          </div>
        </Col>
        <Col span={16}>
          <div className="dashboard-block" style={{ height: '100%' }}>
            <SpikeTable spikes={data.filter(s => s.isSpike)} />
          </div>
        </Col>
      </Row>
    </div>
  );
};