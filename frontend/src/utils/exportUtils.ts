import * as XLSX from 'xlsx';
import type { AnomalyResultDto, SpikeResponse } from '../types/analytics.types';
import dayjs from 'dayjs';

interface ExportRow {
  'Время среза': string;
  'Количество сообщений': number;
  'Статус': string;
  'P-Value': number;
  'Достоверность (%)': string;
  'Каналы (детализация)': string;
}

export const exportSpikesToExcel = (
  data: SpikeResponse | null,
  filename?: string
): void => {
  if (!data || !data.series || data.series.length === 0) {
    return;
  }

  const rows: ExportRow[] = data.series.map((point: AnomalyResultDto) => {
    const confidence = (1 - point.pValue) * 100;
    const status = point.isSpike
      ? point.pValue < 0.01
        ? '🔴 Критическая аномалия'
        : point.pValue < 0.05
          ? '🟠 Аномалия'
          : '🟡 Подозрительное'
      : '✅ Штатный режим';

    const channelDetails = (point.channelBreakdown || [])
      .map(cb => `${cb.channelName}: ${cb.count}`)
      .join('; ');

    return {
      'Время среза': dayjs(point.timestamp).format('DD.MM.YYYY HH:mm:ss'),
      'Количество сообщений': point.value,
      'Статус': status,
      'P-Value': point.pValue,
      'Достоверность (%)': `${confidence.toFixed(2)}%`,
      'Каналы (детализация)': channelDetails || '—',
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Auto-fit column widths
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(
      key.length * 2,
      ...rows.map((row) => String((row as any)[key] ?? '').length)
    ),
  }));
  worksheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Аномалии');

  const defaultName = `spike-analysis-${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`;
  XLSX.writeFile(workbook, filename || defaultName);
};