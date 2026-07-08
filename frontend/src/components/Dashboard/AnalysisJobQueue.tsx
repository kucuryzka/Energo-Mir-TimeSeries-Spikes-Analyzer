import React, { useCallback, useEffect, useState } from 'react';
import { Button, Popconfirm, Table, Tag } from 'antd';
import { parseUtcTimestamp } from '../../utils/dateTimeUtils';
import { analysisJobsApi, type AnalysisJobQueueItem } from '../../api/analysisJobsApi';

interface AnalysisJobQueueProps {
  database?: string;
  currentJobId?: string | null;
  refreshKey?: number;
  onCancelled?: () => void;
  /** When false, polling is disabled (component may stay mounted). */
  enabled?: boolean;
  /** Show placeholder when the queue is empty instead of hiding the block. */
  showWhenEmpty?: boolean;
  /** Show database column (useful for global queue view). */
  showDatabaseColumn?: boolean;
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

function formatElapsedDuration(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}ч ${m.toString().padStart(2, '0')}м ${s.toString().padStart(2, '0')}с`;
  if (m > 0) return `${m}м ${s.toString().padStart(2, '0')}с`;
  return `${s}с`;
}

function getElapsedSeconds(startIso: string, nowMs: number): number {
  const startMs = parseUtcTimestamp(startIso);
  if (Number.isNaN(startMs)) return 0;
  return Math.floor((nowMs - startMs) / 1000);
}

export const AnalysisJobQueue: React.FC<AnalysisJobQueueProps> = ({
  database,
  currentJobId,
  refreshKey = 0,
  onCancelled,
  enabled = true,
  showWhenEmpty = false,
  showDatabaseColumn = false,
}) => {
  const [items, setItems] = useState<AnalysisJobQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    if (!enabled) return;
    loadQueue();
    const timer = window.setInterval(loadQueue, 3000);
    return () => window.clearInterval(timer);
  }, [loadQueue, refreshKey, enabled]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [items.length]);

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

  if (!showWhenEmpty && !loading && items.length === 0) return null;

  return (
    <div className="analysis-job-queue" style={{ marginBottom: showWhenEmpty ? 0 : 16 }}>
      {!showWhenEmpty && <div style={{ fontWeight: 600, marginBottom: 8 }}>Очередь анализа</div>}
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'Нет активных задач' }}
        dataSource={items}
        columns={[
          ...(showDatabaseColumn
            ? [{
                title: 'База',
                dataIndex: 'database',
                render: (value: string) => <span style={{ fontSize: 12 }}>{value}</span>,
              }]
            : []),
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
            title: 'Длительность',
            key: 'duration',
            render: (_, row) => {
              const elapsed = formatElapsedDuration(getElapsedSeconds(row.createdAt, nowMs));
              return (
                <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {row.status === 'Pending' ? `в очереди ${elapsed}` : elapsed}
                </span>
              );
            },
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
