import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Switch } from 'antd';
import type { SpikePoint, TimeGranularity } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface SpikeChartProps {
  data: SpikePoint[];
  showMarkers: boolean;
  onPointClick: (point: SpikePoint) => void;
  granularity: TimeGranularity;
  onGranularityChange: (v: TimeGranularity) => void;
}

export const SpikeChart: React.FC<SpikeChartProps> = ({ data, onPointClick, granularity, onGranularityChange }) => {
  
  const chartOptions = {
    backgroundColor: 'transparent',
    
    grid: { 
      top: 60, 
      left: 20, 
      right: 20, 
      bottom: 40, 
      containLabel: true 
    },
    tooltip: { 
      trigger: 'axis', 
      backgroundColor: '#1A2332', 
      textStyle: { color: '#ffffff' } 
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.timestamp),
      axisLabel: { 
        formatter: (v: string) => dayjs(v).format('DD.MM HH:mm'), 
        color: '#7A8B9E', 
        fontSize: 10 
      },
      axisLine: { lineStyle: { color: '#E9EEFA' } },
      axisTick: { show: false }
    },
    yAxis: { 
      type: 'value', 
      splitLine: { lineStyle: { color: '#EFF2F9' } },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    dataZoom: [
      {
        type: 'slider',
        show: true,
        start: 0,
        end: 100,
        height: 8,
        bottom: 0,
        borderColor: 'transparent',
        backgroundColor: '#E9EEFA',
        fillerColor: 'rgba(71, 97, 191, 0.15)',
        handleIcon: 'circle',
        handleSize: '120%',
        handleStyle: { color: '#4761BF', borderWidth: 0 },
        textStyle: { color: 'transparent' }
      }
    ],
    series: [
      {
        name: 'Показатели',
        type: 'line',
        data: data.map(d => d.value),
        smooth: false, 
        showSymbol: false,
        
        // Мощное и глубокое неоновое свечение графика
        lineStyle: { 
          color: '#4761BF', 
          width: 2.5,
          shadowBlur: 32,
          shadowColor: 'rgba(71, 97, 191, 0.95)',
          shadowOffsetY: 6
        },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(71, 97, 191, 0.25)' },
              { offset: 1, color: 'rgba(71, 97, 191, 0.0)' }
            ]
          }
        },
        
        markPoint: {
          symbol: 'circle',
          symbolSize: 8,
          data: data.map((d, idx) => d.isSpike ? {
            coord: [idx, d.value + 10], 
            itemStyle: { 
              color: d.pValue < 0.01 ? '#D94A4A' : '#E8A838',
              shadowBlur: 8,
              shadowColor: d.pValue < 0.01 ? 'rgba(219,74,74,0.5)' : 'rgba(232,168,56,0.5)'
            }
          } : null).filter(Boolean)
        }
      }
    ]
  };

  const timeOptions: { label: string; value: TimeGranularity }[] = [
    { label: 'Час', value: 'Hour' },
    { label: 'День', value: 'Day' },
    { label: 'Неделя', value: 'Week' }
  ];

  const currentGranularity = granularity === 'Custom' || granularity === 'Minute' ? 'Hour' : granularity;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Кастомная стильная панель управления над графиком */}
      <div style={{ position: 'absolute', top: -60, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 20 }}>
        
        {/* Выровненный выбор периода одинаковой ширины в цвет графика */}
        <div style={{ display: 'flex', background: '#FFF', padding: '3px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {timeOptions.map((opt) => {
            const isActive = currentGranularity === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onGranularityChange(opt.value)}
                style={{
                  width: '68px',
                  height: '30px',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: isActive ? '#4761BF' : 'transparent',
                  color: isActive ? '#FFF' : '#7A8B9E',
                  boxShadow: isActive ? '0 3px 10px rgba(71, 97, 191, 0.4)' : 'none'
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Легенда с точками-индикаторами и свитч */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#7A8B9E', fontWeight: 600 }}>
          <span style={{ background: '#FBECE9', color: '#D94A4A', padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D94A4A' }} /> Критическая
          </span>
          <span style={{ background: '#FFF8EB', color: '#E8A838', padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8A838' }} /> Предупреждение
          </span>
          <Switch defaultChecked size="small" style={{ background: '#4761BF' }} />
        </div>
      </div>
      
      <ReactECharts option={chartOptions} style={{ height: '370px', width: '100%' }} onEvents={{
        'click': (p: any) => { const pt = data[p.dataIndex]; if (pt) onPointClick(pt); }
      }} />
    </div>
  );
};