import React from 'react';
import { List, Tag, Pagination } from 'antd';
import type { SpikePoint } from '../../types/analytics.types';
import dayjs from 'dayjs';

interface SpikeTableProps {
  spikes: SpikePoint[];
}

export const SpikeTable: React.FC<SpikeTableProps> = ({ spikes }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
      <div>
        {/* Убрали любые упоминания "Обновлено только что", оставили строго чистый заголовок */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A2332', margin: 0 }}>
            Аномалии <span style={{ color: '#7A8B9E', fontWeight: 500, fontSize: 14 }}>({spikes.length})</span>
          </h3>
        </div>

        <List
          dataSource={spikes}
          split={false}
          renderItem={(item) => {
            const isCritical = item.pValue < 0.01;
            return (
              <List.Item style={{ 
                padding: '12px 16px', 
                borderRadius: 12, 
                marginBottom: 8, 
                background: '#F8F9FD',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid transparent'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    background: isCritical ? '#D94A4A' : '#E8A838',
                    boxShadow: isCritical ? '0 0 8px rgba(219,74,74,0.6)' : '0 0 8px rgba(232,168,56,0.6)'
                  }} />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600, color: '#1A2332', fontSize: 14 }}>
                      {Math.round(item.value)} сообщений
                    </span>
                    <span style={{ fontSize: 11, color: '#7A8B9E' }}>
                      {dayjs(item.timestamp).format('DD.MM YYYY HH:mm')}
                    </span>
                  </div>
                </div>

                <Tag style={{ 
                  margin: 0,
                  borderRadius: 8,
                  padding: '4px 12px',
                  fontWeight: 600,
                  fontSize: 11,
                  border: 'none',
                  background: isCritical ? '#FBECE9' : '#FFF8EB',
                  color: isCritical ? '#D94A4A' : '#E8A838'
                }}>
                  {isCritical ? 'Критическая' : 'Предупреждение'}
                </Tag>
              </List.Item>
            );
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Pagination 
          simple 
          defaultCurrent={1} 
          total={spikes.length} 
          pageSize={5} 
          style={{ fontSize: 12, color: '#7A8B9E' }}
        />
      </div>
    </div>
  );
};