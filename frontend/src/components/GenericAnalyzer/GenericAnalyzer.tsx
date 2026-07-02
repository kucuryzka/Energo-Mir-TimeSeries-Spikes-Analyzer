import React, { useState, useEffect } from 'react';
import { Typography, Card, Space, Button, DatePicker, Select, InputNumber, Spin, message, Drawer, Table, Switch, Popconfirm } from 'antd';
import { SearchOutlined, DashboardOutlined, HistoryOutlined, DeleteOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../api/index';
import dayjs from 'dayjs';
import { SpikeChart } from '../Chart/SpikeChart';
import { enrichSpikeData } from '../../utils/spikeUtils';
import { genericAnalysisApi } from '../../api/explorerApi';
import type { TimeGranularity, SpikePoint } from '../../types/analytics.types';
import { apiCache } from '../../store/apiCache';

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
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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
  
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Interval Forecasting on mount
  useEffect(() => {
    let mounted = true;
    const fetchTimeRange = async () => {
      try {
        const range = await genericAnalysisApi.getTimeRange(db, schema, table, timeColumn);
        if (mounted && range && range.minDate && range.maxDate) {
          setMinMaxDates([range.minDate, range.maxDate]);
          // Default range to last 7 days of available data if valid
          const end = dayjs(range.maxDate);
          const start = end.subtract(7, 'day').startOf('day');
          setDateRange([start.toISOString(), end.toISOString()]);
        }
      } catch (e) {
        console.error('Failed to fetch time range', e);
      }
    };
    fetchTimeRange();
    return () => { mounted = false; };
  }, [db, schema, table, timeColumn]);

  const fetchData = async () => {
    setLoading(true);
    setData([]); // clear previous data
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

      const { jobId } = await genericAnalysisApi.enqueueAnalysis(requestData);
      message.loading({ content: 'Задача поставлена в очередь (Hangfire)...', key: 'jobProgress' });

      while (true) {
        await new Promise(r => setTimeout(r, 1000));
        const status = await genericAnalysisApi.getJobStatus(jobId);

        if (status.status === 'Completed') {
          message.success({ content: 'Анализ завершен!', key: 'jobProgress' });
          const result = await genericAnalysisApi.getJobResult(jobId);
          setData(result);
          break;
        } else if (status.status === 'Failed') {
          message.error({ content: `Ошибка выполнения: ${status.errorMessage}`, key: 'jobProgress' });
          break;
        } else {
          message.loading({ content: `Анализ выполняется... (${status.progress}%)`, key: 'jobProgress' });
        }
      }
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
      setData([]); // clear data if no cache, waiting for manual trigger
    }
  }, [db, schema, table, timeColumn]);

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
      
      {minMaxDates && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Доступные данные: с {dayjs(minMaxDates[0]).format('DD.MM.YYYY HH:mm')} по {dayjs(minMaxDates[1]).format('DD.MM.YYYY HH:mm')}
        </Text>
      )}

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
          <div style={{ alignSelf: 'flex-end', marginTop: 12 }}>
            <Button 
              type="primary" 
              onClick={fetchData} 
              loading={loading}
              size="large"
              icon={<SearchOutlined />}
              style={{
                background: 'linear-gradient(135deg, #2a5298 0%, #1a3a6b 100%)',
                border: 'none',
                borderRadius: 8,
                height: 48,
                padding: '0 32px',
                fontSize: 16,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(42, 82, 152, 0.3)',
              }}
            >
              {loading ? 'Анализируем данные...' : 'Анализировать'}
            </Button>
          </div>
        </Space>
      </Card>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 8
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a2332' }}>
                Временной ряд
              </h3>
              <span style={{ fontSize: 13, color: '#6b7a8f' }}>
                {dayjs(dateRange[0]).format('DD.MM.YYYY')} — {dayjs(dateRange[1]).format('DD.MM.YYYY')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                <Switch size="small" checked={showMarkers} onChange={setShowMarkers} />
                <span style={{ color: '#6b7a8f' }}>Маркеры</span>
              </div>
              <span>
                <span style={{ display: 'inline-block', width: 12, height: 3, background: '#4a90d9', borderRadius: 2, marginRight: 6 }}></span>
                Значения
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 12, height: 12, background: '#d94a4a', borderRadius: '50%', marginRight: 6 }}></span>
                Аномалия
              </span>
              <span>
                <span style={{ display: 'inline-block', width: 12, height: 2, background: '#6b7a8f', borderStyle: 'dashed', marginRight: 6 }}></span>
                Среднее
              </span>
            </div>
          </div>
          <SpikeChart 
            data={enrichSpikeData(data)} 
            showMarkers={showMarkers} 
            onPointClick={handlePointClick}
          />
        </Card>
      )}

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
                      <Text type="secondary" style={{ fontSize: 12 }}>Создано: {dayjs(job.createdAt).format('DD.MM HH:mm')}</Text>
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
      <div style={{ position: 'fixed', bottom: 80, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Button 
          type="primary" 
          shape="circle" 
          size="large" 
          icon={<DashboardOutlined />} 
          onClick={() => window.open(`${API_BASE_URL}/hangfire`, '_blank')} 
          title="Панель Hangfire" 
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: '#52c41a', borderColor: '#52c41a' }}
        />
        <Button 
          type="primary" 
          shape="circle" 
          size="large" 
          icon={<HistoryOutlined />} 
          onClick={async () => {
            setHistoryOpen(true);
            setLoadingHistory(true);
            try {
              const hist = await genericAnalysisApi.getHistory(db, schema, table);
              setHistoryList(hist);
            } catch(e) {
              message.error('Ошибка загрузки истории');
            } finally {
              setLoadingHistory(false);
            }
          }}
          title="История запросов" 
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: '#faad14', borderColor: '#faad14' }}
        />
      </div>

    </div>
  );
};
