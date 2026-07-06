import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Drawer, List, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { requestTracker, type RequestRecord } from '../../store/requestTracker';
import dayjs from 'dayjs';

const { Text } = Typography;

interface QueryTrackerContextValue {
  open: () => void;
  activeCount: number;
}

const QueryTrackerContext = createContext<QueryTrackerContextValue | null>(null);

export const useQueryTracker = () => {
  const ctx = useContext(QueryTrackerContext);
  if (!ctx) {
    throw new Error('useQueryTracker must be used within QueryTrackerProvider');
  }
  return ctx;
};

export const QueryTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    setRequests(requestTracker.getRequests());
    setActiveCount(requestTracker.getActiveCount());

    const unsubscribe = requestTracker.subscribe(() => {
      setRequests(requestTracker.getRequests());
      setActiveCount(requestTracker.getActiveCount());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      open: () => setOpen(true),
      activeCount,
    }),
    [activeCount],
  );

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
    <QueryTrackerContext.Provider value={value}>
      {children}
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
    </QueryTrackerContext.Provider>
  );
};

/** @deprecated Use QueryTrackerProvider + useQueryTracker instead */
export const QueryTracker: React.FC = () => null;
