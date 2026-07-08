export async function loadEventCodeMap(): Promise<Record<string, string>> {
  const url = `${import.meta.env.BASE_URL}event_codes.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('event_codes.csv not found');

  const text = await res.text();
  const map: Record<string, string> = {};
  const lines = text.split('\n');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(';');
    if (parts.length >= 3) {
      map[parts[0].trim()] = parts[2].trim() || parts[1].trim();
    } else if (parts.length >= 2) {
      map[parts[0].trim()] = parts[1].trim();
    }
  }

  return map;
}

/** Map DB/CSV event code id → human-readable label. */
export function resolveEventCodeLabel(
  code: string | number | null | undefined,
  map: Record<string, string>,
): string {
  if (code === null || code === undefined || code === '') return 'Неизвестный код';

  const raw = String(code).trim();
  if (map[raw]) return map[raw];

  // Numeric codes from DB may omit leading zeros or use float formatting.
  if (/^\d+(\.0+)?$/.test(raw)) {
    const normalized = String(parseInt(raw, 10));
    if (map[normalized]) return map[normalized];
  }

  return raw;
}
