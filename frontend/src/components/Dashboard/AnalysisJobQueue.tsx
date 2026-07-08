import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Popconfirm, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { parseUtcTimestamp } from '../../utils/dateTimeUtils';
import { canOpenAnalysisJob, toPendingAnalysisJobOpen } from '../../utils/analysisJobLoader';
import type { PendingAnalysisJobOpen } from '../../utils/analysisJobLoader';
import { analysisJobsApi, type AnalysisJobQueueItem } from '../../api/analysisJobsApi';

interface AnalysisJobQueueProps {
  database?: string;
  currentJobId?: string | null;
  refreshKey?: number;
  onCancelled?: () => void;
  onOpenJob?: (job: PendingAnalysisJobOpen) => void;
  enabled?: boolean;
  showWhenEmpty?: boolean;
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
  Completed: 'Завершён',
  Failed: 'Ошибка',
  Cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
  Pending: 'default',
  Running: 'processing',
  Completed: 'success',
  Failed: 'error',
  Cancelled: 'warning',
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

function getElapsedSeconds(startIso: string, endIso: string | null | undefined, nowMs: number): number {
  const startMs = parseUtcTimestamp(startIso);
  const endMs = endIso ? parseUtcTimestamp(endIso) : nowMs;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return Math.floor((endMs - startMs) / 1000);
}

export const AnalysisJobQueue: React.FC<AnalysisJobQueueProps> = ({
  database,
  currentJobId,
  refreshKey = 0,
  onCancelled,
  onOpenJob,
  enabled = true,
  showWhenEmpty = false,
  showDatabaseColumn = false,
}) => {
  const [activeItems, setActiveItems] = useState<AnalysisJobQueueItem[]>([]);
  const [recentItems, setRecentItems] = useState<AnalysisJobQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await analysisJobsApi.getOverview(database);
      setActiveItems(overview.active);
      setRecentItems(overview.recent);
    } catch (e) {
      console.error('Failed to load analysis queue', e);
      setActiveItems([]);
      setRecentItems([]);
    } finally {
      setLoading(false);
    }
  }, [database]);

  useEffect(() => {
    if (!enabled) return;
    loadOverview();
    const timer = window.setInterval(loadOverview, 3000);
    return () => window.clearInterval(timer);
  }, [loadOverview, refreshKey, enabled]);

  useEffect(() => {
    if (!enabled || activeItems.length === 0) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeItems.length, enabled]);

  const handleCancel = useCallback(async (jobId: string) => {
    setCancellingId(jobId);
    try {
      await analysisJobsApi.cancel(jobId);
      onCancelled?.();
      await loadOverview();
    } catch (e) {
      console.error('Failed to cancel job', e);
    } finally {
      setCancellingId(null);
    }
  }, [loadOverview, onCancelled]);

  const buildColumns = useCallback((includeCancel: boolean): ColumnsType<AnalysisJobQueueItem> => {
    const base: ColumnsType<AnalysisJobQueueItem> = [
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
          <Tag color={STATUS_COLORS[status] ?? 'default'}>
            {STATUS_LABELS[status] ?? status}
            {status === 'Pending' && row.queuePosition ? ` (#${row.queuePosition})` : ''}
          </Tag>
        ),
      },
      {
        title: 'Прогресс',
        dataIndex: 'progress',
        render: (value: number, row) => (row.status === 'Completed' ? '100%' : `${value}%`),
      },
      {
        title: 'Длительность',
        key: 'duration',
        render: (_, row) => {
          const elapsed = formatElapsedDuration(
            getElapsedSeconds(row.createdAt, row.completedAt, nowMs),
          );
          const prefix = row.status === 'Pending' ? 'в очереди ' : '';
          return (
            <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {prefix}{elapsed}
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
    ];

    if (onOpenJob) {
      base.push({
        title: '',
        key: 'open',
        width: 110,
        render: (_, row) => (
          <Button
            size="small"
            type="link"
            disabled={!canOpenAnalysisJob(row)}
            onClick={() => onOpenJob(toPendingAnalysisJobOpen(row))}
          >
            Открыть
          </Button>
        ),
      });
    }

    if (includeCancel) {
      base.push({
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
            disabled={row.status !== 'Pending' && row.status !== 'Running'}
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
      });
    }

    return base;
  }, [showDatabaseColumn, onOpenJob, nowMs, cancellingId, currentJobId, handleCancel]);

  const activeColumns = useMemo(() => buildColumns(true), [buildColumns]);
  const recentColumns = useMemo(() => buildColumns(false), [buildColumns]);

  const hasItems = activeItems.length > 0 || recentItems.length > 0;
  if (!showWhenEmpty && !loading && !hasItems) return null;

  return (
    <div className="analysis-job-queue" style={{ marginBottom: showWhenEmpty ? 0 : 16 }}>
      {!showWhenEmpty && <div style={{ fontWeight: 600, marginBottom: 8 }}>Очередь анализа</div>}

      <div style={{ marginBottom: recentItems.length > 0 ? 24 : 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Активные задачи</div>
        <Table
          size="small"
          rowKey="id"
          loading={loading && !hasItems}
          pagination={false}
          locale={{ emptyText: 'Нет активных задач' }}
          dataSource={activeItems}
          columns={activeColumns}
        />
      </div>

      {(showWhenEmpty || recentItems.length > 0) && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Недавно завершённые</div>
          <Table
            size="small"
            rowKey="id"
            loading={loading && !hasItems}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{ emptyText: 'Нет завершённых задач' }}
            dataSource={recentItems}
            columns={recentColumns}
          />
        </div>
      )}
    </div>
  );
};
