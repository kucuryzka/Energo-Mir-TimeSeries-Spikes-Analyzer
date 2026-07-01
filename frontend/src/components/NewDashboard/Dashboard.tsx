import React, { useState, useEffect } from 'react';
import { message, Spin, Drawer, Table, Typography, Tabs, Switch } from 'antd';
import { DashboardLayout } from './DashboardLayout';
import { TopHeader } from './TopHeader';
import { FilterPanel } from './FilterPanel';
import { StatsGrid } from './StatsGrid';
import { SpikeChart } from '../Chart/SpikeChart';
import { SpikeTable } from '../Stats/SpikeTable';
import { DistributionChart } from '../Chart/DistributionChart';
import { analyticsApi } from '../../api/analyticsApi';
import { enrichSpikeData, getSpikesOnly, getStatistics } from '../../utils/spikeUtils';
import dayjs from 'dayjs';
import type { TimeGranularity, SpikePoint, DistributionItemDto, ChannelDto } from '../../types/analytics.types';
import './Dashboard.css';

const { Title, Text } = Typography;

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<SpikePoint | null>(null);
  const [distributions, setDistributions] = useState<Record<string, DistributionItemDto[]>>({});

  // States for filters
  const [granularity, setGranularity] = useState<TimeGranularity>('Hour');
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [confidence, setConfidence] = useState(80);
  const [showMarkers, setShowMarkers] = useState(true);
  const [windowSize, setWindowSize] = useState<number | null>(30);
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().subtract(7, 'day').startOf('day').toISOString(),
    dayjs().endOf('day').toISOString(),
  ]);

  const [sources, setSources] = useState<{label: string, value: string, supportedDistributions?: string[]}[]>([]);
  const [sourceId, setSourceId] = useState<string>('');

  const initSources = async () => {
    try {
      const data = await analyticsApi.getSources();
      if (data.length > 0) {
        setSources(data.map(s => ({ label: s.name, value: s.id, supportedDistributions: s.supportedDistributions })));
        setSourceId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchChannels = async (search: string = '') => {
    if (!sourceId) return;
    try {
      if (sourceId.toLowerCase() === 'dbo') {
        const data = await analyticsApi.dbo.getChannels(search);
        setChannels(data);
      } else {
        const data = await analyticsApi.emProtocol.getChannels(search);
        setChannels(data);
      }
    } catch (err) {
      console.error('Ошибка при загрузке каналов', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const requestPayload = {
        sourceId,
        channelId,
        granularity,
        customMinutes: granularity === 'Custom' ? customMinutes : null,
        confidence,
        windowSize: windowSize ?? 30,
        startDate: dateRange[0],
        endDate: dateRange[1],
      };
      
      let response;
      if (sourceId.toLowerCase() === 'dbo') {
        response = await analyticsApi.dbo.detectSpikes(requestPayload);
      } else {
        response = await analyticsApi.emProtocol.detectSpikes(requestPayload);
      }
      
      setData(response);

      const currentSource = sources.find(s => s.value === sourceId);
      if (currentSource && currentSource.supportedDistributions) {
        const newDists: Record<string, DistributionItemDto[]> = {};
        for (const category of currentSource.supportedDistributions) {
          try {
            const distData = await analyticsApi.emProtocol.getDistribution(dateRange[0], dateRange[1], category);
            newDists[category] = distData;
          } catch (e) {
            console.error('Ошибка загрузки распределения', e);
          }
        }
        setDistributions(newDists);
      } else {
        setDistributions({});
      }
    } catch (err) {
      message.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
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
  }, [sourceId]); // Fetch on source change

  useEffect(() => {
    if (!sourceId) return;
    const timer = setTimeout(() => {
      fetchChannels(channelSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [channelSearch, sourceId]);

  const enrichedData = data ? enrichSpikeData(data.series) : [];
  const spikesOnly = data ? getSpikesOnly(data.series) : [];
  const stats = data ? getStatistics(data.series) : null;

  return (
    <DashboardLayout>
      <TopHeader />
      <div className="new-dashboard-divider" />
      <FilterPanel 
        sources={sources} sourceId={sourceId} setSourceId={setSourceId}
        granularity={granularity} setGranularity={setGranularity}
        customMinutes={customMinutes} setCustomMinutes={setCustomMinutes}
        channelId={channelId} setChannelId={setChannelId}
        channels={channels} onSearchChannels={setChannelSearch}
        confidence={confidence} setConfidence={setConfidence}
        windowSize={windowSize} setWindowSize={setWindowSize}
        dateRange={dateRange} setDateRange={setDateRange}
        onSearch={fetchData}
      />
      
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <Spin size="large" />
        </div>
      ) : !data || enrichedData.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: 'var(--text-secondary)', fontSize: 18 }}>
          Нет данных для отображения
        </div>
      ) : (
        <>
          <StatsGrid stats={stats} />
          
          <div className="new-chart-container" style={{ flexDirection: 'column', gap: 24, background: 'transparent' }}>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 30, padding: 24, width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <Title level={4} style={{ margin: 0, fontWeight: 600 }}>Временной ряд</Title>
                  <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {dayjs(dateRange[0]).format('DD.MM.YYYY')} — {dayjs(dateRange[1]).format('DD.MM.YYYY')}
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Text style={{ marginRight: 10, fontWeight: 500, color: 'var(--text-secondary)' }}>Маркеры</Text>
                  <Switch size="small" checked={showMarkers} onChange={setShowMarkers} />
                </div>
              </div>
              <SpikeChart data={enrichedData} showMarkers={showMarkers} onPointClick={setSelectedPoint} />
            </div>
            
            {spikesOnly.length > 0 && (
              <div style={{ background: 'var(--bg-surface)', borderRadius: 30, padding: 24, width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <SpikeTable spikes={spikesOnly} />
              </div>
            )}

            {Object.keys(distributions).map(category => (
              <div key={category} style={{ background: 'var(--bg-surface)', borderRadius: 30, padding: 24, width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <DistributionChart 
                  data={distributions[category]} 
                  title={`Распределение по: ${category === 'EventCode' ? 'Код события (EventCode)' : category}`}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <Drawer
        title={<Title level={5} style={{ margin: 0 }}>Детали временного среза</Title>}
        placement="right"
        width={500}
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
                  <Text type="danger" strong>Аномалия (p-value: {selectedPoint.pValue?.toFixed(4) ?? '-'})</Text>
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
                            const match = curr.channelName.match(/^(.*?)\s*\((.*?)\)$/);
                            const source = match ? match[1].trim() : curr.channelName;
                            acc[source] = (acc[source] || 0) + curr.count;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([name, count]) => ({ name, count }))
                      }
                      rowKey="name"
                      size="small"
                      pagination={false}
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
                            const match = curr.channelName.match(/^(.*?)\s*\((.*?)\)$/);
                            if (match) {
                              const code = match[2].trim();
                              acc[code] = (acc[code] || 0) + curr.count;
                            }
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([code, count]) => ({ code, count }))
                      }
                      rowKey="code"
                      size="small"
                      pagination={false}
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
    </DashboardLayout>
  );
};
