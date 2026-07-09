import { useEffect, useState } from 'react';
import { analysisJobsApi } from '../api/analysisJobsApi';
import type { TimeGranularity } from '../types/analytics.types';
import { formatDurationMs } from '../utils/formatDuration';

interface UseDurationEstimateParams {
  enabled: boolean;
  database: string;
  schema: string;
  table: string;
  granularity: TimeGranularity;
  dateRange: [string, string];
  /** Телеметрия сохраняет прошлую оценку при скрытии, generic-анализатор — сбрасывает. */
  resetWhenHidden?: boolean;
}

/**
 * Дебаунсед-оценка ожидаемого времени анализа (подсказка у кнопки «Запустить анализ»).
 * Логика и формат строки идентичны исходным эффектам в TelemetryContent/GenericAnalyzer.
 */
export function useDurationEstimate({
  enabled,
  database,
  schema,
  table,
  granularity,
  dateRange,
  resetWhenHidden = false,
}: UseDurationEstimateParams): string | null {
  const [durationEstimate, setDurationEstimate] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (resetWhenHidden) setDurationEstimate(null);
      return;
    }
    const timer = window.setTimeout(() => {
      analysisJobsApi.getEstimate({
        database,
        schema,
        table,
        granularity,
        startDate: dateRange[0],
        endDate: dateRange[1],
      }).then((estimate) => {
        if (estimate.confidence === 'none' || !estimate.estimatedDurationMs) {
          setDurationEstimate(null);
          return;
        }
        const suffix = estimate.confidence === 'low'
          ? ` (мало данных, ${estimate.sampleCount})`
          : '';
        setDurationEstimate(`Ожидаемое время: ${formatDurationMs(estimate.estimatedDurationMs, true)}${suffix}`);
      }).catch(() => setDurationEstimate(null));
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, database, schema, table, granularity, dateRange]);

  return durationEstimate;
}
