import React from 'react';
import { Table, Tag } from 'antd';
import type { AnomalyResultDto } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface Props {
  spikes: AnomalyResultDto[];
  style?: React.CSSProperties;
}

export const SpikeTable: React.FC<Props> = ({ spikes, style }) => {
  const columns = [
    {
      title: 'Время события',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (value: string) => (
        <span style={{ fontWeight: 500, color: '#1a2332' }}>
          {dayjs(value).format('DD.MM.YYYY HH:mm:ss')}
        </span>
      ),
      sorter: (a: AnomalyResultDto, b: AnomalyResultDto) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Количество сообщений',
      dataIndex: 'value',
      key: 'value',
      sorter: (a: AnomalyResultDto, b: AnomalyResultDto) => a.value - b.value,
      render: (value: number) => (
        <span style={{ fontWeight: 700, color: '#d94a4a', fontSize: 16 }}>
          {value}
        </span>
      ),
    },
    {
      title: 'P-Value',
      dataIndex: 'pValue',
      key: 'pValue',
      render: (value: number) => (
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {value.toFixed(4)}
        </span>
      ),
      sorter: (a: AnomalyResultDto, b: AnomalyResultDto) => a.pValue - b.pValue,
    },
    {
      title: 'Достоверность',
      key: 'confidence',
      render: (_: any, record: AnomalyResultDto) => {
        const confidence = (1 - record.pValue) * 100;
        return (
          <span style={{ fontWeight: 600, color: confidence > 99 ? '#22a67e' : '#e8a838' }}>
            {confidence.toFixed(1)}%
          </span>
        );
      },
    },
    {
      title: 'Тип события',
      key: 'severity',
      render: (_: any, record: AnomalyResultDto) => {
        if (record.pValue < 0.01) {
          return <Tag color="error" style={{ fontWeight: 600, borderRadius: 6 }}>🔴 Критическая авария</Tag>;
        }
        if (record.pValue < 0.05) {
          return <Tag color="warning" style={{ fontWeight: 600, borderRadius: 6 }}>🟠 Вероятная авария</Tag>;
        }
        return <Tag color="gold" style={{ fontWeight: 600, borderRadius: 6 }}>🟡 Подозрительное событие</Tag>;
      },
    },
  ];

  return (
    <div style={style}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a2332' }}>
          Список аварийных событий
        </h3>
        <span style={{ fontSize: 14, color: '#6b7a8f', background: '#f0f4f8', padding: '4px 14px', borderRadius: 20 }}>
          Всего: <b style={{ color: '#d94a4a' }}>{spikes.length}</b>
        </span>
      </div>
      <Table
        dataSource={spikes}
        columns={columns}
        rowKey="timestamp"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Всего ${total} событий`,
        }}
        size="middle"
        style={{ borderRadius: 12, overflow: 'hidden' }}
      />
    </div>
  );
};
