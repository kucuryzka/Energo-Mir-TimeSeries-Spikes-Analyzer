import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { message, Drawer, Table, Tabs, Typography, Popconfirm, Button, Space, Spin } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { analyticsApi } from '../../api/analyticsApi';
import { enrichSpikeData, getStatistics } from '../../utils/spikeUtils';
import { exportSpikesToExcel } from '../../utils/exportUtils';
import { formatUtcDateTime } from '../../utils/dateTimeUtils';
import { confirmHeavyAnalysis } from '../../utils/granularityWarning';
import { useRegisterShellRailActions } from '../../context/ShellRailContext';
import { AnalysisJobProgress } from '../Dashboard/AnalysisJobProgress';
import { DistributionChart } from '../Chart/DistributionChart';
import { TelemetryControls } from './TelemetryControls';
import type { ChannelDto, TimeGranularity, SpikePoint, ChannelContributionDto, DataSourceDto, DistributionItemDto } from '../../types/analytics.types';
import { SpikeChart } from '../Chart/SpikeChart';
import { AnomalyDonut } from './AnomalyDonut';
import { AnomalyList } from './AnomalyList';
import { KpiRow } from './KpiRow';
import { loadEventCodeMap, resolveEventCodeLabel } from '../../utils/eventCodeMap';
import { TablePreviewContent, type TablePreviewData } from '../GenericAnalyzer/TablePreviewCard';
import { runAnalysisSessionJob, updateAnalysisSession, useAnalysisResultData } from '../../store/analysisSessionStore';

const { Text } = Typography;

export type TabKey = 'dbo' | 'em';

interface TelemetryContentProps {
  database: string;
  activeTab: TabKey;
  visible?: boolean;
}

const GRANULARITY_LABEL: Record<string, string> = {
  Minute: 'Поминутная',
  Hour: 'Почасовая',
  Day: 'Дневная',
  Week: 'Недельная',
  Month: 'Месячная',
  Custom: 'Свой интервал',
};

const TABLE_PREVIEW_CONFIG: Record<TabKey, { timeColumn: string; tableLabel: string }> = {
  dbo: { timeColumn: 'TIME_INSERT', tableLabel: 'dbo.METERINGS' },
  em: { timeColumn: 'InsertTime', tableLabel: 'em_protocol.Records' },
};

