import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Typography, Button, message, Drawer, Table, Popconfirm, Space, Spin } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatUtcDateTime } from '../../utils/dateTimeUtils';
import { confirmHeavyAnalysis } from '../../utils/granularityWarning';
import { SpikeChart } from '../Chart/SpikeChart';
import { enrichSpikeData, getStatistics } from '../../utils/spikeUtils';
import { exportSpikesToExcel } from '../../utils/exportUtils';
import { genericAnalysisApi } from '../../api/explorerApi';
import { TablePreviewContent, type TablePreviewData } from './TablePreviewCard';
import { AnalysisJobProgress } from '../Dashboard/AnalysisJobProgress';
import { TelemetryControls } from '../TelemetryRedesign/TelemetryControls';
import { KpiRow } from '../TelemetryRedesign/KpiRow';
import { AnomalyDonut } from '../TelemetryRedesign/AnomalyDonut';
import { AnomalyList } from '../TelemetryRedesign/AnomalyList';
import type { TimeGranularity, SpikePoint } from '../../types/analytics.types';
import { useRegisterShellRailActions } from '../../context/ShellRailContext';
import { runAnalysisSessionJob, updateAnalysisSession, useAnalysisResultData } from '../../store/analysisSessionStore';

const { Text } = Typography;

const GRANULARITY_LABEL: Record<string, string> = {
  Minute: 'Поминутная',
  Hour: 'Почасовая',
  Day: 'Дневная',
  Week: 'Недельная',
  Month: 'Месячная',
  Custom: 'Свой интервал',
};

interface GenericAnalyzerProps {
  db: string;
  schema: string;
  table: string;
  timeColumn: string;
  onBack: () => void;
}

