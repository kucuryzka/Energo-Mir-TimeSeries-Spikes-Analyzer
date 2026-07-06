import React from 'react';
import { Slider, DatePicker, Button } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TimeGranularity } from '../../types/analytics.types';

interface Props {
  granularity: TimeGranularity;
  onGranularityChange: (v: TimeGranularity) => void;
  confidence: number;
  onConfidenceChange: (v: number) => void;
  windowSize: number;
  onWindowSizeChange: (v: number) => void;
  dateRange: [string, string];
  onDateRangeChange: (dates: [string, string]) => void;
  onAnalyze: () => void;
  loading: boolean;
}

export const UnifiedControlsPanel: React.FC<Props> = ({
  confidence, onConfidenceChange,
  windowSize, onWindowSizeChange,
  dateRange, onDateRangeChange,
  onAnalyze
}) => {
  return (
    <div style={{ width: 280, padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Интервал дат */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7A8B9E', letterSpacing: '0.5px' }}>ПЕРИОД АНАЛИЗА</span>
        <DatePicker.RangePicker
          value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
          allowClear={false}
          suffixIcon={null}
          style={{ width: '100%', borderRadius: 10, height: 36 }}
          onChange={(dates) => {
            if (dates?.[0] && dates?.[1]) {
              onDateRangeChange([dates[0].toISOString(), dates[1].toISOString()]);
            }
          }}
        />
      </div>

      {/* Ползунок чувствительности */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7A8B9E', letterSpacing: '0.5px' }}>ЧУВСТВИТЕЛЬНОСТЬ</span>
          <span style={{ color: '#3B65D9', fontWeight: 700, fontSize: 13 }}>{confidence}%</span>
        </div>
        <Slider 
          min={80} 
          max={99} 
          value={confidence} 
          onChange={onConfidenceChange} 
          trackStyle={{ background: '#3B65D9', height: 4 }}
          railStyle={{ height: 4 }}
          handleStyle={{ borderColor: '#3B65D9', backgroundColor: '#FFF' }}
        />
      </div>

      {/* Окно сглаживания данных */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7A8B9E', letterSpacing: '0.5px' }}>ГЛУБИНА ОКНА</span>
          <span style={{ color: '#1A2332', fontWeight: 700, fontSize: 13 }}>{windowSize} тк.</span>
        </div>
        <Slider 
          min={10} 
          max={100} 
          value={windowSize} 
          onChange={onWindowSizeChange} 
          trackStyle={{ background: '#1A2332', height: 4 }}
          railStyle={{ height: 4 }}
          handleStyle={{ borderColor: '#1A2332', backgroundColor: '#FFF' }}
        />
      </div>

      {/* Кнопка закрытия / применения */}
      <Button
        type="primary"
        icon={<CheckOutlined />}
        onClick={onAnalyze}
        style={{ 
          height: 38, 
          background: '#3B65D9', 
          borderColor: '#3B65D9', 
          borderRadius: 10, 
          fontWeight: 600,
          marginTop: 4
        }}
      >
        Применить
      </Button>
    </div>
  );
};