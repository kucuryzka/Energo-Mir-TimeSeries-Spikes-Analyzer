import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Space, Button, DatePicker, Select, InputNumber, Spin, message, Drawer, Table, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatUtcDateTime } from '../../utils/dateTimeUtils';
import { confirmHeavyAnalysis } from '../../utils/granularityWarning';
import { SpikeChart } from '../Chart/SpikeChart';
import { enrichSpikeData } from '../../utils/spikeUtils';
import { exportSpikesToExcel } from '../../utils/exportUtils';
import { genericAnalysisApi } from '../../api/explorerApi';
import { TablePreviewContent, type TablePreviewData } from './TablePreviewCard';
import { AnalysisActionBar } from './AnalysisActionBar';
import { AnalysisJobProgress } from '../Dashboard/AnalysisJobProgress';
import type { TimeGranularity, SpikePoint, SpikeResponse } from '../../types/analytics.types';
import { apiCache } from '../../store/apiCache';
import { useRegisterShellRailActions } from '../../context/ShellRailContext';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface GenericAnalyzerProps {
  db: string;
  schema: string;
  table: string;
  timeColumn: string;
  onBack: () => void;
}

export const GenericAnalyzer: React.FC<GenericAnalyzerProps> = ({ db, schema, table, timeColumn, onBack: _onBack }) => {
  const [data, setData] = useState<SpikeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isPartialResult, setIsPartialResult] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);
  const [pointDetails, setPointDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);

  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').startOf('day').toISOString(),
    dayjs().endOf('day').toISOString(),
  ]);
  const [granularity, setGranularity] = useState<TimeGranularity>('Hour');
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number>(95);
  const [windowSize, setWindowSize] = useState<number>(30);

  const [minMaxDates, setMinMaxDates] = useState<[string, string] | null>(null);
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
        if (preview?.minDate && preview?.maxDate) {
          setMinMaxDates([preview.minDate, preview.maxDate]);
          const end = dayjs(preview.maxDate);
          const start = end.subtract(7, 'day').startOf('day');
          setDateRange([start.toISOString(), end.toISOString()]);
        }
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

    setLoading(true);
    setData(null);
    setIsPartialResult(false);
    setAnalysisProgress(0);
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
        windowSize
      };

      message.loading({ content: 'Задача поставлена в очередь...', key: 'jobProgress' });

      const result = await genericAnalysisApi.runAnalysis(
        requestData,
        (progress) => {
          setAnalysisProgress(progress);
          message.loading({ content: `Анализ выполняется... (${progress}%)`, key: 'jobProgress' });
        },
        (partial) => {
          setIsPartialResult(true);
          setData(partial);
        },
      );

      setIsPartialResult(false);
      setAnalysisProgress(100);
      setData(result);
      message.success({ content: 'Анализ завершен!', key: 'jobProgress' });
    } catch (e: any) {
      const errorText = e.response?.data?.message || e.response?.data || e.message || String(e);
      message.error({ content: `Ошибка при запуске задачи: ${errorText}`, key: 'jobProgress' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if we already have cached data for these parameters
    const dataPayload = {
      database: db,
      schema,
      table,
      timeColumn,
      startDate: dateRange[0],
      endDate: dateRange[1],
      granularity,
      customMinutes,
      confidence,
      windowSize
    };
    const cached = apiCache.get('/GenericAnalysis/analyze', undefined, dataPayload);
    if (cached) {
      // NOTE: With chunking, whole-range cache might not hit as often,
      // but individual chunks will be cached inside the genericAnalysisApi.analyze call.
      // This is left here if they somehow request the exact same chunk/range.
      // setData(cached); 
    } else {
      setData(null);
    }
  }, [db, schema, table, timeColumn]);

  const handleExport = () => {
    if (!data?.series?.length) {
      message.warning('Нет данных для экспорта. Сначала выполните анализ.');
      return;
    }
    exportSpikesToExcel(data);
    message.success('Данные экспортированы в Excel');
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

  const enrichedData = data?.series?.length ? enrichSpikeData(data.series) : [];

  const handlePointClick = async (point: SpikePoint) => {
    setSelectedPoint(point);
    setLoadingDetails(true);
    try {
      const details = await genericAnalysisApi.getPointDetails(
        db, schema, table, timeColumn, point.timestamp, granularity, customMinutes
      );
      setPointDetails(details);
    } catch (e) {
      message.error('Ошибка загрузки деталей');
      setPointDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const tableColumns = pointDetails.length > 0 
    ? Object.keys(pointDetails[0]).map(key => ({
        title: key,
        dataIndex: key,
        key: key,
        render: (text: any) => {
          const isTimeColumn = key.toLowerCase() === timeColumn.toLowerCase();
          return isTimeColumn 
            ? <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{String(text)}</span>
            : <span>{String(text)}</span>;
        }
      }))
    : [];

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Title level={4}>Анализ: {schema}.{table} ({timeColumn})</Title>
      </div>

      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Space wrap size="large">
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Период</Text>
            <RangePicker 
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
              disabledDate={(current) => {
                if (!minMaxDates) return false;
                return current && (current < dayjs(minMaxDates[0]).startOf('day') || current > dayjs(minMaxDates[1]).endOf('day'));
              }}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0].toISOString(), dates[1].toISOString()]);
                }
              }}
              style={{ minWidth: 350 }}
            />
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Гранулярность</Text>
            <Select value={granularity} onChange={setGranularity} style={{ width: 120 }}>
              <Select.Option value="Minute">Минута</Select.Option>
              <Select.Option value="Hour">Час</Select.Option>
              <Select.Option value="Day">День</Select.Option>
              <Select.Option value="Week">Неделя</Select.Option>
              <Select.Option value="Month">Месяц</Select.Option>
              <Select.Option value="Custom">Своя (мин)</Select.Option>
            </Select>
          </div>
          {granularity === 'Custom' && (
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Минут</Text>
              <InputNumber value={customMinutes} onChange={(val) => setCustomMinutes(val ? Number(val) : null)} min={1} />
            </div>
          )}
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Чувствительность</Text>
            <Select value={confidence} onChange={setConfidence} style={{ width: 100 }}>
              <Select.Option value={90}>90%</Select.Option>
              <Select.Option value={95}>95%</Select.Option>
              <Select.Option value={98}>98%</Select.Option>
              <Select.Option value={99}>99%</Select.Option>
              <Select.Option value={99.9}>99.9%</Select.Option>
            </Select>
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Глубина (точек)</Text>
            <InputNumber value={windowSize} onChange={(val) => setWindowSize(Number(val) || 30)} min={5} max={1000} />
          </div>
        </Space>
        <AnalysisActionBar
          onAnalyze={fetchData}
          loading={loading}
          previewOpen={previewOpen}
          onPreviewToggle={() => setPreviewOpen(v => !v)}
          onExport={handleExport}
          exportDisabled={!data?.series?.length}
          style={{ marginTop: 16 }}
          previewContent={
            <TablePreviewContent
              preview={tablePreview}
              loading={loadingPreview}
              timeColumn={timeColumn}
              tableLabel={`${schema}.${table}`}
              onUseAsPeriodStart={(iso) => setDateRange(([_, end]) => [iso, end])}
              onUseAsPeriodEnd={(iso) => setDateRange(([start]) => [start, iso])}
            />
          }
        />
      </Card>

      {!data && loading ? (
        <AnalysisJobProgress
          loading
          progress={analysisProgress}
          isPartialResult={isPartialResult}
          showSpinner
        />
      ) : enrichedData.length > 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <AnalysisJobProgress
            loading={loading}
            progress={analysisProgress}
            isPartialResult={isPartialResult}
          />
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a2332' }}>
              Временной ряд
            </h3>
            <span style={{ fontSize: 13, color: '#6b7a8f' }}>
              {dayjs(dateRange[0]).format('DD.MM.YYYY')} — {dayjs(dateRange[1]).format('DD.MM.YYYY')}
            </span>
          </div>
          <SpikeChart
            data={enrichedData}
            showMarkers={showMarkers}
            onShowMarkersChange={setShowMarkers}
            onPointClick={handlePointClick}
          />
        </Card>
      ) : null}

      <Drawer
        title={<Title level={5} style={{ margin: 0 }}>Детали среза ({selectedPoint?.timestamp ? dayjs(selectedPoint.timestamp).format('DD.MM.YYYY HH:mm:ss') : ''})</Title>}
        placement="right"
        size="large"
        onClose={() => setSelectedPoint(null)}
        open={selectedPoint !== null}
      >
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
            pagination={{ pageSize: 20 }}
            size="small"
            bordered
          />
        )}
      </Drawer>

      <Drawer
        title="История анализов"
        placement="right"
        size="default"
        onClose={() => setHistoryOpen(false)}
        open={historyOpen}
      >
        {loadingHistory ? (
          <Spin />
        ) : (
          historyList.length === 0 ? <Text type="secondary">Нет сохраненной истории для этой таблицы</Text> : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {historyList.map((job: any) => (
                <Card 
                  key={job.id} 
                  size="small" 
                  style={{ cursor: 'pointer', borderColor: job.status === 'Completed' ? '#b7eb8f' : '#f0f0f0' }}
                  onClick={async () => {
                    if (job.status !== 'Completed') {
                      message.warning('Анализ еще не завершен или завершился с ошибкой');
                      return;
                    }
                    try {
                      setHistoryOpen(false);
                      setLoading(true);
                      const res = await genericAnalysisApi.getJobResult(job.id);
                      setData(res);
                      setDateRange([job.startDate, job.endDate]);
                    } catch (e) {
                      message.error('Не удалось загрузить результат');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <Text strong>{dayjs(job.startDate).format('DD.MM.YY')} - {dayjs(job.endDate).format('DD.MM.YY')}</Text>
                      <br/>
                      <Text type="secondary">Гранулярность: {job.granularity}</Text>
                      <br/>
                      <Text type={job.status === 'Completed' ? 'success' : job.status === 'Failed' ? 'danger' : 'warning'}>
                        {job.status} {job.status === 'Running' ? `(${job.progress}%)` : ''}
                      </Text>
                      <br/>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {(job.status === 'Completed' || job.status === 'Failed')
                          ? `Выполнен: ${formatUtcDateTime(job.completedAt ?? job.createdAt)}`
                          : `Запущен: ${formatUtcDateTime(job.createdAt)}`}
                      </Text>
                    </div>
                    <Popconfirm
                      title="Удалить этот результат?"
                      onConfirm={async (e) => {
                        e?.stopPropagation();
                        try {
                          await genericAnalysisApi.deleteHistoryItem(job.id);
                          setHistoryList(prev => prev.filter(item => item.id !== job.id));
                          message.success('Удалено');
                        } catch(err) {
                          message.error('Ошибка удаления');
                        }
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="Да"
                      cancelText="Нет"
                    >
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteOutlined />} 
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                </Card>
              ))}
            </Space>
          )
        )}
      </Drawer>

    </div>
  );
};
