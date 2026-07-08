import { Modal } from 'antd';
import dayjs from 'dayjs';
import type { TimeGranularity } from '../types/analytics.types';

/** Порог точек в итоговой серии — выше него показываем предупреждение. */
const HEAVY_SERIES_POINT_THRESHOLD = 100_000;

const GRANULARITY_LABELS: Record<string, string> = {
  Minute: 'минутная',
  Hour: 'часовая',
  Day: 'дневная',
  Week: 'недельная',
  Month: 'месячная',
  Custom: 'пользовательская',
};

function formatCount(count: number): string {
  if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)} млн`;
  if (count >= 1_000) return `~${Math.round(count / 1_000)} тыс.`;
  return `~${count}`;
}

/**
 * Оценка максимального числа точек в итоговой серии (после GROUP BY в БД).
 * Пустые интервалы без данных в серию не попадают — это верхняя граница.
 */
export function estimateSeriesPointCount(
  granularity: TimeGranularity | 'Month',
  startDate: string,
  endDate: string,
  customMinutes?: number | null,
): number {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  if (!end.isAfter(start)) return 1;

  const totalMinutes = Math.max(end.diff(start, 'minute'), 1);

  switch (granularity) {
    case 'Minute':
      return totalMinutes;
    case 'Hour':
      return Math.max(Math.ceil(totalMinutes / 60), 1);
    case 'Day':
      return Math.max(end.diff(start, 'day'), 1);
    case 'Week':
      return Math.max(Math.ceil(end.diff(start, 'day') / 7), 1);
    case 'Month':
      return Math.max(end.diff(start, 'month'), 1);
    case 'Custom': {
      const bucketMinutes = customMinutes && customMinutes > 0 ? customMinutes : 60;
      return Math.max(Math.ceil(totalMinutes / bucketMinutes), 1);
    }
    default:
      return 1;
  }
}

function suggestCoarserGranularity(
  granularity: TimeGranularity | 'Month',
  rangeDays: number,
): string {
  if (granularity === 'Minute' || granularity === 'Custom') {
    if (rangeDays > 365) return '«День» или «Неделя»';
    if (rangeDays > 60) return '«Час» или «День»';
    return '«Час»';
  }
  if (granularity === 'Hour') {
    return rangeDays > 90 ? '«День» или «Неделя»' : '«День»';
  }
  return 'более крупную гранулярность';
}

export async function confirmHeavyAnalysis(
  granularity: TimeGranularity | 'Month',
  startDate: string,
  endDate: string,
  customMinutes?: number | null,
): Promise<boolean> {
  const points = estimateSeriesPointCount(granularity, startDate, endDate, customMinutes);
  if (points < HEAVY_SERIES_POINT_THRESHOLD) return true;

  const rangeDays = Math.max(dayjs(endDate).diff(dayjs(startDate), 'day'), 1);
  const granLabel = GRANULARITY_LABELS[granularity] ?? granularity;
  const suggestion = suggestCoarserGranularity(granularity, rangeDays);

  return new Promise((resolve) => {
    Modal.confirm({
      title: 'Большой объём точек в серии',
      width: 540,
      okText: 'Продолжить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      content: (
        <div>
          <p>
            При <strong>{granLabel}</strong> гранулярности за выбранный период в серии может быть до{' '}
            <strong>{formatCount(points)}</strong> точек (интервалы без данных не учитываются).
          </p>
          <p>
            Это точки на графике и в памяти приложения после агрегации в БД — не сырые миллиарды записей.
            Чем больше точек, тем дольше анализ и выше нагрузка на память.
          </p>
          <p>
            Для периода {rangeDays} дн. рекомендуется гранулярность {suggestion}.
          </p>
          <p>Всё равно запустить анализ?</p>
        </div>
      ),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
