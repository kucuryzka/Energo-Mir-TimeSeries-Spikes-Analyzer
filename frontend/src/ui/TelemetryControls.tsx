import React, { useEffect, useRef, useState } from 'react';
import { DatePicker, InputNumber, Select, Slider } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ChannelDto, TimeGranularity } from '../types/analytics.types';

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

function toPickerValue(range: [string, string]): [Dayjs | null, Dayjs | null] {
  return [
    range[0] ? dayjs(range[0]) : null,
    range[1] ? dayjs(range[1]) : null,
  ];
}

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
  /** Optional period is the picker value at click time (avoids stale parent state). */
  onAnalyze: (period?: [string, string]) => void;
  loading: boolean;
  onExport: (options?: { loadDistribution?: boolean }) => void;
  exportDisabled: boolean;
  exportLoading?: boolean;
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
  exportLoading = false,
  previewOpen,
  onPreviewToggle,
  estimateHint,
}) => {
  const filtersRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const isEditingPeriodRef = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<[Dayjs | null, Dayjs | null]>(
    () => toPickerValue(dateRange),
  );
  const entityLabel = activeTab === 'dbo' ? 'Объект' : 'Канал';
  const entityPlaceholder = activeTab === 'dbo' ? 'Все объекты' : 'Все каналы';

  // Sync from parent only when the user is not interacting with the picker.
  // Parent re-renders during analysis must not overwrite an in-progress selection.
  useEffect(() => {
    if (isEditingPeriodRef.current) return;
    setPickerValue(toPickerValue(dateRange));
  }, [dateRange[0], dateRange[1]]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        onFiltersOpenChange(false);
      }
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    if (filtersOpen || exportOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [filtersOpen, exportOpen, onFiltersOpenChange]);

  const runExport = (loadDistribution: boolean) => {
    setExportOpen(false);
    onExport({ loadDistribution });
  };

  return (
    <div className="controls">
      <RangePicker
        className="period-picker"
        showTime={{ format: 'HH:mm' }}
        format="YYYY-MM-DD HH:mm"
        presets={PERIOD_PRESETS}
        value={pickerValue}
        onOpenChange={(open) => {
          isEditingPeriodRef.current = open;
        }}
        onCalendarChange={(dates) => {
          isEditingPeriodRef.current = true;
          setPickerValue(dates as [Dayjs | null, Dayjs | null]);
        }}
        onChange={(dates) => {
          if (!dates?.[0] || !dates[1]) return;
          setPickerValue([dates[0], dates[1]]);
          isEditingPeriodRef.current = false;
          onDateRangeChange([dates[0].toISOString(), dates[1].toISOString()]);
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

      <button
        type="button"
        className="btn-primary"
        disabled={loading}
        onClick={() => {
          if (pickerValue[0] && pickerValue[1]) {
            const period: [string, string] = [
              pickerValue[0].toISOString(),
              pickerValue[1].toISOString(),
            ];
            isEditingPeriodRef.current = false;
            onDateRangeChange(period);
            onAnalyze(period);
            return;
          }
          onAnalyze();
        }}
      >
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
      <div className="export-menu-wrap" ref={exportRef}>
        <button
          type="button"
          className={`btn-secondary btn-secondary--sm${exportOpen ? ' active' : ''}`}
          disabled={exportDisabled || exportLoading}
          onClick={() => setExportOpen((open) => !open)}
          aria-expanded={exportOpen}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" />
          </svg>
          {exportLoading ? 'Excel…' : 'Excel'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {exportOpen && (
          <div className="export-popover" role="menu">
            <button
              type="button"
              className="export-option"
              role="menuitem"
              disabled={exportLoading}
              onClick={() => runExport(false)}
            >
              <div>
                <div className="export-option-title">Скачать Excel</div>
                <div className="export-option-desc">Данные из результата анализа</div>
              </div>
            </button>
            <button
              type="button"
              className="export-option"
              role="menuitem"
              disabled={exportLoading}
              onClick={() => runExport(true)}
            >
              <div>
                <div className="export-option-title">С распределением из БД</div>
                <div className="export-option-desc">Доп. лист с актуальным распределением</div>
              </div>
            </button>
          </div>
        )}
      </div>
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
