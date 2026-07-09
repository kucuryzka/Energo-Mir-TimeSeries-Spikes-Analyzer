import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Typography, Button, message, Drawer, Table, Popconfirm, Space, Spin } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatUtcDateTime } from '../../utils/dateTimeUtils';
import { confirmHeavyAnalysis } from '../../utils/granularityWarning';
import { SpikeOverviewChart } from '../../ui/charts/SpikeOverviewChart';
import { enrichSpikeData, getStatistics } from '../../utils/spikeUtils';
import { genericAnalysisApi } from '../../api/explorerApi';
import { TablePreviewContent } from '../../ui/TablePreviewCard';
import { AnalysisJobProgress } from '../../ui/AnalysisJobProgress';
import { TelemetryControls } from '../../ui/TelemetryControls';
import { KpiRow } from '../../ui/KpiRow';
import { AnomalyDonut } from '../../ui/AnomalyDonut';
import { AnomalyList } from '../../ui/AnomalyList';
import type { TimeGranularity, SpikePoint } from '../../types/analytics.types';
import { runAnalysisSessionJob, updateAnalysisSession, useAnalysisResultData } from '../../store/analysisSessionStore';
import { AnalysisJobCancelledError } from '../../utils/jobPolling';
import { loadAnalysisJobResult, type PendingAnalysisJobOpen } from '../../utils/analysisJobLoader';
import { GRANULARITY_LABEL } from '../../utils/granularityLabels';
import { useAnalysisJobActions } from '../../hooks/useAnalysisJobActions';
import { useDurationEstimate } from '../../hooks/useDurationEstimate';
import { useTablePreview } from '../../hooks/useTablePreview';
import { useAnalysisHistory } from '../../hooks/useAnalysisHistory';

const { Text } = Typography;

interface GenericAnalyzerProps {
  db: string;
  schema: string;
  table: string;
  timeColumn: string;
  onBack: () => void;
  visible?: boolean;
  pendingJobOpen?: PendingAnalysisJobOpen | null;
  onPendingJobConsumed?: () => void;
}