export const GenericAnalyzer: React.FC<GenericAnalyzerProps> = ({ db, schema, table, timeColumn }) => {
  const sessionKey = useMemo(
    () => `generic:${db}:${schema}:${table}:${timeColumn}`,
    [db, schema, table, timeColumn],
  );
  const jobApi = useMemo(() => ({
    getJobStatus: genericAnalysisApi.getJobStatus,
    getJobResult: genericAnalysisApi.getJobResult,
    getJobPartialResult: genericAnalysisApi.getJobPartialResult,
  }), []);
  const {
    loading,
    progress: analysisProgress,
    data,
    jobId,
    isPartialResult,
    error,
    applyPartialResult,
    applyFinalResult,
    setData,
  } = useAnalysisResultData(sessionKey, true, jobApi);

  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);
  const [pointDetails, setPointDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').startOf('day').toISOString(),
    dayjs().endOf('day').toISOString(),
  ]);
  const [granularity, setGranularity] = useState<TimeGranularity>('Hour');
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(95);
  const [windowSize, setWindowSize] = useState<number>(30);

  const [tablePreview, setTablePreview] = useState<TablePreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const preview = await genericAnalysisApi.getTablePreview(db, schema, table, timeColumn);
        if (!mounted) return;
        setTablePreview(preview);
      } catch (e) {
        console.error('Failed to fetch table preview', e);
        if (mounted) setTablePreview(null);
      } finally {
        if (mounted) setLoadingPreview(false);
      }
    };
    loadPreview();
    return () => { mounted = false; };
  }, [db, schema, table, timeColumn]);

  const fetchData = async () => {
    const confirmed = await confirmHeavyAnalysis(granularity, dateRange[0], dateRange[1], customMinutes);
    if (!confirmed) return;

    try {
      const requestData = {
        database: db,
        schema,
        table,
        timeColumn,
        startDate: dateRange[0],
        endDate: dateRange[1],
        granularity,
        customMinutes,
        confidence,
        windowSize,
      };

      message.loading({ content: 'Задача поставлена в очередь...', key: 'jobProgress' });

      const { jobId } = await genericAnalysisApi.enqueueAnalysis(requestData);

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

      const spikes = result.series.filter(s => s.isSpike);
      if (spikes.length > 0) {
        message.warning(`Обнаружено ${spikes.length} аномалий`);
      }
    } catch (e: any) {
      const errorText = e.response?.data?.message || e.response?.data || e.message || String(e);
      updateAnalysisSession(sessionKey, { loading: false, error: String(errorText) });
      message.error({ content: `Ошибка при запуске задачи: ${errorText}`, key: 'jobProgress', duration: 4 });
    }
  };

  const handleExport = async () => {
    if (!jobId) {
      message.warning('Нет результата анализа для экспорта.');
      return;
    }

    try {
      await exportSpikesToExcel(jobId);
      message.success('Данные экспортированы в Excel');
    } catch (e) {
      console.error('Export failed', e);
      message.error('Ошибка экспорта данных');
    }
  };

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const hist = await genericAnalysisApi.getHistory(db, schema, table);
      setHistoryList(hist);
    } catch {
      message.error('Ошибка загрузки истории');
    } finally {
      setLoadingHistory(false);
    }
  }, [db, schema, table]);

  useRegisterShellRailActions({ onOpenHistory: openHistory });

  const enrichedData = useMemo(() => (data?.series?.length ? enrichSpikeData(data.series) : []), [data]);
  const spikesOnly = useMemo(() => enrichedData.filter(s => s.isSpike), [enrichedData]);
  const stats = useMemo(() => (data?.series?.length ? getStatistics(data.series) : null), [data]);

  const handlePointSelect = async (timestamp: string) => {
    const point = enrichedData.find(s => s.timestamp === timestamp);
    if (!point) return;
    setSelectedPoint(point);
    setLoadingDetails(true);
    try {
      const details = await genericAnalysisApi.getPointDetails(
        db, schema, table, timeColumn, point.timestamp, granularity, customMinutes,
      );
      setPointDetails(details);
    } catch {
      message.error('Ошибка загрузки деталей');
      setPointDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadHistoryItem = async (job: any) => {
    if (job.status !== 'Completed') {
      message.warning('Анализ еще не завершен или завершился с ошибкой');
      return;
    }
    try {
      message.loading({ content: 'Загрузка результата...', key: 'loadResult' });
      const res = await genericAnalysisApi.getJobResult(job.id);
      updateAnalysisSession(sessionKey, {
        jobId: job.id,
        loading: false,
        progress: 100,
        error: null,
      });
      setData(res);
      setDateRange([job.startDate, job.endDate]);
      message.success({ content: 'Результат загружен', key: 'loadResult', duration: 2.5 });
      setHistoryOpen(false);
    } catch {
      message.error({ content: 'Ошибка загрузки', key: 'loadResult' });
    }
  };

  const deleteHistoryItem = async (jobId: string) => {
    try {
      await genericAnalysisApi.deleteHistoryItem(jobId);
      setHistoryList(prev => prev.filter(item => item.id !== jobId));
      message.success('Удалено');
    } catch {
      message.error('Ошибка удаления');
    }
  };

  const tableColumns = pointDetails.length > 0
    ? Object.keys(pointDetails[0]).map(key => ({
        title: key,
        dataIndex: key,
        key,
        render: (text: any) => {
          const isTimeColumn = key.toLowerCase() === timeColumn.toLowerCase();
          return isTimeColumn
            ? <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{String(text)}</span>
            : <span>{String(text)}</span>;
        },
      }))
    : [];

  const periodLabel = `${dayjs(dateRange[0]).format('D MMM HH:mm')} – ${dayjs(dateRange[1]).format('D MMM YYYY HH:mm')}`;
  const granularityLabel = GRANULARITY_LABEL[granularity] ?? granularity;

  return (
    <>
      <div className="header-row">
        <div>
          <div className="title">Анализ: {schema}.{table}</div>
          <div className="subtitle-row">
            <span className="subtitle">
              {periodLabel} · колонка {timeColumn} · {granularityLabel} детализация
            </span>
          </div>
        </div>

        <TelemetryControls
          activeTab="dbo"
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
          channelId={null}
          onChannelChange={() => {}}
          channels={[]}
          onSearchChannels={() => {}}
          filtersOpen={filtersOpen}
          onFiltersOpenChange={setFiltersOpen}
          onAnalyze={fetchData}
          loading={loading}
          onExport={handleExport}
          exportDisabled={!data?.series?.length}
          previewOpen={previewOpen}
          onPreviewToggle={() => setPreviewOpen(v => !v)}
        />
      </div>

      {previewOpen && (
        <div className="table-preview-panel">
          <TablePreviewContent
            preview={tablePreview}
            loading={loadingPreview}
            timeColumn={timeColumn}
            tableLabel={`${schema}.${table}`}
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

          {!loading && !isPartialResult && stats.spikesCount > 0 && (
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
          )}
        </>
      )}

      {!stats && !loading && (
        <div className="telemetry-empty">Нет данных для отображения. Настройте параметры и нажмите «Запустить анализ».</div>
      )}

      <Drawer
        title="Детализация точки"
        placement="right"
        size="large"
        onClose={() => setSelectedPoint(null)}
        open={selectedPoint !== null}
      >
        {selectedPoint && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Время среза:</Text><br />
              <Text strong>{dayjs(selectedPoint.timestamp).format('DD.MM.YYYY HH:mm:ss')}</Text>
            </div>
            {loadingDetails ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
                <Spin size="large" />
              </div>
            ) : (
              <Table
                dataSource={pointDetails}
                columns={tableColumns}
                rowKey={(_, idx) => `row-${idx}`}
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                size="small"
              />
            )}
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
          <Text type="secondary">Нет сохранённой истории для этой таблицы</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {historyList.map((job: any) => (
              <div
                key={job.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  padding: 12,
                  borderRadius: 8,
                  cursor: job.status === 'Completed' ? 'pointer' : 'default',
                  background: job.status === 'Completed' ? 'rgba(61,99,221,.06)' : 'transparent',
                }}
                onClick={() => loadHistoryItem(job)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{dayjs(job.startDate).format('DD.MM.YY')} - {dayjs(job.endDate).format('DD.MM.YY')}</Text><br />
                    <Text type="secondary">Гранулярность: {job.granularity}</Text><br />
                    <Text type={job.status === 'Completed' ? 'success' : job.status === 'Failed' ? 'danger' : 'warning'}>
                      {job.status} {job.status === 'Running' ? `(${job.progress}%)` : ''}
                    </Text><br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {(job.status === 'Completed' || job.status === 'Failed')
                        ? `Выполнен: ${formatUtcDateTime(job.completedAt ?? job.createdAt)}`
                        : `Запущен: ${formatUtcDateTime(job.createdAt)}`}
                    </Text>
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
