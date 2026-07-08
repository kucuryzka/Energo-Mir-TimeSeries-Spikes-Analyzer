import React, { useEffect, useRef } from 'react';
import { DatePicker, InputNumber, Select, Slider } from 'antd';
import dayjs from 'dayjs';
import type { ChannelDto, TimeGranularity } from '../../types/analytics.types';

const { RangePicker } = DatePicker;

const GRANULARITY_OPTIONS: { value: TimeGranularity; label: string }[] = [
  { value: 'Minute', label: 'Поминутно' },
  { value: 'Hour', label: 'Почасово' },
  { value: 'Day', label: 'Посуточно' },
  { value: 'Week', label: 'По неделям' },
  { value: 'Month', label: 'Помесячно' },
  { value: 'Custom', label: 'Свой интервал' },
];

const PERIOD_PRESETS: { label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }[] = [
  { label: 'Сегодня', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
  { label: 'Вчера', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
  { label: 'Последние 7 дней', value: [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Последние 30 дней', value: [dayjs().subtract(30, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Последние 90 дней', value: [dayjs().subtract(90, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Последние 120 дней', value: [dayjs().subtract(120, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Последние 365 дней', value: [dayjs().subtract(365, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Последние 2 года', value: [dayjs().subtract(2, 'year').startOf('day'), dayjs().endOf('day')] },
  { label: 'Последние 3 года', value: [dayjs().subtract(3, 'year').startOf('day'), dayjs().endOf('day')] },
];

export interface TelemetryControlsProps {
  activeTab: 'dbo' | 'em';
  granularity: TimeGranularity;
  onGranularityChange: (value: TimeGranularity) => void;
  customMinutes: number | null;
  onCustomMinutesChange: (value: number | null) => void;
  confidence: number;
  onConfidenceChange: (value: number) => void;
  windowSize: number;
  onWindowSizeChange: (value: number) => void;
  dateRange: [string, string];
  onDateRangeChange: (dates: [string, string]) => void;
  channelId: number | null;
  onChannelChange: (value: number | null) => void;
  channels: ChannelDto[];
  onSearchChannels: (search: string) => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  onAnalyze: () => void;
  loading: boolean;
  onExport: () => void;
  exportDisabled: boolean;
  previewOpen?: boolean;
  onPreviewToggle?: () => void;
  estimateHint?: string | null;
}

export const TelemetryControls: React.FC<TelemetryControlsProps> = ({
  activeTab,
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
  filtersOpen,
  onFiltersOpenChange,
  onAnalyze,
  loading,
  onExport,
  exportDisabled,
  previewOpen,
  onPreviewToggle,
  estimateHint,
}) => {
  const filtersRef = useRef<HTMLDivElement>(null);
  const entityLabel = activeTab === 'dbo' ? 'Объект' : 'Канал';
  const entityPlaceholder = activeTab === 'dbo' ? 'Все объекты' : 'Все каналы';

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        onFiltersOpenChange(false);
      }
    };
    if (filtersOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [filtersOpen, onFiltersOpenChange]);

  return (
    <div className="controls">
      <RangePicker
        className="period-picker"
        showTime={{ format: 'HH:mm' }}
        format="YYYY-MM-DD HH:mm"
        presets={PERIOD_PRESETS}
        value={[
          dateRange[0] ? dayjs(dateRange[0]) : null,
          dateRange[1] ? dayjs(dateRange[1]) : null,
        ]}
        onChange={(dates) => {
          if (dates?.[0] && dates[1]) {
            onDateRangeChange([dates[0].toISOString(), dates[1].toISOString()]);
          }
        }}
      />

      <div style={{ position: 'relative' }} ref={filtersRef}>
        <button type="button" className="filter-btn" onClick={() => onFiltersOpenChange(!filtersOpen)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
            <line x1="4" y1="14" x2="20" y2="14" /><circle cx="16" cy="14" r="2" fill="currentColor" stroke="none" />
            <line x1="4" y1="21" x2="20" y2="21" /><circle cx="11" cy="21" r="2" fill="currentColor" stroke="none" />
          </svg>
          Фильтры
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {filtersOpen && (
          <div className="filters-popover">
            <div className="filters-field">
              <label>Детализация</label>
              <Select
                value={granularity}
                onChange={onGranularityChange}
                options={GRANULARITY_OPTIONS}
                style={{ width: '100%' }}
              />
              {granularity === 'Custom' && (
                <InputNumber
                  min={1}
                  max={60}
                  value={customMinutes ?? undefined}
                  onChange={(v) => onCustomMinutesChange(v)}
                  placeholder="минут"
                  style={{ width: '100%', marginTop: 8 }}
                />
              )}
            </div>
            {channels.length > 0 && (
              <div className="filters-field">
                <label>{entityLabel}</label>
                <Select
                  allowClear
                  showSearch
                  placeholder={entityPlaceholder}
                  value={channelId}
                  onChange={onChannelChange}
                  onSearch={onSearchChannels}
                  filterOption={false}
                  style={{ width: '100%' }}
                  options={channels.map(c => ({ value: c.id, label: c.name }))}
                />
              </div>
            )}
            <div className="filters-field">
              <label>Чувствительность: {confidence}%</label>
              <Slider
                min={80}
                max={99}
                value={confidence}
                onChange={onConfidenceChange}
                tooltip={{ formatter: (v) => `${v}%` }}
              />
            </div>
            <div className="filters-field">
              <label>Глубина (точек)</label>
              <InputNumber
                min={10}
                max={100}
                value={windowSize}
                onChange={(v) => onWindowSizeChange(v ?? 30)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>

      <button type="button" className="btn-primary" onClick={onAnalyze} disabled={loading}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
        </svg>
        {loading ? 'Анализ…' : 'Запустить анализ'}
      </button>
      {estimateHint && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {estimateHint}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={onExport} disabled={exportDisabled}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" />
        </svg>
        Excel
      </button>
      {onPreviewToggle && (
        <button
          type="button"
          className={`btn-secondary${previewOpen ? ' active' : ''}`}
          onClick={onPreviewToggle}
          title="Предпросмотр таблицы"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 10h18" /><path d="M9 4v16" />
          </svg>
          Превью
        </button>
      )}
    </div>
  );
};
