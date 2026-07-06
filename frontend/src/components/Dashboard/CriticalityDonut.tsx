import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

interface CriticalityDonutProps {
  criticalCount: number;
  warningCount: number;
}

export const CriticalityDonut: React.FC<CriticalityDonutProps> = ({ criticalCount, warningCount }) => {
  const total = criticalCount + warningCount;
  const criticalPercentage = total > 0 ? Math.round((criticalCount / total) * 100) : 0;

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1A2332',
      textStyle: { color: '#fff', fontSize: 12 },
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
            value: criticalCount,
            name: 'Критических',
            itemStyle: {
              color: '#D94A4A',
              shadowBlur: 20,
              shadowColor: 'rgba(219, 74, 74, 0.35)',
            },
          },
          {
            value: Math.max(0, warningCount),
            name: 'Предупреждений',
            itemStyle: {
              color: '#E8A838',
              shadowBlur: 20,
              shadowColor: 'rgba(232, 168, 56, 0.35)',
            },
          },
        ],
      },
    ],
  }), [criticalCount, warningCount]);

  return (
    <div
      className="dashboard-block"
      style={{
        minHeight: 460,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 24,
        background: '#FFF',
        borderRadius: 16,
        boxSizing: 'border-box',
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A2332', marginBottom: 8 }}>
        Критичность аномалий
      </h3>

      <div style={{ flex: 1, position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1A2332', lineHeight: '34px' }}>
            {criticalPercentage}%
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7A8B9E', letterSpacing: '0.5px', marginTop: 4 }}>
            КРИТИЧНО
          </div>
        </div>

        <div style={{ width: '100%', height: 260 }}>
          <ReactECharts notMerge option={option} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#7A8B9E' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D94A4A' }} />
          Критических: <b style={{ color: '#1A2332' }}>{criticalCount}</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#7A8B9E' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8A838' }} />
          Предупреждений: <b style={{ color: '#1A2332' }}>{warningCount}</b>
        </div>
      </div>
    </div>
  );
};
