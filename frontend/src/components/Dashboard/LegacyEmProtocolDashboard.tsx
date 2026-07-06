import React, { useState, useEffect } from 'react';
import { Spin, Alert, message, Switch, Drawer, Table, Typography, Tabs, Popconfirm } from 'antd';
import { LoadingOutlined, DeleteOutlined } from '@ant-design/icons';
import { SpikeChart } from '../Chart/SpikeChart';
import { DistributionChart } from '../Chart/DistributionChart';
import { ControlsPanel } from '../Controls/ControlsPanel';
import { SpikeTable } from '../Stats/SpikeTable';
import { analyticsApi } from '../../api/analyticsApi';

import { enrichSpikeData, getSpikesOnly, getStatistics } from '../../utils/spikeUtils';
import type { TimeGranularity, ChannelDto, DataSourceDto, DistributionItemDto, SpikePoint, ChannelContributionDto } from '../../types/analytics.types';
import dayjs from 'dayjs';
import { formatUtcDateTime } from '../../utils/dateTimeUtils';
import { confirmHeavyAnalysis } from '../../utils/granularityWarning';
import { TablePreviewContent, type TablePreviewData } from '../GenericAnalyzer/TablePreviewCard';
import { Button, Space } from 'antd';
import { DashboardOutlined, HistoryOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../api/index';

const { Title, Text } = Typography;

export const LegacyEmProtocolDashboard: React.FC<{ database: string }> = ({ database }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [channelSearch, setChannelSearch] = useState('');

  const [granularity, setGranularity] = useState<TimeGranularity>('Hour');
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(95);
  const [windowSize, setWindowSize] = useState<number | null>(30);
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').startOf('day').toISOString(),
    dayjs().endOf('day').toISOString(),
  ]);

  const [sources, setSources] = useState<DataSourceDto[]>([]);
  const [sourceId, setSourceId] = useState<string>('');

  const [distributions, setDistributions] = useState<Record<string, DistributionItemDto[]>>({});
  const [showMarkers, setShowMarkers] = useState(true);
  const [eventCodeMap, setEventCodeMap] = useState<Record<string, string>>({});

  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);
  const [pointChannels, setPointChannels] = useState<ChannelContributionDto[]>([]);
  const [loadingPointChannels, setLoadingPointChannels] = useState(false);

  useEffect(() => {
    if (!selectedPoint) {
      setPointChannels([]);
      return;
    }
    setLoadingPointChannels(true);
    analyticsApi.emProtocol.getPointChannels(
      database,
      selectedPoint.timestamp,
      granularity,
      granularity === 'Custom' ? customMinutes ?? undefined : undefined,
      channelId ?? undefined
    ).then(breakdown => {
      const meta = new Map(channels.map(c => [c.id, c]));
      setPointChannels(breakdown.map(c => ({
        ...c,
        channelName: c.channelName || meta.get(c.channelId)?.name || `Канал ${c.channelId}`,
        eventCode: (meta.get(c.channelId) as any)?.eventCode
      })));
    }).catch(console.error).finally(() => setLoadingPointChannels(false));
  }, [selectedPoint, granularity, customMinutes, channelId, database, channels]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [tablePreview, setTablePreview] = useState<TablePreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const preview = await analyticsApi.emProtocol.getTablePreview(database);
        if (!mounted) return;
        setTablePreview(preview);
        if (preview?.minDate && preview?.maxDate) {
          const end = dayjs(preview.maxDate);
          const start = end.subtract(7, 'day').startOf('day');
          setDateRange([start.toISOString(), end.toISOString()]);
        }
      } catch (e) {
        console.error('Failed to load EmProtocol preview', e);
        if (mounted) setTablePreview(null);
      } finally {
        if (mounted) setLoadingPreview(false);
      }
    };
    if (database) loadPreview();
    return () => { mounted = false; };
  }, [database]);

  const fetchData = async () => {
    if (!sourceId) return;

    const confirmed = await confirmHeavyAnalysis(
      granularity,
      dateRange[0],
      dateRange[1],
      granularity === 'Custom' ? customMinutes : null,
    );
    if (!confirmed) return;
    
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const requestPayload = {
        database,
        sourceId: 'EmProtocol',
        channelId,
        granularity,
        customMinutes: granularity === 'Custom' ? customMinutes : null,
        confidence,
        windowSize: windowSize ?? 30,
        startDate: dateRange[0],
        endDate: dateRange[1],
      };

      const { jobId } = await analyticsApi.emProtocol.enqueueAnalysis(requestPayload);
      message.loading({ content: 'Задача поставлена в очередь (Hangfire)...', key: 'jobProgress' });

      while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await analyticsApi.emProtocol.getJobStatus(jobId);

        if (status.status === 'Completed') {
          message.success({ content: 'Анализ завершен!', key: 'jobProgress' });
          const result = await analyticsApi.emProtocol.getJobResult(jobId);
          setData(result);
          
          const currentSource = sources.find(s => s.id === sourceId);
          if (currentSource && currentSource.supportedDistributions) {
            await fetchDistributions(currentSource.supportedDistributions);
          } else {
            setDistributions({});
          }

          const spikes = result.series.filter((s: any) => s.isSpike);
          if (spikes.length > 0) {
            message.warning(`Обнаружено ${spikes.length} аномалий`);
          } else {
            message.success('Аномалий не обнаружено');
          }
          break;
        } else if (status.status === 'Failed') {
          message.error({ content: `Ошибка выполнения: ${status.errorMessage}`, key: 'jobProgress' });
          setError(`Ошибка выполнения: ${status.errorMessage}`);
          break;
        } else {
          message.loading({ content: `Анализ выполняется... (${status.progress}%)`, key: 'jobProgress' });
        }
      }
    } catch (err: any) {
      const errorText = err.response?.data?.message || err.response?.data || err.message || String(err);
      setError(`Ошибка при загрузке данных: ${errorText}`);
      message.error({ content: 'Сбой при запуске задачи', key: 'jobProgress' });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async (search: string = '') => {
    if (!sourceId) return;
    try {
      const data = await analyticsApi.emProtocol.getChannels(database, search);
      setChannels(data);
    } catch (err) {
      console.error('Ошибка при загрузке каналов', err);
    }
  };

  const fetchDistributions = async (supportedCats: string[]) => {
    if (!supportedCats || supportedCats.length === 0) {
      setDistributions({});
      return;
    }
    try {
      const newDists: Record<string, DistributionItemDto[]> = {};
      for (const category of supportedCats) {
        const distData = await analyticsApi.emProtocol.getDistribution(
          database,
          dateRange[0],
          dateRange[1],
          category
        );
        newDists[category] = distData;
      }
      setDistributions(newDists);
    } catch (err) {
      console.error('Ошибка при загрузке распределений', err);
    }
  };

  const initSources = async () => {
    try {
      const data = await analyticsApi.getSources();
      setSources(data);
      if (data.length > 0) {
        setSourceId(data[0].id);
      }
    } catch (err) {
      console.error('Ошибка при загрузке источников', err);
      setError('Не удалось загрузить источники данных.');
    }
  };

  useEffect(() => {
    initSources();
    fetch('/event_codes.csv')
      .then(res => {
        if (!res.ok) throw new Error('event_codes.csv not found');
        return res.text();
      })
      .then(text => {
        const map: Record<string, string> = {};
        const lines = text.split('\n');
        for (let i = 1; i < lines.length; i++) { // skip header
          const line = lines[i];
          if (!line.trim()) continue;
          const parts = line.split(';');
          if (parts.length >= 3) {
            // First column is ID, third column is Имя
            map[parts[0].trim()] = parts[2].trim() || parts[1].trim();
          } else if (parts.length >= 2) {
            map[parts[0].trim()] = parts[1].trim();
          }
        }
        setEventCodeMap(map);
      })
      .catch(() => {
        console.warn('event_codes.csv not found or failed to parse. Make sure to put it in the public folder.');
      });
  }, []);

  useEffect(() => {
    if (sourceId) {
      setChannelId(null);
      setChannels([]);
      setData(null);
      setDistributions({});
      fetchChannels();
    }
  }, [sourceId]);

  // Debounce-поиск каналов
  useEffect(() => {
    if (!sourceId) return;
    const timer = setTimeout(() => {
      fetchChannels(channelSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [channelSearch]);

  const enrichedData = data ? enrichSpikeData(data.series) : [];
  const spikesOnly = data ? getSpikesOnly(data.series) : [];
  const stats = data ? getStatistics(data.series) : null;

  const antIcon = <LoadingOutlined style={{ fontSize: 32, color: '#2a5298' }} spin />;

  return (
    <>
      <main className="app-main">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <Title level={4}>Анализ: EmProtocol</Title>
        </div>
        <div className="dashboard-card" style={{ marginBottom: 24 }}>
          <ControlsPanel
            sourceId={sourceId}
            onSourceChange={setSourceId}
            sources={sources}
            granularity={granularity}
            onGranularityChange={setGranularity}
            customMinutes={customMinutes}
            onCustomMinutesChange={setCustomMinutes}
            confidence={confidence}
            onConfidenceChange={setConfidence}
            windowSize={windowSize ?? 30}
            onWindowSizeChange={setWindowSize}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            channelId={channelId}
            onChannelChange={setChannelId}
            channels={channels}
            onSearchChannels={setChannelSearch}
            onAnalyze={fetchData}
            loading={loading}
            previewOpen={previewOpen}
            onPreviewToggle={() => setPreviewOpen(v => !v)}
            previewContent={
              <TablePreviewContent
                preview={tablePreview}
                loading={loadingPreview}
                timeColumn="InsertTime"
                tableLabel="em_protocol.Records"
                onUseAsPeriodStart={(iso) => setDateRange(([_, end]) => [iso, end])}
                onUseAsPeriodEnd={(iso) => setDateRange(([start]) => [start, iso])}
              />
            }
          />
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: 20, borderRadius: 12 }}
          />
        )}

        <Spin spinning={loading} indicator={antIcon}>
          {enrichedData.length > 0 && stats && (
            <>
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-header">
                    <span className="label">Всего значений</span>
                  </div>
                  <div className="value primary">{stats.totalCalls.toLocaleString()}</div>
                </div>

                <div className="stat-item">
                  <div className="stat-header">
                    <span className="label">Обнаружено аномалий</span>
                  </div>
                  <div className={`value ${stats.spikesCount > 0 ? 'warning' : 'success'}`}>
                    {stats.spikesCount}
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-header">
                    <span className="label">Критических аномалий</span>
                  </div>
                  <div className={`value ${stats.criticalSpikes > 0 ? 'danger' : 'success'}`}>
                    {stats.criticalSpikes}
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-header">
                    <span className="label">Среднее значение</span>
                  </div>
                  <div className="value primary">{stats.average.toFixed(0)}</div>
                </div>

                <div className="stat-item">
                  <div className="stat-header">
                    <span className="label">Максимум</span>
                  </div>
                  <div className="value warning">{stats.max}</div>
                </div>

                <div className="stat-item">
                  <div className="stat-header">
                    <span className="label">Всего точек</span>
                  </div>
                  <div className="value primary">{stats.totalPoints}</div>
                </div>
              </div>

              <div className="dashboard-card" style={{ marginBottom: 24 }}>
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
                <SpikeChart data={enrichedData} showMarkers={showMarkers} onPointClick={setSelectedPoint} />
              </div>

              {spikesOnly.length > 0 && (
                <div className="dashboard-card" style={{ marginBottom: 24 }}>
                  <SpikeTable spikes={spikesOnly} />
                </div>
              )}

              {Object.keys(distributions).map(category => {
                const isEventCode = category === 'EventCode';
                const distData = isEventCode 
                  ? distributions[category].map(d => ({ ...d, category: eventCodeMap[d.category] || d.category }))
                  : distributions[category];

                return (
                  <div key={category} style={{ marginBottom: 24 }}>
                    <DistributionChart 
                      data={distData} 
                      title={`Распределение по: ${isEventCode ? 'Код события' : category}`}
                    />
                  </div>
                );
              })}
            </>
          )}

          {!loading && !data && !error && (
            <div className="dashboard-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}></div>
              <h3 style={{ color: '#1a2332', marginBottom: 8 }}>Нет данных для отображения</h3>
              <p style={{ color: '#6b7a8f' }}>Настройте параметры и нажмите «Анализировать»</p>
            </div>
          )}
        </Spin>
      </main>

      <Drawer
        title={<Title level={5} style={{ margin: 0 }}>Детали временного среза</Title>}
        placement="right"
        size="large"
        onClose={() => setSelectedPoint(null)}
        open={selectedPoint !== null}
      >
        {selectedPoint && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">Время начала среза:</Text><br/>
                <Text strong>{dayjs(selectedPoint.timestamp).format('DD.MM.YYYY HH:mm:ss')}</Text>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">Общее число событий:</Text><br/>
                <Text strong>{selectedPoint.value.toLocaleString('ru-RU')}</Text>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">Статус:</Text><br/>
                {selectedPoint.isSpike ? (
                  <Text type="danger" strong>Аномалия (p-value: {selectedPoint.pValue.toFixed(4)})</Text>
                ) : (
                  <Text type="success" strong>Штатный режим</Text>
                )}
              </div>
            </div>

            <Tabs 
              defaultActiveKey="sources" 
              style={{ marginTop: 24 }}
              items={[
                {
                  key: 'sources',
                  label: 'Источники',
                  children: (
                    <Table
                      dataSource={
                        Object.entries(
                          pointChannels.reduce((acc, curr) => {
                            const source = curr.channelName || `Канал ${curr.channelId}`;
                            acc[source] = (acc[source] || 0) + curr.count;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([name, count]) => ({ name, count }))
                      }
                      rowKey="name"
                      size="small"
                      loading={loadingPointChannels}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                      columns={[
                        { title: 'Источник', dataIndex: 'name', key: 'name' },
                        { 
                          title: 'Кол-во', 
                          dataIndex: 'count', 
                          key: 'count',
                          render: (val: number) => val.toLocaleString('ru-RU'),
                          sorter: (a: any, b: any) => a.count - b.count,
                          defaultSortOrder: 'descend',
                        }
                      ]}
                    />
                  )
                },
                {
                  key: 'events',
                  label: 'Коды событий',
                  children: (
                    <Table
                      dataSource={
                        Object.entries(
                          pointChannels.reduce((acc, curr) => {
                            const rawCode = curr.eventCode ? String(curr.eventCode) : 'Неизвестный код';
                            const code = eventCodeMap[rawCode] || rawCode;
                            acc[code] = (acc[code] || 0) + curr.count;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([code, count]) => ({ code, count }))
                      }
                      rowKey="code"
                      size="small"
                      loading={loadingPointChannels}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                      columns={[
                        { title: 'Код', dataIndex: 'code', key: 'code' },
                        { 
                          title: 'Кол-во', 
                          dataIndex: 'count', 
                          key: 'count',
                          render: (val: number) => val.toLocaleString('ru-RU'),
                          sorter: (a: any, b: any) => a.count - b.count,
                          defaultSortOrder: 'descend',
                        }
                      ]}
                    />
                  )
                }
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
        ) : (
          historyList.length === 0 ? <Text type="secondary">Нет сохраненной истории для EmProtocol</Text> : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {historyList.map((job: any) => (
                <div 
                  key={job.id} 
                  style={{ 
                    border: '1px solid #f0f0f0', 
                    padding: 12, 
                    borderRadius: 8, 
                    cursor: job.status === 'Completed' ? 'pointer' : 'default',
                    background: job.status === 'Completed' ? '#fafafa' : '#fff'
                  }}
                  onClick={async () => {
                    if (job.status !== 'Completed') return;
                    try {
                      message.loading({ content: 'Загрузка результата...', key: 'loadResult' });
                      const result = await analyticsApi.emProtocol.getJobResult(job.id);
                      setData(result);
                      setDateRange([job.startDate, job.endDate]);
                      if (job.channelId) {
                        setChannelId(parseInt(job.channelId, 10));
                      } else {
                        setChannelId(null);
                      }
                      setGranularity(job.granularity);

                      const currentSource = sources.find(s => s.id === sourceId);
                      if (currentSource && currentSource.supportedDistributions) {
                        await fetchDistributions(currentSource.supportedDistributions);
                      } else {
                        setDistributions({});
                      }

                      message.success({ content: 'Результат загружен', key: 'loadResult' });
                      setHistoryOpen(false);
                    } catch(e) {
                      message.error({ content: 'Ошибка загрузки', key: 'loadResult' });
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <Text strong>{dayjs(job.startDate).format('DD.MM.YY')} - {dayjs(job.endDate).format('DD.MM.YY')}</Text>
                      <br/>
                      <Text type="secondary">Канал: {job.channelId || 'Все'}</Text>
                      <br/>
                      <Text type="secondary">
                        {(job.status === 'Completed' || job.status === 'Failed')
                          ? `Выполнен: ${formatUtcDateTime(job.completedAt ?? job.createdAt)}`
                          : `Запущен: ${formatUtcDateTime(job.createdAt)}`}
                      </Text>
                      <br/>
                      <Text type={job.status === 'Completed' ? 'success' : 'warning'}>{job.status}</Text>
                    </div>
                    <Popconfirm
                      title="Удалить этот результат?"
                      onConfirm={async (e) => {
                        e?.stopPropagation();
                        try {
                          await analyticsApi.emProtocol.deleteHistoryItem(job.id);
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
                </div>
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
              const hist = await analyticsApi.emProtocol.getHistory(database);
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

    </>
  );
};
