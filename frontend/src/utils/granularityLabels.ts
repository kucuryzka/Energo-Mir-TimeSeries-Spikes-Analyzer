/**
 * Человекочитаемые подписи гранулярности для заголовков экранов анализа
 * (подзаголовок «… детализация»). Используется на телеметрии и в generic-анализаторе.
 *
 * Не путать с:
 *  - GRANULARITY_OPTIONS в ui/TelemetryControls (варианты выпадающего списка, другой текст);
 *  - GRANULARITY_LABELS в utils/granularityWarning (прилагательные для предупреждения).
 */
export const GRANULARITY_LABEL: Record<string, string> = {
  Minute: 'Поминутная',
  Hour: 'Почасовая',
  Day: 'Дневная',
  Week: 'Недельная',
  Month: 'Месячная',
  Custom: 'Свой интервал',
};
