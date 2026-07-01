import React from 'react';
import { Select, Slider, DatePicker, Button, InputNumber } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TimeGranularity, ChannelDto, DataSourceDto } from '../../types/analytics.types';

interface Props {
  sourceId: string;
  onSourceChange: (value: string) => void;
  sources: DataSourceDto[];
  granularity: TimeGranularity;
  onGranularityChange: (value: TimeGranularity) => void;
  customMinutes: number | null;
  onCustomMinutesChange: (value: number | null) => void;
  confidence: number;
  onConfidenceChange: (value: number) => void;
  windowSize: number;
  onWindowSizeChange: (value: number | null) => void;
  dateRange: [string, string];
  onDateRangeChange: (dates: [string, string]) => void;
  channelId: number | null;
  onChannelChange: (value: number | null) => void;
  channels: ChannelDto[];
  onSearchChannels: (search: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}

export const ControlsPanel: React.FC<Props> = ({
  sourceId,
  granularity,
  onGranularityChange,
  customMinutes,
  onCustomMinutesChange,
  confidence,
  onConfidenceChange,
  windowSize,
  onWindowSizeChange,
  dateRange,
  onDateRangeChange,
  channelId,
  onChannelChange,
  channels,
  onSearchChannels,
  onAnalyze,
  loading,
}) => {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>


        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Детализация
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Select
              value={granularity}
              onChange={onGranularityChange}
              size="large"
              style={{ flex: 1 }}
              options={[
                { value: 'Second', label: 'Посекундно' },
                { value: 'Minute', label: 'Поминутно' },
                { value: 'Hour', label: 'Почасово' },
                { value: 'Day', label: 'Посуточно' },
                { value: 'Week', label: 'По неделям' },
                { value: 'Custom', label: 'Свой интервал' },
              ]}
            />
            {granularity === 'Custom' && (
              <InputNumber
                min={1}
                max={60}
                value={customMinutes}
                onChange={onCustomMinutesChange}
                placeholder="мин"
                size="large"
                style={{ width: 80 }}
              />
            )}
          </div>
        </div>

        {channels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {sourceId?.toLowerCase() === 'dbo' ? 'Объект' : 'Канал'}
            </label>
            <Select
              showSearch
              allowClear
              placeholder={sourceId?.toLowerCase() === 'dbo' ? 'Все объекты' : 'Все каналы'}
              value={channelId}
              onChange={onChannelChange}
              onSearch={onSearchChannels}
              filterOption={false}
              size="large"
              style={{ width: '100%' }}
              options={channels.map(c => ({ value: c.id, label: c.name }))}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Период
          </label>
          <DatePicker.RangePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            presets={[
              { label: 'Сегодня', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
              { label: 'Вчера', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
              { label: 'Последние 7 дней', value: [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')] },
              { label: 'Последние 30 дней', value: [dayjs().subtract(30, 'day').startOf('day'), dayjs().endOf('day')] },
              { label: 'Последние 90 дней', value: [dayjs().subtract(90, 'day').startOf('day'), dayjs().endOf('day')] },
              { label: 'Последние 120 дней', value: [dayjs().subtract(120, 'day').startOf('day'), dayjs().endOf('day')] },
              { label: 'Последние 365 дней', value: [dayjs().subtract(365, 'day').startOf('day'), dayjs().endOf('day')] },
              { label: 'Последние 2 года', value: [dayjs().subtract(2, 'year').startOf('day'), dayjs().endOf('day')] },
              { label: 'Последние 3 года', value: [dayjs().subtract(3, 'year').startOf('day'), dayjs().endOf('day')] },
            ]}
            value={[
              dateRange[0] ? dayjs(dateRange[0]) : null,
              dateRange[1] ? dayjs(dateRange[1]) : null,
            ]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                onDateRangeChange([
                  dates[0].toISOString(),
                  dates[1].toISOString(),
                ]);
              }
            }}
            size="large"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Чувствительность
            </label>
            <span style={{ color: '#1890ff', fontWeight: 600, fontSize: 14 }}>{confidence}%</span>
          </div>
          <Slider
            min={80}
            max={99}
            value={confidence}
            onChange={onConfidenceChange}
            style={{ margin: '12px 8px' }}
            trackStyle={{ background: '#1890ff' }}
            handleStyle={{ borderColor: '#1890ff' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Глубина (точек)
          </label>
          <InputNumber
            min={10}
            max={100}
            value={windowSize}
            onChange={onWindowSizeChange}
            size="large"
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1', marginTop: '12px' }}>
          <Button
            type="primary"
            onClick={onAnalyze}
            loading={loading}
            size="large"
            icon={<SearchOutlined />}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #2a5298 0%, #1a3a6b 100%)',
              border: 'none',
              borderRadius: 8,
              height: 48,
              fontSize: 16,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(42, 82, 152, 0.3)',
            }}
          >
            {loading ? 'Анализируем данные...' : 'Анализировать'}
          </Button>
        </div>
      </div>
    </div>
  );
};
