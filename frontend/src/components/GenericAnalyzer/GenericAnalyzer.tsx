import React, { useState, useEffect } from 'react';
import { Typography, Card, Space, Button, DatePicker, Select, InputNumber, Spin, message, Drawer, Table, Switch } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SpikeChart } from '../Chart/SpikeChart';
import { enrichSpikeData } from '../../utils/spikeUtils';
import { genericAnalysisApi } from '../../api/explorerApi';
import type { TimeGranularity, SpikePoint } from '../../types/analytics.types';

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await genericAnalysisApi.analyze({
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
      });
      // the api now returns SpikeResponse format (list of AnomalyResultDto)
      setData(res);
    } catch (e) {
      message.error('Ошибка анализа данных');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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
      <Title level={4}>Анализ: {schema}.{table} ({timeColumn})</Title>
      
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
              <InputNumber value={customMinutes} onChange={setCustomMinutes} min={1} />
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
            <InputNumber value={windowSize} onChange={(val) => setWindowSize(val || 30)} min={5} max={1000} />
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
    </div>
  );
};
