import React from 'react';
import { Row, Col, Select, Slider, DatePicker, Button, InputNumber } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TimeGranularity, ChannelDto } from '../../types/analytics.types';

interface Props {
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
      <Row gutter={[16, 16]} align="middle" wrap>
        <Col>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5a6e', whiteSpace: 'nowrap' }}>
              Детализация:
            </span>
            <Select
              value={granularity}
              onChange={onGranularityChange}
              style={{ width: 110 }}
              size="middle"
              options={[
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
                size="middle"
                style={{ width: 80 }}
              />
            )}
          </div>
        </Col>

        <Col>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5a6e', whiteSpace: 'nowrap' }}>
              Канал:
            </span>
            <Select
              showSearch
              allowClear
              placeholder="Все каналы"
              value={channelId}
              onChange={onChannelChange}
              onSearch={onSearchChannels}
              filterOption={false}
              style={{ width: 160 }}
              size="middle"
              options={channels.map(c => ({ value: c.id, label: c.name }))}
            />
          </div>
        </Col>

        <Col flex="1" style={{ minWidth: 160 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, color: '#4a5a6e' }}>
              <span>Чувствительность</span>
              <span style={{ color: '#2a5298' }}>{confidence}%</span>
            </div>
            <Slider
              min={80}
              max={99}
              value={confidence}
              onChange={onConfidenceChange}
              style={{ marginTop: 4 }}
              trackStyle={{ background: 'linear-gradient(90deg, #4a90d9, #2a5298)' }}
              railStyle={{ background: '#e8edf3' }}
              handleStyle={{ borderColor: '#2a5298' }}
            />
          </div>
        </Col>

        <Col>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5a6e', whiteSpace: 'nowrap' }}>
              Глубина анализа:
            </span>
            <InputNumber
              min={10}
              max={100}
              value={windowSize}
              onChange={onWindowSizeChange}
              size="middle"
              style={{ width: 70 }}
            />
            <span style={{ fontSize: 12, color: '#6b7a8f', whiteSpace: 'nowrap' }}>
              точек
            </span>
          </div>
        </Col>

        <Col>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5a6e', whiteSpace: 'nowrap' }}>
              Период:
            </span>
            <DatePicker.RangePicker
              value={[
                dateRange[0] ? dayjs(dateRange[0]) : null,
                dateRange[1] ? dayjs(dateRange[1]) : null,
              ]}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  onDateRangeChange([
                    dates[0].startOf('day').toISOString(),
                    dates[1].endOf('day').toISOString(),
                  ]);
                }
              }}
              size="middle"
              style={{ minWidth: 220 }}
            />
          </div>
        </Col>

        <Col>
          <Button
            type="primary"
            onClick={onAnalyze}
            loading={loading}
            size="middle"
            icon={<SearchOutlined />}
            style={{
              background: 'linear-gradient(135deg, #2a5298 0%, #1a3a6b 100%)',
              border: 'none',
              borderRadius: 8,
              height: 40,
              fontWeight: 500,
              boxShadow: '0 2px 8px rgba(42, 82, 152, 0.25)',
            }}
          >
            {loading ? 'Анализируем...' : 'Анализировать'}
          </Button>
        </Col>
      </Row>
    </div>
  );
};
