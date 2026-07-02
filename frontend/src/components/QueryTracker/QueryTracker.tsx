import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, List, Tag, Typography } from 'antd';
import { ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { requestTracker, type RequestRecord } from '../../store/requestTracker';
import dayjs from 'dayjs';

const { Text } = Typography;

export const QueryTracker: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    // Initial sync
    setRequests(requestTracker.getRequests());
    setActiveCount(requestTracker.getActiveCount());

    // Subscribe to updates
    const unsubscribe = requestTracker.subscribe(() => {
      setRequests(requestTracker.getRequests());
      setActiveCount(requestTracker.getActiveCount());
    });

    return () => { unsubscribe(); };
  }, []);

  const getStatusTag = (req: RequestRecord) => {
    switch (req.status) {
      case 'pending':
        return <Tag icon={<LoadingOutlined />} color="processing">Выполняется</Tag>;
      case 'success':
        return <Tag icon={<CheckCircleOutlined />} color="success">Успешно</Tag>;
      case 'error':
        return <Tag icon={<CloseCircleOutlined />} color="error">Ошибка</Tag>;
      default:
        return null;
    }
  };

  const formatDuration = (req: RequestRecord) => {
    if (req.status === 'pending') return '-';
    const duration = (req.endTime || Date.now()) - req.startTime;
    return `${(duration / 1000).toFixed(2)} с`;
  };

  return (
    <>
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
        <Badge count={activeCount} size="small" offset={[-5, 5]}>
          <Button 
            type="primary" 
            shape="circle" 
            icon={<ApiOutlined />} 
            size="large" 
            onClick={() => setOpen(true)} 
            style={{ 
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              background: activeCount > 0 ? '#1890ff' : '#6b7a8f'
            }}
          />
        </Badge>
      </div>

      <Drawer
        title="Запросы к БД (Сетевые)"
        placement="right"
        onClose={() => setOpen(false)}
        open={open}
        width={400}
      >
        <List
          itemLayout="horizontal"
          dataSource={requests}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong style={{ fontSize: 13, wordBreak: 'break-all' }}>
                      {item.method.toUpperCase()} {item.url}
                    </Text>
                  </div>
                }
                description={
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text type="secondary">{dayjs(item.startTime).format('HH:mm:ss')}</Text>
                      <Text type="secondary">Время: {formatDuration(item)}</Text>
                    </div>
                    <div>{getStatusTag(item)}</div>
                    {item.errorMessage && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="danger">{item.errorMessage}</Text>
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
        {requests.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Text type="secondary">Нет отправленных запросов в этой сессии</Text>
          </div>
        )}
      </Drawer>
    </>
  );
};
