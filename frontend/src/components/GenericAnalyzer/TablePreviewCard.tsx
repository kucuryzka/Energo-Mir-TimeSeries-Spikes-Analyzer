import React, { useMemo } from 'react';
import { Table, Tabs, Typography, Spin, Button, Space } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

export interface TablePreviewData {
  minDate?: string;
  maxDate?: string;
  approximateRowCount?: number | null;
  earliestRows: Record<string, unknown>[];
  latestRows: Record<string, unknown>[];
}

export interface TablePreviewContentProps {
  preview: TablePreviewData | null;
  loading: boolean;
  timeColumn: string;
  tableLabel?: string;
  onUseAsPeriodStart?: (isoDate: string) => void;
  onUseAsPeriodEnd?: (isoDate: string) => void;
}

function formatRowCount(count?: number | null): string {
  if (count == null) return 'неизвестно';
  if (count >= 1_000_000_000) return `~${(count / 1_000_000_000).toFixed(1)} млрд`;
  if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)} млн`;
  if (count >= 1_000) return `~${Math.round(count / 1_000)} тыс.`;
  return `~${count}`;
}

function findTimeColumnKey(row: Record<string, unknown>, timeColumn: string): string | null {
  const keys = Object.keys(row);
  return keys.find(k => k.toLowerCase() === timeColumn.toLowerCase()) ?? null;
}

function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return dayjs(value).format('DD.MM.YYYY HH:mm:ss');
  }
  return String(value);
}

function PreviewTable({
  rows,
  timeColumn,
  onPickDate,
  pickLabel,
}: {
  rows: Record<string, unknown>[];
  timeColumn: string;
  onPickDate?: (iso: string) => void;
  pickLabel: string;
}) {
  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]).map(key => ({
      title: key,
      dataIndex: key,
      key,
      ellipsis: true,
      render: (value: unknown) => {
        const isTime = key.toLowerCase() === timeColumn.toLowerCase();
        return (
          <span style={isTime ? { color: '#1890ff', fontWeight: 600 } : undefined}>
            {formatCellValue(value)}
          </span>
        );
      },
    }));
  }, [rows, timeColumn]);

  if (rows.length === 0) {
    return <Text type="secondary">Нет строк для отображения</Text>;
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
      <Table
        dataSource={rows.map((row, idx) => ({ ...row, _key: idx }))}
        columns={[
          ...columns,
          ...(onPickDate
            ? [{
                title: '',
                key: '_action',
                width: 120,
                fixed: 'right' as const,
                render: (_: unknown, record: Record<string, unknown>) => {
                  const timeKey = findTimeColumnKey(record, timeColumn);
                  if (!timeKey || record[timeKey] == null) return null;
                  return (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => onPickDate(dayjs(String(record[timeKey])).toISOString())}
                    >
                      {pickLabel}
                    </Button>
                  );
                },
              }]
            : []),
        ]}
        rowKey="_key"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        bordered
      />
    </div>
  );
}

export const TablePreviewContent: React.FC<TablePreviewContentProps> = ({
  preview,
  loading,
  timeColumn,
  tableLabel,
  onUseAsPeriodStart,
  onUseAsPeriodEnd,
}) => {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Spin />
      </div>
    );
  }

  if (!preview) {
    return <Text type="secondary">Не удалось загрузить образец</Text>;
  }

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
      {tableLabel && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
          {tableLabel} · колонка {timeColumn}
        </Text>
      )}
      <Space wrap style={{ marginBottom: 12 }}>
        {preview.minDate && preview.maxDate && (
          <Text>
            Период:{' '}
            <Text strong>
              {dayjs(preview.minDate).format('DD.MM.YYYY HH:mm')} — {dayjs(preview.maxDate).format('DD.MM.YYYY HH:mm')}
            </Text>
          </Text>
        )}
        <Text type="secondary">
          Записей (оценка): <Text strong>{formatRowCount(preview.approximateRowCount)}</Text>
        </Text>
      </Space>
      <Tabs
        size="small"
        items={[
          {
            key: 'earliest',
            label: 'Самые ранние',
            children: (
              <PreviewTable
                rows={preview.earliestRows}
                timeColumn={timeColumn}
                onPickDate={onUseAsPeriodStart}
                pickLabel="С начала"
              />
            ),
          },
          {
            key: 'latest',
            label: 'Самые поздние',
            children: (
              <PreviewTable
                rows={preview.latestRows}
                timeColumn={timeColumn}
                onPickDate={onUseAsPeriodEnd}
                pickLabel="До даты"
              />
            ),
          },
        ]}
      />
    </div>
  );
};
