import React, { useState } from 'react';
import { List, Tag, Pagination } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import type { AnomalyResultDto } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface Props {
  spikes: AnomalyResultDto[];
  style?: React.CSSProperties;
  entityLabel?: string;
}

const PAGE_SIZE = 5;

export const SpikeTable: React.FC<Props> = ({ spikes, style, entityLabel = 'Каналы' }) => {
  const [page, setPage] = useState(1);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const pageData = spikes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', justifyContent: 'space-between', ...style }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A2332', margin: 0 }}>
            Аномалии{' '}
            <span style={{ color: '#7A8B9E', fontWeight: 500, fontSize: 14 }}>({spikes.length})</span>
          </h3>
        </div>

        <List
          dataSource={pageData}
          split={false}
          renderItem={item => {
            const isCritical = item.pValue < 0.01;
            const hasBreakdown = !!item.channelBreakdown && item.channelBreakdown.length > 0;
            const isExpanded = expandedKeys.has(item.timestamp);

            return (
              <List.Item style={{ padding: 0, border: 'none', marginBottom: 8, display: 'block' }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: '#F8F9FD',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid transparent',
                    cursor: hasBreakdown ? 'pointer' : 'default',
                  }}
                  onClick={() => hasBreakdown && toggleExpand(item.timestamp)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isCritical ? '#D94A4A' : '#E8A838',
                        boxShadow: isCritical
                          ? '0 0 8px rgba(219,74,74,0.6)'
                          : '0 0 8px rgba(232,168,56,0.6)',
                      }}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600, color: '#1A2332', fontSize: 14 }}>
                        {Math.round(item.value)} сообщений
                      </span>
                      <span style={{ fontSize: 11, color: '#7A8B9E' }}>
                        {dayjs(item.timestamp).format('DD.MM YYYY HH:mm')}
                        {hasBreakdown && (
                          <span style={{ marginLeft: 8 }}>
                            {isExpanded ? <UpOutlined /> : <DownOutlined />}
                            {' '}
                            {entityLabel}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <Tag
                    style={{
                      margin: 0,
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontWeight: 600,
                      fontSize: 11,
                      border: 'none',
                      background: isCritical ? '#FBECE9' : '#FFF8EB',
                      color: isCritical ? '#D94A4A' : '#E8A838',
                    }}
                  >
                    {isCritical ? 'Критическая' : 'Предупреждение'}
                  </Tag>
                </div>

                {hasBreakdown && isExpanded && (
                  <div style={{ padding: '8px 16px 12px 38px', background: '#F0F2F8', borderRadius: '0 0 12px 12px', marginTop: -4 }}>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {item.channelBreakdown!.map(cb => (
                        <div key={cb.channelId} style={{ color: '#1A2332', marginBottom: 4, fontSize: 13 }}>
                          <span style={{ fontWeight: 500 }}>{cb.channelName}</span>
                          {' — '}
                          <span style={{ color: '#D94A4A', fontWeight: 600 }}>{cb.count}</span> записей
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </List.Item>
            );
          }}
        />
      </div>

      {spikes.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination
            simple
            current={page}
            total={spikes.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
            style={{ fontSize: 12, color: '#7A8B9E' }}
          />
        </div>
      )}
    </div>
  );
};
