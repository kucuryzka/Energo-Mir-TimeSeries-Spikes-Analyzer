import React, { useState, useEffect } from 'react';
import { Spin, Row, Col } from 'antd';
import { AreaChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
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

export const LegacyDboDashboard: React.FC<DashboardProps> = ({ confidence, windowSize, granularity, onGranularityChange }) => {
  const [loading, setLoading] = useState(false);
  const [seriesData, setSeriesData] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setSeriesData(mockData.series);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [confidence, windowSize]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;

  const stats = getStatistics(seriesData);
  const enrichedData = enrichSpikeData(seriesData);

  const criticalPercentage = stats.spikesCount > 0 
    ? Math.round((stats.criticalSpikes / stats.spikesCount) * 100) 
    : 0;

  return (
    <div style={{ paddingBottom: '40px', boxSizing: 'border-box' }}>
      
      {/* Сетка карточек KPI — Увеличенная высота (меньшая сторона) до 140px */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* ВСЕГО ЗНАЧЕНИЙ */}
        <div className="kpi-gradient-blue" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', height: '140px', borderRadius: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B65B2', fontSize: 16, fontWeight: 600 }}>
            <span>ВСЕГО ЗНАЧЕНИЙ</span>
            <AreaChartOutlined style={{ opacity: 0.5 }} />
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto', fontFamily: 'system-ui' }}>{stats.totalPoints}</span>
        </div>
        
        {/* ОБНАРУЖЕНО АНОМАЛИЙ */}
        <div className="kpi-gradient-blue" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', height: '140px', borderRadius: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B65B2', fontSize: 16, fontWeight: 600 }}>
            <span>ОБНАРУЖЕНО АНОМАЛИЙ</span>
            <AreaChartOutlined style={{ opacity: 0.5 }} />
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#3B65D9', marginTop: 'auto', fontFamily: 'system-ui' }}>{stats.spikesCount}</span>
        </div>
        
        {/* КРИТИЧЕСКИХ */}
        <div className="kpi-gradient-red" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', height: '140px', borderRadius: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#D94A4A', fontSize: 16, fontWeight: 600 }}>
            <span>КРИТИЧЕСКИХ</span>
            <AreaChartOutlined style={{ color: '#D94A4A', opacity: 0.5 }} />
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#D94A4A', marginTop: 'auto', fontFamily: 'system-ui' }}>{stats.criticalSpikes}</span>
        </div>
        
        {/* СРЕДНЕЕ ЗНАЧЕНИЕ */}
        <div className="kpi-gradient-white" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', height: '140px', border: '1px solid #E9EEFA', borderRadius: '12px', background: '#FFF', boxSizing: 'border-box' }}>
          <span style={{ color: '#7A8B9E', fontSize: 16, fontWeight: 600 }}>СРЕДНЕЕ ЗНАЧЕНИЕ</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto', fontFamily: 'system-ui' }}>{stats.average.toFixed(2)}</span>
        </div>
        
        {/* МАКСИМУМ */}
        <div className="kpi-gradient-blue" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', height: '140px', borderRadius: '12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B65B2', fontSize: 16, fontWeight: 600 }}>
            <span>МАКСИМУМ</span>
            <AreaChartOutlined style={{ opacity: 0.5 }} />
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto', fontFamily: 'system-ui' }}>{stats.max.toFixed(2)}</span>
        </div>
        
        {/* ВСЕГО ТОЧЕК */}
        <div className="kpi-gradient-white" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '20px', height: '140px', border: '1px solid #E9EEFA', borderRadius: '12px', background: '#FFF', boxSizing: 'border-box' }}>
          <span style={{ color: '#7A8B9E', fontSize: 16, fontWeight: 600 }}>ВСЕГО ТОЧЕК</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', marginTop: 'auto', fontFamily: 'system-ui' }}>{stats.totalPoints}</span>
        </div>
      </div>

      {/* Панель главного графика */}
      <div className="dashboard-block" style={{ backgroundColor: '#F8F9FE', border: '1px solid #E9EEFA', padding: '24px', paddingBottom: '32px', marginBottom: '24px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 24 }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#1A2332', marginRight: '8px', fontFamily: 'system-ui' }}>График</span>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#1A2332', fontFamily: 'system-ui' }}>показателей</span>
        </div>
        
        <SpikeChart 
          data={enrichedData} 
          showMarkers={true} 
          onPointClick={() => {}} 
          granularity={granularity}
          onGranularityChange={onGranularityChange}
        />
      </div>

      <Row gutter={[24, 24]}>
        {/* Карточка круговой диаграммы критичности */}
        <Col span={8}>
          <div className="dashboard-block" style={{ 
            minHeight: '460px', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-between',
            padding: '24px', 
            background: '#FFF',
            borderRadius: '16px',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.02)',
            boxSizing: 'border-box'
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A2332', marginBottom: 8, fontFamily: 'system-ui' }}>
              Критичность аномалий
            </h3>
            
            <div style={{ 
              flex: 1, 
              position: 'relative', 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                zIndex: 2,
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2332', lineHeight: '34px', fontFamily: 'system-ui' }}>
                  {criticalPercentage}%
                </div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#7A8B9E', letterSpacing: '0.5px', marginTop: 4, fontFamily: 'system-ui' }}>
                  КРИТИЧНО
                </div>
              </div>

              <div style={{ width: '100%', height: '260px' }}>
                <ReactECharts
                  notMerge={true}
                  style={{ height: '100%', width: '100%' }}
                  option={{
                    backgroundColor: 'transparent',
                    tooltip: { 
                      trigger: 'item', 
                      backgroundColor: '#1A2332', 
                      textStyle: { color: '#fff', fontSize: 12 } 
                    },
                    series: [
                      {
                        name: 'Распределение',
                        type: 'pie',
                        center: ['50%', '50%'],
                        radius: ['76%', '95%'], 
                        avoidLabelOverlap: false,
                        label: { show: false },
                        emphasis: { scale: false },
                        data: [
                          { 
                            value: stats.criticalSpikes, 
                            name: 'Критических', 
                            itemStyle: { 
                              color: '#D94A4A',
                              shadowBlur: 20,
                              shadowColor: 'rgba(219, 74, 74, 0.35)'
                            } 
                          },
                          { 
                            value: Math.max(0, stats.spikesCount - stats.criticalSpikes), 
                            name: 'Предупреждений', 
                            itemStyle: { 
                              color: '#E8A838',
                              shadowBlur: 20,
                              shadowColor: 'rgba(232, 168, 56, 0.35)'
                            } 
                          }
                        ]
                      }
                    ]
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginTop: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, color: '#7A8B9E', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'system-ui' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D94A4A' }} /> Критических
                </span>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', marginTop: 4, fontFamily: 'system-ui' }}>
                  {stats.criticalSpikes}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 12, color: '#7A8B9E', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'system-ui' }}>
                  Предупреждений <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8A838' }} />
                </span>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', marginTop: 4, fontFamily: 'system-ui' }}>
                  {Math.max(0, stats.spikesCount - stats.criticalSpikes)}
                </span>
              </div>
            </div>
          </div>
        </Col>

        {/* Таблица инцидентов */}
        <Col span={16}>
          <div className="dashboard-block" style={{ height: '100%', padding: '24px', paddingBottom: '32px', background: '#FFF', borderRadius: '16px', boxShadow: '0 4px 18px rgba(0, 0, 0, 0.02)' }}>
            <SpikeTable spikes={seriesData.filter(s => s.isSpike)} />
          </div>
        </Col>
      </Row>
    </div>
  );
};