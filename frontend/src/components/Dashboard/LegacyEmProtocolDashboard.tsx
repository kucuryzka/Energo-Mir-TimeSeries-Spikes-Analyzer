import React, { useState, useEffect } from 'react';
import { Spin, Alert, message, Switch, Drawer, Table, Typography, Tabs } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { SpikeChart } from '../Chart/SpikeChart';
import { DistributionChart } from '../Chart/DistributionChart';
import { ControlsPanel } from '../Controls/ControlsPanel';
import { SpikeTable } from '../Stats/SpikeTable';
import { analyticsApi } from '../../api/analyticsApi';
import { enrichSpikeData, getSpikesOnly, getStatistics } from '../../utils/spikeUtils';
import type { TimeGranularity, ChannelDto, DataSourceDto, DistributionItemDto, SpikePoint } from '../../types/analytics.types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const LegacyEmProtocolDashboard: React.FC = () => {
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

  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);

  const fetchData = async () => {
    if (!sourceId) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await analyticsApi.emProtocol.detectSpikes({
        sourceId: 'EmProtocol',
        channelId,
        granularity,
        customMinutes: granularity === 'Custom' ? customMinutes : null,
        confidence,
        windowSize: windowSize ?? 30,
        startDate: dateRange[0],
        endDate: dateRange[1],
      });

      setData(response);
      
      const currentSource = sources.find(s => s.id === sourceId);
      if (currentSource && currentSource.supportedDistributions) {
        await fetchDistributions(currentSource.supportedDistributions);
      } else {
        setDistributions({});
      }

      const spikes = response.series.filter(s => s.isSpike);
      if (spikes.length > 0) {
        message.warning(`Обнаружено ${spikes.length} аномалий`);
      } else {
        message.success('Аномалий не обнаружено');
      }
    } catch (err: any) {
      const errorText = err.response?.data?.message || err.response?.data || err.message || String(err);
      setError(`Ошибка при загрузке данных: ${errorText}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async (search: string = '') => {
    if (!sourceId) return;
    try {
      const data = await analyticsApi.emProtocol.getChannels(search);
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

              {Object.keys(distributions).map(category => (
                <div key={category} style={{ marginBottom: 24 }}>
                  <DistributionChart 
                    data={distributions[category]} 
                    title={`Распределение по: ${category === 'EventCode' ? 'Код события (EventCode)' : category}`}
                  />
                </div>
              ))}
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
                          (selectedPoint.channelBreakdown || []).reduce((acc, curr) => {
                            const source = curr.channelName;
                            acc[source] = (acc[source] || 0) + curr.count;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([name, count]) => ({ name, count }))
                      }
                      rowKey="name"
                      size="small"
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
                          (selectedPoint.channelBreakdown || []).reduce((acc, curr) => {
                            const code = curr.eventCode || 'Неизвестный код';
                            acc[code] = (acc[code] || 0) + curr.count;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([code, count]) => ({ code, count }))
                      }
                      rowKey="code"
                      size="small"
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
    </>
  );
};