export const TelemetryContent: React.FC<TelemetryContentProps> = ({ database, activeTab, visible = true }) => {
  const [granularity, setGranularity] = useState<TimeGranularity>('Hour');
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [windowSize, setWindowSize] = useState<number>(30);
  const [confidence, setConfidence] = useState(95);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').startOf('day').toISOString(),
    dayjs().endOf('day').toISOString(),
  ]);
  const [showCritical, setShowCritical] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sessionKey = useMemo(() => `telemetry:${activeTab}:${database}`, [activeTab, database]);
  const jobApi = useMemo(() => (
    activeTab === 'dbo'
      ? {
          getJobStatus: analyticsApi.dbo.getJobStatus,
          getJobResult: analyticsApi.dbo.getJobResult,
          getJobPartialResult: analyticsApi.dbo.getJobPartialResult,
        }
      : {
          getJobStatus: analyticsApi.emProtocol.getJobStatus,
          getJobResult: analyticsApi.emProtocol.getJobResult,
          getJobPartialResult: analyticsApi.emProtocol.getJobPartialResult,
        }
  ), [activeTab]);
  const {
    loading,
    progress: analysisProgress,
    data,
    isPartialResult,
    error,
    applyPartialResult,
    applyFinalResult,
    setData,
  } = useAnalysisResultData(sessionKey, visible, jobApi);

  const [, setSources] = useState<DataSourceDto[]>([]);
  const sourcesRef = useRef<DataSourceDto[]>([]);
  const emSourceIdRef = useRef<string>('em_protocol');

  const [distributions, setDistributions] = useState<Record<string, DistributionItemDto[]>>({});
  const [eventCodeMap, setEventCodeMap] = useState<Record<string, string>>({});

  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);
  const [pointDetails, setPointDetails] = useState<any[]>([]);
  const [pointChannels, setPointChannels] = useState<ChannelContributionDto[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [tablePreview, setTablePreview] = useState<TablePreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
    let mounted = true;
    loadEventCodeMap()
      .then(map => { if (mounted) setEventCodeMap(map); })
      .catch(() => console.warn('event_codes.csv not found or failed to parse'));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setTablePreview(null);
    setPreviewOpen(false);
    setLoadingPreview(false);
  }, [database, activeTab, visible]);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const preview = activeTab === 'dbo'
        ? await analyticsApi.dbo.getTablePreview(database)
        : await analyticsApi.emProtocol.getTablePreview(database);
      setTablePreview(preview);
    } catch (e) {
      console.error('Failed to load table preview', e);
      setTablePreview(null);
      message.error('Не удалось загрузить превью таблицы');
    } finally {
      setLoadingPreview(false);
    }
  }, [database, activeTab]);

  const handlePreviewToggle = useCallback(async () => {
    if (!previewOpen && !tablePreview && !loadingPreview) {
      await loadPreview();
    }
    setPreviewOpen(v => !v);
  }, [previewOpen, tablePreview, loadingPreview, loadPreview]);

  useEffect(() => {
    if (!visible || !database) return;
    setChannelId(null);
    setChannels([]);
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
  }, [database, visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => fetchChannels(channelSearch), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSearch, visible]);

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
    const confirmed = await confirmHeavyAnalysis(
      granularity,
      dateRange[0],
      dateRange[1],
      granularity === 'Custom' ? customMinutes : null,
    );
    if (!confirmed) return;

    setDistributions({});

    try {
      const requestPayload = {
        database,
        sourceId: activeTab === 'dbo' ? 'Dbo' : emSourceIdRef.current,
        channelId,
        granularity,
        customMinutes: granularity === 'Custom' ? customMinutes : null,
        confidence,
        windowSize,
        startDate: dateRange[0],
        endDate: dateRange[1],
      };

      message.loading({ content: 'Задача поставлена в очередь...', key: 'jobProgress' });

      const api = activeTab === 'dbo' ? analyticsApi.dbo : analyticsApi.emProtocol;
      const { jobId } = await api.enqueueAnalysis(requestPayload);

      const result = await runAnalysisSessionJob(
        sessionKey,
        jobId,
        jobApi,
        {
          onProgress: (progress) => {
            message.loading({ content: `Анализ выполняется... (${progress}%)`, key: 'jobProgress' });
          },
          onPartialResult: applyPartialResult,
        },
      );

      applyFinalResult(result);

      message.success({ content: 'Анализ завершен!', key: 'jobProgress', duration: 2.5 });
      await fetchDistributions();

      const spikes = result.series.filter(s => s.isSpike);
      if (spikes.length > 0) {
        message.warning(`Обнаружено ${spikes.length} аномалий`);
      }
    } catch (err: any) {
      const errorText = err?.response?.data?.message || err?.message || String(err);
      updateAnalysisSession(sessionKey, { loading: false, error: `Ошибка при загрузке данных: ${errorText}` });
      message.error({ content: 'Сбой при запуске задачи', key: 'jobProgress', duration: 4 });
    }
  };

  useEffect(() => {
    if (!selectedPoint) {
      setPointDetails([]);
      setPointChannels([]);
      return;
    }
    setLoadingDetails(true);
    const tasks: Promise<any>[] = activeTab === 'dbo'
      ? [
          analyticsApi.dbo.getPointDetails(database, selectedPoint.timestamp, granularity, granularity === 'Custom' ? customMinutes ?? undefined : undefined, channelId ?? undefined),
          analyticsApi.dbo.getPointChannels(database, selectedPoint.timestamp, granularity, granularity === 'Custom' ? customMinutes ?? undefined : undefined, channelId ?? undefined),
        ]
      : [
          Promise.resolve([]),
          analyticsApi.emProtocol.getPointChannels(database, selectedPoint.timestamp, granularity, granularity === 'Custom' ? customMinutes ?? undefined : undefined, channelId ?? undefined),
        ];

    Promise.all(tasks).then(([details, breakdown]) => {
      setPointDetails(details);
      const meta = new Map(channels.map(c => [c.id, c]));
      const fallbackLabel = activeTab === 'dbo' ? 'Объект' : 'Канал';
      setPointChannels((breakdown as ChannelContributionDto[]).map(c => {
        const fromList = meta.get(c.channelId)?.name;
        const nameLooksLikeId = c.channelName && /^\d+$/.test(c.channelName.trim());
        return {
          ...c,
          channelName: (nameLooksLikeId ? fromList : c.channelName) || fromList || `${fallbackLabel} ${c.channelId}`,
          eventCode: c.eventCode ?? meta.get(c.channelId)?.eventCode,
        };
      }));
    }).catch(err => {
      console.error(err);
    }).finally(() => setLoadingDetails(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoint, granularity, channelId, database, activeTab, channels]);

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

  useRegisterShellRailActions({ onOpenHistory: openHistory }, visible);

  const loadHistoryItem = async (job: any) => {
    try {
      message.loading({ content: 'Загрузка результата...', key: 'loadResult' });
      const api = activeTab === 'dbo' ? analyticsApi.dbo : analyticsApi.emProtocol;
      const result = await api.getJobResult(job.id);
      updateAnalysisSession(sessionKey, {
        jobId: job.id,
        loading: false,
        progress: 100,
        error: null,
      });
      setData(result);
      setDateRange([job.startDate, job.endDate]);
      setChannelId(job.channelId ? parseInt(job.channelId, 10) : null);
      setGranularity(job.granularity);
      message.success({ content: 'Результат загружен', key: 'loadResult', duration: 2.5 });
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
  const stats = useMemo(() => (data ? getStatistics(data.series) : null), [data]);

  const objectDistribution = useMemo(() => {
    if (!data?.distribution?.length) return [];
    return data.distribution.map(item => ({
      category: item.channelName || `Объект ${item.channelId}`,
      count: item.count,
    }));
  }, [data]);

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

  const entityLabel = activeTab === 'dbo'
    ? (channelId ? channels.find(c => c.id === channelId)?.name ?? 'Объект' : 'Все объекты')
    : (channelId ? channels.find(c => c.id === channelId)?.name ?? 'Канал' : 'Все каналы');
  const periodLabel = `${dayjs(dateRange[0]).format('D MMM HH:mm')} – ${dayjs(dateRange[1]).format('D MMM YYYY HH:mm')}`;
  const granularityLabel = GRANULARITY_LABEL[granularity] ?? granularity;
  const previewConfig = TABLE_PREVIEW_CONFIG[activeTab];

  return (
    <>
      <div className="header-row">
        <div>
          <div className="title">Телеметрия {activeTab === 'dbo' ? 'DBO' : 'EM Protocol'}</div>
          <div className="subtitle-row">
            <span className="subtitle">
              {periodLabel} · {entityLabel} · {granularityLabel} детализация
            </span>
          </div>
        </div>

        <TelemetryControls
          activeTab={activeTab}
          granularity={granularity}
          onGranularityChange={setGranularity}
          customMinutes={customMinutes}
          onCustomMinutesChange={setCustomMinutes}
          confidence={confidence}
          onConfidenceChange={setConfidence}
          windowSize={windowSize}
          onWindowSizeChange={setWindowSize}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          channelId={channelId}
          onChannelChange={setChannelId}
          channels={channels}
          onSearchChannels={setChannelSearch}
          filtersOpen={filtersOpen}
          onFiltersOpenChange={setFiltersOpen}
          onAnalyze={fetchData}
          loading={loading}
          onExport={handleExport}
          exportDisabled={!data?.series?.length}
          previewOpen={previewOpen}
          onPreviewToggle={handlePreviewToggle}
        />
      </div>

      {previewOpen && (
        <div className="table-preview-panel">
          <TablePreviewContent
            preview={tablePreview}
            loading={loadingPreview}
            timeColumn={previewConfig.timeColumn}
            tableLabel={previewConfig.tableLabel}
            onUseAsPeriodStart={(iso) => setDateRange(([_, end]) => [iso, end])}
            onUseAsPeriodEnd={(iso) => setDateRange(([start]) => [start, iso])}
          />
        </div>
      )}

      {error && <div className="telemetry-error">{error}</div>}

      <div className="telemetry-progress">
        <AnalysisJobProgress
          loading={loading}
          progress={analysisProgress}
          isPartialResult={isPartialResult}
        />
      </div>

      {stats && (
        <>
          <KpiRow
            totalCalls={stats.totalCalls}
            totalPoints={stats.totalPoints}
            spikesCount={isPartialResult ? 0 : stats.spikesCount}
            criticalCount={isPartialResult ? 0 : stats.criticalSpikes}
            average={stats.average}
            max={stats.max}
            averageDecimals={activeTab === 'em' ? 2 : 0}
            maxDecimals={activeTab === 'em' ? 2 : 0}
            animate={!isPartialResult}
          />

          <div className={`chart-card telemetry-spike-chart${isPartialResult ? ' chart-card--partial' : ''}`}>
            <div className="chart-header">
              <div className="chart-title-row">
                <div className="chart-title">Обзор показателей</div>
                {isPartialResult && <span className="chart-partial-badge">Загрузка…</span>}
              </div>
              <div className="chart-controls">
                <button type="button" className={`legend-chip crit ${!showCritical ? 'off' : ''}`} onClick={() => setShowCritical(v => !v)}>
                  <span className="dot7" style={{ background: '#d64933' }} />Критическая
                </button>
                <button type="button" className={`legend-chip warn ${!showWarning ? 'off' : ''}`} onClick={() => setShowWarning(v => !v)}>
                  <span className="dot7" style={{ background: '#e2a339' }} />Предупреждение
                </button>
                <span className="line-legend">
                  <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#7A8B9E' }} />Среднее</span>
                  <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#C97A6E' }} />Максимум</span>
                  <span className="line-legend-item"><span className="line-swatch" style={{ borderTopColor: '#5A9E7A' }} />Минимум</span>
                </span>
                <button
                  type="button"
                  className="switch-track"
                  style={{ background: showMarkers ? '#3D63DD' : 'var(--switch-off)' }}
                  onClick={() => setShowMarkers(v => !v)}
                  title="Маркеры"
                >
                  <span className="switch-knob" style={{ transform: showMarkers ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
              </div>
            </div>
            <SpikeChart
              data={enrichedData}
              showMarkers={showMarkers && !isPartialResult}
              showCriticalMarkers={showCritical}
              showWarningMarkers={showWarning}
              hideToolbar
              onPointClick={(point) => handlePointSelect(point.timestamp)}
            />
          </div>

          {!loading && !isPartialResult && (
            <>
              <div className="bottom-row">
                <AnomalyDonut critical={stats.criticalSpikes} warning={Math.max(0, stats.spikesCount - stats.criticalSpikes)} />
                <AnomalyList
                  spikes={spikesOnly}
                  showCritical={showCritical}
                  showWarning={showWarning}
                  hoveredId={hoveredId}
                  onHoverChange={setHoveredId}
                  onRowClick={handlePointSelect}
                />
              </div>

              {activeTab === 'dbo' && objectDistribution.length > 0 && (
                <div className="distributions-section">
                  <div className="chart-title" style={{ marginBottom: 4 }}>Распределение</div>
                  <div className="distribution-card">
                    <DistributionChart data={objectDistribution} title="Распределение по объектам" />
                  </div>
                </div>
              )}

              {Object.keys(distributions).length > 0 && (
                <div className="distributions-section">
                  <div className="chart-title" style={{ marginBottom: 4 }}>Распределение</div>
                  {Object.entries(distributions).map(([category, items]) => {
                    const chartData = category === 'EventCode'
                      ? items.map(d => ({ ...d, category: resolveEventCodeLabel(d.category, eventCodeMap) }))
                      : items;
                    return (
                      <div key={category} className="distribution-card">
                        <DistributionChart data={chartData} title={`По категории: ${category}`} />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
                          const label = resolveEventCodeLabel(curr.eventCode, eventCodeMap);
                          acc[label] = (acc[label] || 0) + curr.count;
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
                  border: '1px solid var(--border-subtle)', padding: 12, borderRadius: 8,
                  cursor: job.status === 'Completed' ? 'pointer' : 'default',
                  background: job.status === 'Completed' ? 'rgba(61,99,221,.06)' : 'transparent',
                }}
                onClick={() => job.status === 'Completed' && loadHistoryItem(job)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{dayjs(job.startDate).format('DD.MM.YY')} - {dayjs(job.endDate).format('DD.MM.YY')}</Text><br />
                    <Text type="secondary">{activeTab === 'dbo' ? 'Объект' : 'Канал'}: {job.channelId || 'Все'}</Text><br />
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
