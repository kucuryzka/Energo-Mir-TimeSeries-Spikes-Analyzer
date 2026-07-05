import type { SpikeResponse, DataSourceDto, ChannelDto, DistributionItemDto, AnomalyResultDto } from '../types/analytics.types';

export const mockData: SpikeResponse = {
  series: [
    // Генерируем данные для 7 дней с почасовым шагом
    ...Array.from({ length: 24 * 7 }, (_, i) => {
      const hour = i % 24;
      const day = Math.floor(i / 24);

      // Базовое значение (дневная динамика)
      let baseValue = 20 + Math.sin(hour / 24 * 2 * Math.PI) * 15;

      // Пик в 9 утра
      if (hour === 9) baseValue = 120;
      if (hour === 10) baseValue = 95;

      // Пик в 18 вечера
      if (hour === 18) baseValue = 80;

      // Добавляем случайный шум
      const noise = Math.random() * 20 - 10;

      // Несколько искусственных всплесков
      let isSpike = false;
      let pValue = 0.5;

      // Всплеск в день 2 в 14:00
      if (day === 2 && hour === 14) {
        isSpike = true;
        pValue = 0.003;
        baseValue = 150;
      }

      // Всплеск в день 5 в 11:00
      if (day === 5 && hour === 11) {
        isSpike = true;
        pValue = 0.012;
        baseValue = 180;
      }

      // Всплеск в день 6 в 16:00
      if (day === 6 && hour === 16) {
        isSpike = true;
        pValue = 0.001;
        baseValue = 210;
      }

      const date = new Date(2026, 5, 18 + day, hour);

      const channelBreakdown = [
        { channelId: 1, channelName: 'Счётчик №101 (Опора-15)', eventCode: 'E-01', count: Math.round(baseValue * 0.4) },
        { channelId: 2, channelName: 'Счётчик №204 (Опора-32)', eventCode: 'E-02', count: Math.round(baseValue * 0.35) },
        { channelId: 3, channelName: 'Счётчик №317 (ТП-7)', eventCode: isSpike ? 'E-99' : 'E-01', count: Math.round(baseValue * 0.25) },
      ];

      return {
        timestamp: date.toISOString(),
        value: Math.max(0, Math.round(baseValue + noise)),
        isSpike,
        pValue,
        channelBreakdown,
      };
    }),
  ],
};

export const mockDatabases: string[] = [
  'master',
  'tempdb',
  'model',
  'msdb',
  'Sunrise2',
  'sunrise_journal',
  'sunrise_ur_06_2024_2_Journal',
  'sunrise_ur_06_2024_2',
];

export const mockSchemas: Record<string, string[]> = {
  Sunrise2: [
    'dbo', 'Commands', 'Measures', 'sunrise', 'notes', 'config', 'acs',
    'em_report', 'em_protocol', 'em_osc', 'em_communication', 'sunrise_cfg',
    'em_comm', 'bus', 'sunrise.integrations.pc',
  ],
  sunrise_ur_06_2024_2: ['dbo', 'acs', 'em_report', 'em_protocol'],
};

export const mockTables: string[] = ['Channels', 'Events', 'Measurements', 'Config'];

export const mockColumns: { name: string; isTimeColumn: boolean }[] = [
  { name: 'Id', isTimeColumn: false },
  { name: 'Timestamp', isTimeColumn: true },
  { name: 'Value', isTimeColumn: false },
  { name: 'ChannelId', isTimeColumn: false },
];

export const mockSources: DataSourceDto[] = [
  { id: 'dbo', name: 'DBO', supportedDistributions: [] },
  { id: 'em_protocol', name: 'EM Protocol', supportedDistributions: ['Тип события', 'Категория объекта'] },
];

export const mockChannels: ChannelDto[] = [
  { id: 1, name: 'Счётчик №101 (Опора-15)' },
  { id: 2, name: 'Счётчик №204 (Опора-32)' },
  { id: 3, name: 'Счётчик №317 (ТП-7)' },
  { id: 4, name: 'Счётчик №418 (Опора-9)' },
  { id: 5, name: 'Счётчик №529 (ТП-12)' },
];

export const mockDistributions: Record<string, DistributionItemDto[]> = {
  'Тип события': [
    { category: 'Скачок напряжения', count: 142 },
    { category: 'Обрыв связи', count: 87 },
    { category: 'Превышение тока', count: 53 },
    { category: 'Прочее', count: 21 },
  ],
  'Категория объекта': [
    { category: 'Опора', count: 210 },
    { category: 'ТП', count: 93 },
  ],
};

export function generateMockSeries(startDate: string, endDate: string): AnomalyResultDto[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const hourMs = 60 * 60 * 1000;
  const totalHours = Math.max(1, Math.min(24 * 60, Math.round((end - start) / hourMs)));

  return Array.from({ length: totalHours }, (_, i) => {
    const ts = start + i * hourMs;
    const hourOfDay = new Date(ts).getHours();
    let baseValue = 20 + Math.sin((hourOfDay / 24) * 2 * Math.PI) * 15;

    if (hourOfDay === 9) baseValue = 120;
    if (hourOfDay === 18) baseValue = 80;

    const noise = Math.random() * 20 - 10;
    const isSpike = Math.random() < 0.04;
    const pValue = isSpike ? Math.random() * 0.02 : 0.3 + Math.random() * 0.6;
    if (isSpike) baseValue = 150 + Math.random() * 80;

    const channelBreakdown = mockChannels.slice(0, 3).map((c, idx) => ({
      channelId: c.id,
      channelName: c.name,
      eventCode: isSpike && idx === 0 ? 'E-99' : 'E-01',
      count: Math.round(baseValue * (0.4 - idx * 0.1)),
    }));

    return {
      timestamp: new Date(ts).toISOString(),
      value: Math.max(0, Math.round(baseValue + noise)),
      isSpike,
      pValue,
      channelBreakdown,
    };
  });
}
