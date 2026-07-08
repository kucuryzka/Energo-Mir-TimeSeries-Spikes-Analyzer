import React, { useCallback, useEffect, useState } from 'react';
import { Button, Popconfirm, Table, Tag } from 'antd';
import { analysisJobsApi, type AnalysisJobQueueItem } from '../../api/analysisJobsApi';

interface AnalysisJobQueueProps {
  database?: string;
  currentJobId?: string | null;
  refreshKey?: number;
  onCancelled?: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  dbo: 'DBO',
  em_protocol: 'EM Protocol',
  generic: 'Generic',
};

const STATUS_LABELS: Record<string, string> = {
  Pending: 'В очереди',
  Running: 'Выполняется',
};

export const AnalysisJobQueue: React.FC<AnalysisJobQueueProps> = ({
  database,
  currentJobId,
  refreshKey = 0,
  onCancelled,
}) => {
  const [items, setItems] = useState<AnalysisJobQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await analysisJobsApi.getQueue(database);
      setItems(queue);
    } catch (e) {
      console.error('Failed to load analysis queue', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [database]);

  useEffect(() => {
    loadQueue();
    const timer = window.setInterval(loadQueue, 3000);
    return () => window.clearInterval(timer);
  }, [loadQueue, refreshKey]);

  const handleCancel = async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await analysisJobsApi.cancel(jobId);
      onCancelled?.();
      await loadQueue();
    } catch (e) {
      console.error('Failed to cancel job', e);
    } finally {
      setCancellingId(null);
    }
  };

  if (!loading && items.length === 0) return null;

  return (
    <div className="analysis-job-queue" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Очередь анализа</div>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={items}
        columns={[
          {
            title: 'Источник',
            dataIndex: 'sourceKind',
            render: (value: string) => SOURCE_LABELS[value] ?? value,
          },
          {
            title: 'Статус',
            dataIndex: 'status',
            render: (status: string, row) => (
              <Tag color={status === 'Running' ? 'processing' : 'default'}>
                {STATUS_LABELS[status] ?? status}
                {status === 'Pending' && row.queuePosition ? ` (#${row.queuePosition})` : ''}
              </Tag>
            ),
          },
          {
            title: 'Прогресс',
            dataIndex: 'progress',
            render: (value: number) => `${value}%`,
          },
          {
            title: 'Период',
            key: 'period',
            render: (_, row) => (
              <span style={{ fontSize: 12 }}>
                {new Date(row.startDate).toLocaleDateString()} — {new Date(row.endDate).toLocaleDateString()}
              </span>
            ),
          },
          {
            title: '',
            key: 'actions',
            width: 110,
            render: (_, row) => (
              <Popconfirm
                title="Остановить задачу?"
                description="Текущий батч завершится, частичный результат сохранится."
                onConfirm={() => handleCancel(row.id)}
                okText="Остановить"
                cancelText="Нет"
              >
                <Button
                  size="small"
                  danger
                  loading={cancellingId === row.id}
                  disabled={row.status !== 'Pending' && row.status !== 'Running'}
                >
                  {row.id === currentJobId ? 'Стоп' : 'Отмена'}
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </div>
  );
};
