export function formatDurationMs(ms: number, approximate = false): string {
  const prefix = approximate ? '~' : '';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${prefix}${h}ч ${m.toString().padStart(2, '0')}м`;
  if (m > 0) return `${prefix}${m}м ${s.toString().padStart(2, '0')}с`;
  return `${prefix}${s}с`;
}
