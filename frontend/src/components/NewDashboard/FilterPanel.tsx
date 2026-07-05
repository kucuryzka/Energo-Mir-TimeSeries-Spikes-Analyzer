import React from 'react';
import { DatePicker, Select, InputNumber, Popover } from 'antd';
import { PieChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { TimeGranularity, ChannelDto } from '../../types/analytics.types';
import { SourceToggle } from './SourceToggle';
import filterIcon from '../../assets/filters.svg';
import exportIcon from '../../assets/export.svg';
import './FilterPanel.css';

const { RangePicker } = DatePicker;

interface FilterPanelProps {
  sources: { label: string; value: string }[];
  sourceId: string;
  setSourceId: (val: string) => void;
  granularity: TimeGranularity;
  setGranularity: (val: TimeGranularity) => void;
  channelId: number | null;
  setChannelId: (val: number | null) => void;
  channels: ChannelDto[];
  onSearchChannels: (search: string) => void;
  customMinutes: number | null;
  setCustomMinutes: (val: number | null) => void;
  confidence: number;
  setConfidence: (val: number) => void;
  windowSize: number | null;
  setWindowSize: (val: number | null) => void;
  dateRange: [string, string];
  setDateRange: (val: [string, string]) => void;
  onSearch: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  sources,
  sourceId,
  setSourceId,
  granularity,
  setGranularity,
  channelId,
  setChannelId,
  channels,
  onSearchChannels,
  customMinutes,
  setCustomMinutes,
  confidence,
  setConfidence,
  windowSize,
  setWindowSize,
  dateRange,
  setDateRange,
  onSearch
}) => {
  const advancedSettings = (
    <div className="advanced-settings-popover">
      <div className="advanced-settings-row">
        <label>Глубина анализа:</label>
        <input
          className="filter-input short-input"
          placeholder="N точек"
          value={windowSize || ''}
          onChange={(e) => setWindowSize(e.target.value ? Number(e.target.value) : null)}
        />
      </div>

      <div className="filter-item filter-sensitivity">
        <div className="sensitivity-header">
          <label>Чувствительность</label>
          <span className="sensitivity-value">{confidence}%</span>
        </div>
        <input
          type="range"
          min="1" max="100"
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="sensitivity-slider"
        />
      </div>
    </div>
  );

  return (
    <div className="filter-panel-container">
      <div className="filter-controls">
        {sources.length > 0 && (
          <div className="filter-item">
            <label style={{ visibility: 'hidden' }}>Источник</label>
            <SourceToggle
              options={sources}
              value={sourceId}
              onChange={setSourceId}
            />
          </div>
        )}

        <div className="filter-item">
          <label>Детализация:</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Select
              size="large"
              value={granularity}
              onChange={(val) => setGranularity(val as TimeGranularity)}
              style={{ width: 190 }}
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
                size="large"
                min={1} max={60}
                value={customMinutes}
                onChange={(val) => setCustomMinutes(val)}
                placeholder="мин"
                style={{ width: 95 }}
              />
            )}
          </div>
        </div>

        <div className="filter-item">
          <label>{sourceId?.toLowerCase() === 'dbo' ? 'Объект:' : 'Канал:'}</label>
          <Select
            size="large"
            showSearch
            allowClear
            placeholder={sourceId?.toLowerCase() === 'dbo' ? 'Все объекты' : 'Все каналы'}
            value={channelId}
            onChange={(val) => setChannelId(val)}
            onSearch={onSearchChannels}
            filterOption={false}
            style={{ width: 240 }}
            options={channels.map(c => ({ value: c.id, label: c.name }))}
          />
        </div>

        <div className="filter-item filter-item-grow">
          <label>Период:</label>
          <RangePicker
            size="large"
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
            value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0].toISOString(), dates[1].toISOString()]);
              }
            }}
            style={{ width: 465, borderRadius: 8, border: '1px solid var(--border-color)' }}
          />
        </div>

        <Popover
          content={advancedSettings}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          classNames={{ root: 'advanced-settings-overlay' }}
        >
          <button className="btn-advanced-settings" title="Дополнительные настройки">
            <img src={filterIcon} alt="" className="btn-icon-img" />
          </button>
        </Popover>
      </div>

      <div className="filter-actions-row">
        <button className="btn-start-analysis" onClick={onSearch}>
          <PieChartOutlined style={{ fontSize: 24 }} /> Запустить анализ
        </button>
        <button className="btn-export" title="Экспорт в Excel">
          <img src={exportIcon} alt="" className="btn-icon-img" /> Экспорт в Excel
        </button>
      </div>
    </div>
  );
};
