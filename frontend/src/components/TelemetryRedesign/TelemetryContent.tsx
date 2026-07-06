import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Select, DatePicker, message, Drawer, Table, Tabs, Typography, Popconfirm, Button, Space, Spin } from 'antd';
import { DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import { analyticsApi } from '../../api/analyticsApi';
import { enrichSpikeData } from '../../utils/spikeUtils';
import { exportSpikesToExcel } from '../../utils/exportUtils';
import { formatUtcDateTime } from '../../utils/dateTimeUtils';
import { useRegisterShellRailActions } from '../../context/ShellRailContext';
import { DistributionChart } from '../Chart/DistributionChart';
import type { ChannelDto, SpikeResponse, TimeGranularity, SpikePoint, ChannelContributionDto, DataSourceDto, DistributionItemDto } from '../../types/analytics.types';
import { TelemetryChart } from './TelemetryChart';
import { AnomalyDonut } from './AnomalyDonut';
import { AnomalyList } from './AnomalyList';
import { KpiRow } from './KpiRow';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

export type TabKey = 'dbo' | 'em';

interface TelemetryContentProps {
  database: string;
  activeTab: TabKey;
  onActiveTabChange: (tab: TabKey) => void;
}

const GRANULARITY_LABEL: Record<'Hour' | 'Day' | 'Week', string> = {
  Hour: 'Почасовая',
  Day: 'Дневная',
  Week: 'Недельная',
};

export const TelemetryContent: React.FC<TelemetryContentProps> = ({ database, activeTab, onActiveTabChange }) => {
  const [granularity, setGranularity] = useState<'Hour' | 'Day' | 'Week'>('Hour');
  const [channelId, setChannelId] = useState<number | null>(null);
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').startOf('day').toISOString(),
    dayjs().endOf('day').toISOString(),
  ]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showCritical, setShowCritical] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, 100]);

  const [data, setData] = useState<SpikeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<DataSourceDto[]>([]);
  const sourcesRef = useRef<DataSourceDto[]>([]);
  const emSourceIdRef = useRef<string>('em_protocol');

  const [distributions, setDistributions] = useState<Record<string, DistributionItemDto[]>>({});

  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);
  const [pointDetails, setPointDetails] = useState<any[]>([]);
  const [pointChannels, setPointChannels] = useState<ChannelContributionDto[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    if (filtersOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [filtersOpen]);

  const fetchChannels = async (search: string = '') => {
    try {
      const list = activeTab === 'dbo'
        ? await analyticsApi.dbo.getObjects(database, search)
        : await analyticsApi.emProtocol.getChannels(database, search);
      setChannels(list);
    } catch (e) {
      console.error('Failed to load channels', e);
    }
  };

  useEffect(() => {
    setChannelId(null);
    setChannels([]);
    setData(null);
    setDistributions({});
    fetchChannels();

    if (activeTab === 'em') {
      analyticsApi.getSources().then(list => {
        setSources(list);
        sourcesRef.current = list;
        if (list.length > 0) emSourceIdRef.current = list[0].id;
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, database]);

  useEffect(() => {
    const timer = setTimeout(() => fetchChannels(channelSearch), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSearch]);

  const fetchDistributions = async () => {
    if (activeTab !== 'em') return;
    let currentSource = sourcesRef.current.find(s => s.id === emSourceIdRef.current);
    if (!currentSource) {
      // sources not loaded yet (race with tab switch) — fetch fresh
      const list = await analyticsApi.getSources().catch(() => []);
      sourcesRef.current = list;
      setSources(list);
      if (list.length > 0) emSourceIdRef.current = list[0].id;
      currentSource = list.find(s => s.id === emSourceIdRef.current);
    }
    const cats = currentSource?.supportedDistributions;
    if (!cats || cats.length === 0) { setDistributions({}); return; }
    try {
      const newDists: Record<string, DistributionItemDto[]> = {};
      for (const category of cats) {
        newDists[category] = await analyticsApi.emProtocol.getDistribution(database, dateRange[0], dateRange[1], category);
      }
      setDistributions(newDists);
    } catch (e) {
      console.error('Ошибка при загрузке распределений', e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setZoomRange([0, 100]);

    try {
      const requestPayload = {
        database,
        sourceId: activeTab === 'dbo' ? 'Dbo' : emSourceIdRef.current,
        channelId,
        granularity: granularity as TimeGranularity,
        customMinutes: null,
        confidence: 95,
        windowSize: 30,
        startDate: dateRange[0],
        endDate: dateRange[1],
      };

      const api = activeTab === 'dbo' ? analyticsApi.dbo : analyticsApi.emProtocol;
      const result = await api.runAnalysis(
        requestPayload,
        () => {},
        (partial) => setData(partial),
      );
      setData(result);
      await fetchDistributions();
    } catch (err: any) {
      const errorText = err?.response?.data?.message || err?.message || String(err);
      setError(`Ошибка при загрузке данных: ${errorText}`);
      message.error('Сбой при запуске анализа');
    } finally {
      setLoading(false);
    }
  };

  const fetchedOnceRef = useRef<string>('');
  useEffect(() => {
    const key = `${activeTab}:${database}`;
    if (!database) return;
    if (fetchedOnceRef.current === key) return;
    fetchedOnceRef.current = key;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, database]);

  useEffect(() => {
    if (!selectedPoint) {
      setPointDetails([]);
      setPointChannels([]);
      return;
    }
    setLoadingDetails(true);
    const tasks: Promise<any>[] = activeTab === 'dbo'
      ? [
          analyticsApi.dbo.getPointDetails(database, selectedPoint.timestamp, granularity, undefined, channelId ?? undefined),
          analyticsApi.dbo.getPointChannels(database, selectedPoint.timestamp, granularity, undefined, channelId ?? undefined),
        ]
      : [
          Promise.resolve([]),
          analyticsApi.emProtocol.getPointChannels(database, selectedPoint.timestamp, granularity, undefined, channelId ?? undefined),
        ];

    Promise.all(tasks).then(([details, breakdown]) => {
      setPointDetails(details);
      const nameById = new Map(channels.map(c => [c.id, c.name]));
      setPointChannels((breakdown as ChannelContributionDto[]).map(c => ({
        ...c,
        channelName: c.channelName || nameById.get(c.channelId) || `Объект ${c.channelId}`,
      })));
    }).catch(err => {
      console.error(err);
    }).finally(() => setLoadingDetails(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoint, granularity, channelId, database, activeTab]);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const api = activeTab === 'dbo' ? analyticsApi.dbo : analyticsApi.emProtocol;
      const hist = await api.getHistory(database);
      setHistoryList(hist);
    } catch {
      message.error('Ошибка загрузки истории');
    } finally {
      setLoadingHistory(false);
    }
  }, [activeTab, database]);

  useRegisterShellRailActions({ onOpenHistory: openHistory });

  const loadHistoryItem = async (job: any) => {
    try {
      message.loading({ content: 'Загрузка результата...', key: 'loadResult' });
      const api = activeTab === 'dbo' ? analyticsApi.dbo : analyticsApi.emProtocol;
      const result = await api.getJobResult(job.id);
      setData(result);
      setDateRange([job.startDate, job.endDate]);
      setChannelId(job.channelId ? parseInt(job.channelId, 10) : null);
      setGranularity(job.granularity);
      message.success({ content: 'Результат загружен', key: 'loadResult' });
      setHistoryOpen(false);
    } catch {
      message.error({ content: 'Ошибка загрузки', key: 'loadResult' });
    }
  };

  const deleteHistoryItem = async (jobId: string) => {
    try {
      const api = activeTab === 'dbo' ? analyticsApi.dbo : analyticsApi.emProtocol;
      await api.deleteHistoryItem(jobId);
      setHistoryList(prev => prev.filter(item => item.id !== jobId));
      message.success('Удалено');
    } catch {
      message.error('Ошибка удаления');
    }
  };

  const enrichedData = useMemo(() => (data ? enrichSpikeData(data.series) : []), [data]);
  const spikesOnly = useMemo(() => enrichedData.filter(s => s.isSpike), [enrichedData]);
  const criticalCount = spikesOnly.filter(s => s.severity === 'critical').length;
  const warningCount = spikesOnly.length - criticalCount;

  const stats = useMemo(() => {
    if (!data || data.series.length === 0) return null;
    const values = data.series.map(s => s.value);
    return {
      totalPoints: data.series.length,
      average: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      spikesCount: spikesOnly.length,
    };
  }, [data, spikesOnly]);

  const handleExport = () => {
    if (!data?.series?.length) {
      message.warning('Нет данных для экспорта. Сначала выполните анализ.');
      return;
    }
    exportSpikesToExcel(data);
    message.success('Данные экспортированы в Excel');
  };

  const handlePointSelect = (timestamp: string) => {
    const point = enrichedData.find(s => s.timestamp === timestamp);
    if (point) setSelectedPoint(point);
  };

  const objectLabel = channelId ? channels.find(c => c.id === channelId)?.name ?? 'Объект' : 'Все объекты';
  const periodLabel = `${dayjs(dateRange[0]).format('D MMM')} – ${dayjs(dateRange[1]).format('D MMM YYYY')}`;

  return (
    <>
      <div className="header-row">
        <div>
          <div className="title">Телеметрия {activeTab === 'dbo' ? 'DBO' : 'EM Protocol'}</div>
          <div className="subtitle-row">
            <span className="subtitle">
              {periodLabel} · {objectLabel} · {GRANULARITY_LABEL[granularity]} детализация
            </span>
          </div>
        </div>

        <div className="controls">
          <div className="tab-pill">
            <button type="button" className={`tab-btn ${activeTab === 'dbo' ? 'active' : ''}`} onClick={() => onActiveTabChange('dbo')}>DBO</button>
            <button type="button" className={`tab-btn ${activeTab === 'em' ? 'active' : ''}`} onClick={() => onActiveTabChange('em')}>EM Protocol</button>
          </div>

          <div style={{ position: 'relative' }} ref={filtersRef}>
            <button type="button" className="filter-btn" onClick={() => setFiltersOpen(v => !v)}>
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
                    onChange={setGranularity}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'Hour', label: 'Почасово' },
                      { value: 'Day', label: 'День' },
                      { value: 'Week', label: 'Неделя' },
                    ]}
                  />
                </div>
                <div className="filters-field">
                  <label>Объект</label>
                  <Select
                    allowClear
                    showSearch
                    placeholder="Все объекты"
                    value={channelId}
                    onChange={setChannelId}
                    onSearch={setChannelSearch}
                    filterOption={false}
                    style={{ width: '100%' }}
                    options={channels.map(c => ({ value: c.id, label: c.name }))}
                  />
                </div>
                <div className="filters-field">
                  <label>Период</label>
                  <RangePicker
                    style={{ width: '100%' }}
                    value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                    onChange={(dates) => {
                      if (dates && dates[0] && dates[1]) {
                        setDateRange([dates[0].toISOString(), dates[1].toISOString()]);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <button type="button" className="filter-btn" onClick={openHistory} title="История анализов">
            <HistoryOutlined />
            История
          </button>

          <button type="button" className="btn-primary" onClick={fetchData} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" /></svg>
            {loading ? 'Анализ…' : 'Запустить анализ'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleExport} disabled={!data?.series?.length}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></svg>
            Excel
          </button>
        </div>
      </div>

      {error && <div className="telemetry-error">{error}</div>}

      {stats && (
        <>
          <KpiRow
            totalPoints={stats.totalPoints}
            spikesCount={stats.spikesCount}
            criticalCount={criticalCount}
            average={stats.average}
            max={stats.max}
          />

          <TelemetryChart
            series={enrichedData}
            granularity={granularity}
            onGranularityChange={setGranularity}
            showCritical={showCritical}
            showWarning={showWarning}
            onToggleCritical={() => setShowCritical(v => !v)}
            onToggleWarning={() => setShowWarning(v => !v)}
            showMarkers={showMarkers}
            onToggleMarkers={() => setShowMarkers(v => !v)}
            hoveredId={hoveredId}
            onHoverChange={setHoveredId}
            zoomRange={zoomRange}
            onZoomChange={setZoomRange}
            onMarkerClick={handlePointSelect}
          />

          <div className="bottom-row">
            <AnomalyDonut critical={criticalCount} warning={warningCount} />
            <AnomalyList
              spikes={spikesOnly}
              showCritical={showCritical}
              showWarning={showWarning}
              hoveredId={hoveredId}
              onHoverChange={setHoveredId}
              onRowClick={handlePointSelect}
            />
          </div>

          {Object.keys(distributions).length > 0 && (
            <div className="distributions-section">
              <div className="chart-title" style={{ marginBottom: 4 }}>Распределение</div>
              {Object.entries(distributions).map(([category, items]) => (
                <div key={category} className="distribution-card">
                  <DistributionChart data={items} title={`По категории: ${category}`} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!stats && !loading && !error && (
        <div className="telemetry-empty">Нет данных для отображения. Настройте параметры и нажмите «Запустить анализ».</div>
      )}

      <Drawer
        title="Детализация точки"
        placement="right"
        size="large"
        onClose={() => setSelectedPoint(null)}
        open={!!selectedPoint}
      >
        {selectedPoint && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">Время начала среза:</Text><br />
                <Text strong>{dayjs(selectedPoint.timestamp).format('DD.MM.YYYY HH:mm:ss')}</Text>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">Общее число событий:</Text><br />
                <Text strong>{selectedPoint.value.toLocaleString('ru-RU')}</Text>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">Статус:</Text><br />
                {selectedPoint.isSpike ? (
                  <Text type="danger" strong>Аномалия (p-value: {selectedPoint.pValue.toFixed(4)})</Text>
                ) : (
                  <Text type="success" strong>Штатный режим</Text>
                )}
              </div>
            </div>

            <Tabs
              defaultActiveKey="sources"
              items={[
                {
                  key: 'sources',
                  label: 'Источники',
                  children: (
                    <Table
                      dataSource={Object.entries(
                        pointChannels.reduce((acc, curr) => {
                          const source = curr.channelName;
                          acc[source] = (acc[source] || 0) + curr.count;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([name, count]) => ({ name, count }))}
                      rowKey="name"
                      size="small"
                      loading={loadingDetails}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                      columns={[
                        { title: 'Источник', dataIndex: 'name', key: 'name' },
                        {
                          title: 'Кол-во', dataIndex: 'count', key: 'count',
                          render: (val: number) => val.toLocaleString('ru-RU'),
                          sorter: (a: any, b: any) => a.count - b.count,
                          defaultSortOrder: 'descend',
                        },
                      ]}
                    />
                  ),
                },
                ...(activeTab === 'dbo' ? [{
                  key: 'info',
                  label: 'Инфо',
                  children: (
                    <Table
                      dataSource={pointDetails}
                      rowKey={(record: any, index?: number) => `${record.idObject}-${index}`}
                      size="small"
                      loading={loadingDetails}
                      pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
                      scroll={{ x: 'max-content' }}
                      columns={[
                        { title: 'IDOBJECT', dataIndex: 'idObject', key: 'idObject' },
                        { title: 'Объект', dataIndex: 'objectName', key: 'objectName' },
                        { title: 'QUALITY', dataIndex: 'quality', key: 'quality' },
                        { title: 'SOURCE', dataIndex: 'source', key: 'source' },
                        { title: 'VALUE_METERING', dataIndex: 'valueMetering', key: 'valueMetering' },
                      ]}
                    />
                  ),
                }] : [{
                  key: 'events',
                  label: 'Коды событий',
                  children: (
                    <Table
                      dataSource={Object.entries(
                        pointChannels.reduce((acc, curr) => {
                          const code = curr.eventCode ? String(curr.eventCode) : 'Неизвестный код';
                          acc[code] = (acc[code] || 0) + curr.count;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([code, count]) => ({ code, count }))}
                      rowKey="code"
                      size="small"
                      loading={loadingDetails}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                      columns={[
                        { title: 'Код', dataIndex: 'code', key: 'code' },
                        {
                          title: 'Кол-во', dataIndex: 'count', key: 'count',
                          render: (val: number) => val.toLocaleString('ru-RU'),
                          sorter: (a: any, b: any) => a.count - b.count,
                          defaultSortOrder: 'descend',
                        },
                      ]}
                    />
                  ),
                }]),
              ]}
            />
          </div>
        )}
      </Drawer>

      <Drawer
        title="История анализов (Фоновые задачи)"
        placement="right"
        size="default"
        onClose={() => setHistoryOpen(false)}
        open={historyOpen}
      >
        {loadingHistory ? (
          <Spin />
        ) : historyList.length === 0 ? (
          <Text type="secondary">Нет сохранённой истории</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {historyList.map((job: any) => (
              <div
                key={job.id}
                style={{
                  border: '1px solid #f0f0f0', padding: 12, borderRadius: 8,
                  cursor: job.status === 'Completed' ? 'pointer' : 'default',
                  background: job.status === 'Completed' ? '#fafafa' : '#fff',
                }}
                onClick={() => job.status === 'Completed' && loadHistoryItem(job)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{dayjs(job.startDate).format('DD.MM.YY')} - {dayjs(job.endDate).format('DD.MM.YY')}</Text><br />
                    <Text type="secondary">Канал: {job.channelId || 'Все'}</Text><br />
                    <Text type="secondary">
                      {(job.status === 'Completed' || job.status === 'Failed')
                        ? `Выполнен: ${formatUtcDateTime(job.completedAt ?? job.createdAt)}`
                        : `Запущен: ${formatUtcDateTime(job.createdAt)}`}
                    </Text><br />
                    <Text type={job.status === 'Completed' ? 'success' : 'warning'}>{job.status}</Text>
                  </div>
                  <Popconfirm
                    title="Удалить этот результат?"
                    onConfirm={(e) => { e?.stopPropagation(); deleteHistoryItem(job.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="Да"
                    cancelText="Нет"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </Space>
        )}
      </Drawer>
    </>
  );
};