export const GenericAnalyzer: React.FC<GenericAnalyzerProps> = ({
  db,
  schema,
  table,
  timeColumn,
  onBack: _onBack,
  visible = true,
  pendingJobOpen,
  onPendingJobConsumed,
}) => {
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const shouldPollAnalysis = () => visibleRef.current && !document.hidden;

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
    jobId,
    data,
    isPartialResult,
    error,
    applyPartialResult,
    applyFinalResult,
    applyLoadedResult,
    setData,
  } = useAnalysisResultData(sessionKey, visible, jobApi);

  const { cancellingJob, handleCancelJob, exporting, handleExport } = useAnalysisJobActions(
    sessionKey,
    jobId,
    loading,
    isPartialResult,
  );

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

  const fetchTablePreview = useCallback(
    () => genericAnalysisApi.getTablePreview(db, schema, table, timeColumn),
    [db, schema, table, timeColumn],
  );
  const {
    tablePreview,
    loadingPreview,
    previewOpen,
    handlePreviewToggle,
  } = useTablePreview(fetchTablePreview, `${db}|${schema}|${table}|${timeColumn}`);

  const fetchHistory = useCallback(
    () => genericAnalysisApi.getHistory(db, schema, table),
    [db, schema, table],
  );
  const {
    historyOpen,
    setHistoryOpen,
    historyList,
    loadingHistory,
    deleteHistoryItem,
  } = useAnalysisHistory({
    fetchHistory,
    deleteHistoryApi: (jobId) => genericAnalysisApi.deleteHistoryItem(jobId),
    visible,
  });

  const fetchData = async (periodOverride?: [string, string]) => {
    const startDate = periodOverride?.[0] ?? dateRange[0];
    const endDate = periodOverride?.[1] ?? dateRange[1];
    if (periodOverride) {
      setDateRange(periodOverride);
    }

    const confirmed = await confirmHeavyAnalysis(granularity, startDate, endDate, customMinutes);
    if (!confirmed) return;

    try {
      const requestData = {
        database: db,
        schema,
        table,
        timeColumn,
        startDate,
        endDate,
        granularity,
        customMinutes,
        confidence,
        windowSize,
      };

      message.loading({ content: 'Задача поставлена в очередь...', key: 'jobProgress' });

      const { jobId: enqueuedJobId } = await genericAnalysisApi.enqueueAnalysis(requestData);
      syncedJobFormRef.current = enqueuedJobId;

      const result = await runAnalysisSessionJob(
        sessionKey,
        enqueuedJobId,
        jobApi,
        {
          onProgress: (progress) => {
            message.loading({ content: `Анализ выполняется... (${progress}%)`, key: 'jobProgress' });
          },
          onPartialResult: applyPartialResult,
          shouldFetchPartial: shouldPollAnalysis,
          shouldPoll: shouldPollAnalysis,
        },
      );

      applyFinalResult(result);

      message.success({ content: 'Анализ завершен!', key: 'jobProgress', duration: 2.5 });

      const spikes = result.series.filter(s => s.isSpike);
      if (spikes.length > 0) {
        message.warning(`Обнаружено ${spikes.length} аномалий`);
      }
    } catch (e: any) {
      if (e instanceof AnalysisJobCancelledError || e?.cancelled) {
        message.info({ content: 'Анализ остановлен', key: 'jobProgress', duration: 2.5 });
        return;
      }
      const errorText = e.response?.data?.message || e.response?.data || e.message || String(e);
      updateAnalysisSession(sessionKey, { loading: false, error: String(errorText) });
      message.error({ content: `Ошибка при запуске задачи: ${errorText}`, key: 'jobProgress', duration: 4 });
    }
  };

  const pendingJobForTable = pendingJobOpen
    && pendingJobOpen.sourceKind === 'generic'
    && pendingJobOpen.database === db
    && pendingJobOpen.schema === schema
    && pendingJobOpen.table === table
    && pendingJobOpen.timeColumn === timeColumn
    ? pendingJobOpen
    : null;

  const pendingOpenRef = useRef<string | null>(null);
  const syncedJobFormRef = useRef<string | null>(null);

  const syncJobFormFromJob = useCallback((job: PendingAnalysisJobOpen) => {
    if (syncedJobFormRef.current === job.id) return;
    syncedJobFormRef.current = job.id;
    setDateRange([job.startDate, job.endDate]);
    setGranularity(job.granularity);
    setCustomMinutes(job.customMinutes ?? null);
  }, []);

  const applyJobResultToView = useCallback(async (
    job: PendingAnalysisJobOpen,
    options?: { waitForCompletion?: boolean },
  ) => {
    const waitForCompletion = options?.waitForCompletion ?? true;
    syncJobFormFromJob(job);

    if (job.status === 'Completed') {
      const result = await genericAnalysisApi.getJobResult(job.id);
      updateAnalysisSession(sessionKey, {
        jobId: job.id,
        loading: false,
        progress: 100,
        error: null,
      });
      setData(result);
      return result;
    }

    if (job.status === 'Cancelled') {
      const { result } = await loadAnalysisJobResult(job);
      if (!result?.series?.length) throw new Error('Result is empty');
      applyLoadedResult(result, true);
      updateAnalysisSession(sessionKey, {
        jobId: job.id,
        loading: false,
        progress: 100,
        error: null,
      });
      return result;
    }

    updateAnalysisSession(sessionKey, {
      jobId: job.id,
      loading: true,
      progress: job.progress,
      error: null,
    });

    const { result, isPartial } = await loadAnalysisJobResult(job);
    if (result?.series?.length) {
      applyLoadedResult(result, isPartial);
    }

    const pollPromise = runAnalysisSessionJob(sessionKey, job.id, jobApi, {
      attach: true,
      initialProgress: job.progress,
      onProgress: (progress) => updateAnalysisSession(sessionKey, { progress }),
      onPartialResult: applyPartialResult,
      shouldFetchPartial: shouldPollAnalysis,
      shouldPoll: shouldPollAnalysis,
    });

    if (!waitForCompletion) {
      void pollPromise
        .then(applyFinalResult)
        .catch((err: unknown) => {
          if (err instanceof AnalysisJobCancelledError || (err as { cancelled?: boolean })?.cancelled) {
            return;
          }
          console.error('Failed to complete attached analysis job', err);
        });
      return result ?? null;
    }

    const final = await pollPromise;
    applyFinalResult(final);
    return final;
  }, [sessionKey, setData, applyLoadedResult, applyPartialResult, applyFinalResult, jobApi, syncJobFormFromJob]);

  const durationEstimate = useDurationEstimate({
    enabled: visible,
    database: db,
    schema,
    table,
    granularity,
    dateRange,
    resetWhenHidden: true,
  });

  useEffect(() => {
    if (!visible || !pendingJobForTable) return;
    if (pendingOpenRef.current === pendingJobForTable.id) return;

    const job = pendingJobForTable;
    pendingOpenRef.current = job.id;
    let cancelled = false;

    (async () => {
      try {
        message.loading({ content: 'Загрузка результата...', key: 'loadResult' });
        const waitForCompletion = job.status !== 'Running' && job.status !== 'Pending';
        const result = await applyJobResultToView(job, { waitForCompletion });
        if (cancelled) return;

        if (!result?.series?.length) {
          message.warning({ content: 'Результат пуст или недоступен', key: 'loadResult', duration: 3 });
        } else if (job.status === 'Running') {
          message.success({ content: 'Подключено к выполняющейся задаче', key: 'loadResult', duration: 2.5 });
        } else {
          message.success({ content: 'Результат загружен', key: 'loadResult', duration: 2.5 });
        }
        onPendingJobConsumed?.();
      } catch {
        if (!cancelled) {
          message.error({ content: 'Ошибка загрузки', key: 'loadResult' });
        }
        pendingOpenRef.current = null;
        onPendingJobConsumed?.();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJobForTable?.id, visible, onPendingJobConsumed]);

  const enrichedData = useMemo(
    () => (data?.series?.length ? enrichSpikeData(data.series) : []),
    [data?.series],
  );
  const spikesOnly = useMemo(() => enrichedData.filter(s => s.isSpike), [enrichedData]);
  const stats = useMemo(
    () => (data?.series?.length ? getStatistics(data.series) : null),
    [data?.series],
  );

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
      await applyJobResultToView({
        ...job,
        customMinutes: job.customMinutes ?? null,
        channelId: job.channelId ?? null,
      });
      message.success({ content: 'Результат загружен', key: 'loadResult', duration: 2.5 });
      setHistoryOpen(false);
    } catch {
      message.error({ content: 'Ошибка загрузки', key: 'loadResult' });
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
          exportDisabled={!jobId || loading || isPartialResult}
          exportLoading={exporting}
          previewOpen={previewOpen}
          onPreviewToggle={handlePreviewToggle}
          estimateHint={durationEstimate}
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
          jobId={jobId}
          onCancel={handleCancelJob}
          cancelling={cancellingJob}
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

          <SpikeOverviewChart
            enrichedData={enrichedData}
            isPartialResult={isPartialResult}
            showMarkers={showMarkers}
            setShowMarkers={setShowMarkers}
            showCritical={showCritical}
            setShowCritical={setShowCritical}
            showWarning={showWarning}
            setShowWarning={setShowWarning}
            onPointSelect={handlePointSelect}
          />

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
