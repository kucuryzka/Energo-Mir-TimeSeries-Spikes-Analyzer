import React, { useMemo } from 'react';
import { Table, Typography, Spin, Button } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

export interface TablePreviewData {
  approximateRowCount?: number | null;
  sampleRows: Record<string, unknown>[];
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

export const TablePreviewContent: React.FC<TablePreviewContentProps> = ({
  preview,
  loading,
  timeColumn,
  tableLabel,
  onUseAsPeriodStart,
  onUseAsPeriodEnd,
}) => {
  const columns = useMemo(() => {
    if (!preview?.sampleRows.length) return [];
    return Object.keys(preview.sampleRows[0]).map(key => ({
      title: key,
      dataIndex: key,
      key,
      width: 140,
      minWidth: 120,
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
  }, [preview, timeColumn]);

  const showPickActions = Boolean(onUseAsPeriodStart || onUseAsPeriodEnd);

  const tableScrollX = useMemo(() => {
    const dataCols = preview?.sampleRows[0] ? Object.keys(preview.sampleRows[0]).length : 0;
    return dataCols * 140 + (showPickActions ? 140 : 0);
  }, [preview, showPickActions]);

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
    <div className="table-preview-content">
      {tableLabel && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          {tableLabel} · колонка {timeColumn}
        </Text>
      )}
      <Text type="secondary" style={{ display: 'block' }}>
        Записей (оценка): <Text strong>{formatRowCount(preview.approximateRowCount)}</Text>
        {' · '}
        Показано строк: <Text strong>{preview.sampleRows.length}</Text>
      </Text>
      {preview.sampleRows.length === 0 ? (
        <Text type="secondary">Нет строк для отображения</Text>
      ) : (
        <div className="table-preview-scroll">
          <Table
            dataSource={preview.sampleRows.map((row, idx) => ({ ...row, _key: idx }))}
            columns={[
              ...columns,
              ...(showPickActions
                ? [{
                    title: '',
                    key: '_action',
                    width: 140,
                    fixed: 'right' as const,
                    render: (_: unknown, record: Record<string, unknown>) => {
                      const timeKey = findTimeColumnKey(record, timeColumn);
                      if (!timeKey || record[timeKey] == null) return null;
                      const iso = dayjs(String(record[timeKey])).toISOString();
                      return (
                        <span>
                          {onUseAsPeriodStart && (
                            <Button type="link" size="small" onClick={() => onUseAsPeriodStart(iso)}>
                              С начала
                            </Button>
                          )}
                          {onUseAsPeriodEnd && (
                            <Button type="link" size="small" onClick={() => onUseAsPeriodEnd(iso)}>
                              До даты
                            </Button>
                          )}
                        </span>
                      );
                    },
                  }]
                : []),
            ]}
            rowKey="_key"
            size="small"
            pagination={false}
            scroll={{ x: tableScrollX, y: 300 }}
            bordered
          />
        </div>
      )}
    </div>
  );
};
