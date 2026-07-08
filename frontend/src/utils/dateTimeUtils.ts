import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export function parseUtcTimestamp(value: string | Date | null | undefined): number {
  if (value == null) return Number.NaN;
  return dayjs.utc(value).valueOf();
}

export function formatUtcDateTime(
  value: string | Date | null | undefined,
  format = 'DD.MM.YYYY HH:mm:ss',
): string {
  if (value == null) return '—';
  return dayjs.utc(value).local().format(format);
}
