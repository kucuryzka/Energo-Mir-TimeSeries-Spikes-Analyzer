import type {
  SpikeResponse,
  AnomalyResultDto,
  ChannelDto,
  DataSourceDto,
  DistributionItemDto,
  ChannelContributionDto,
} from '../types/analytics.types';
import type { TablePreviewData } from '../components/GenericAnalyzer/TablePreviewCard';

export const mockSources: DataSourceDto[] = [
  { id: 'em_protocol', name: 'EM Protocol', supportedDistributions: ['EventCode', 'Категория объекта'] },
];

export const mockChannels: ChannelDto[] = [
  { id: 1, name: 'Счётчик №101 (Опора-15)' },
  { id: 2, name: 'Счётчик №204 (Опора-32)' },
  { id: 3, name: 'Счётчик №317 (ТП-7)' },
  { id: 4, name: 'Счётчик №418 (Опора-9)' },
  { id: 5, name: 'Счётчик №529 (ТП-12)' },
];

export const mockDistributionCategories: Record<string, DistributionItemDto[]> = {
  EventCode: [
    { category: '1001', count: 142 },
    { category: '1042', count: 87 },
    { category: '2005', count: 53 },
    { category: '9099', count: 21 },
  ],
  'Категория объекта': [
    { category: 'Опора', count: 210 },
    { category: 'ТП', count: 93 },
  ],
};

function buildChannelBreakdown(baseValue: number, isSpike: boolean): ChannelContributionDto[] {
  return mockChannels.slice(0, 3).map((c, idx) => ({
    channelId: c.id,
    channelName: c.name,
    eventCode: isSpike && idx === 0 ? '9099' : '1001',
    count: Math.max(0, Math.round(baseValue * (0.4 - idx * 0.1))),
  }));
}

export function generateMockSeries(startDate: string, endDate: string): AnomalyResultDto[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const hourMs = 60 * 60 * 1000;
  const totalHours = Math.max(1, Math.min(24 * 90, Math.round((end - start) / hourMs)));

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

    const value = Math.max(0, Math.round(baseValue + noise));

    return {
      timestamp: new Date(ts).toISOString(),
      value,
      isSpike,
      pValue,
      channelBreakdown: buildChannelBreakdown(value, isSpike),
    };
  });
}

export function generateMockDistribution(): ChannelContributionDto[] {
  return mockChannels.map((c, idx) => ({
    channelId: c.id,
    channelName: c.name,
    count: Math.round(300 - idx * 45 + Math.random() * 40),
  }));
}

export function generateMockSpikeResponse(startDate: string, endDate: string): SpikeResponse {
  return {
    series: generateMockSeries(startDate, endDate),
    distribution: generateMockDistribution(),
  };
}

export function mockTablePreview(timeColumn: string): TablePreviewData {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const makeRows = (offsetDays: number) =>
    Array.from({ length: 5 }, (_, i) => ({
      Id: offsetDays * 1000 + i,
      [timeColumn]: new Date(now - (offsetDays + i) * dayMs).toISOString(),
      ObjectId: mockChannels[i % mockChannels.length].id,
      Value: Math.round(Math.random() * 200),
    }));

  return {
    minDate: new Date(now - 365 * dayMs).toISOString(),
    maxDate: new Date(now).toISOString(),
    approximateRowCount: 5_604_421,
    earliestRows: makeRows(360),
    latestRows: makeRows(0),
  };
}

export function mockPointDetailsRows(): any[] {
  return Array.from({ length: 8 }, (_, i) => ({
    idObject: 100 + i,
    objectName: mockChannels[i % mockChannels.length].name,
    idObjectAggregate: 200 + i,
    idObjectAverage: 300 + i,
    quality: 'Good',
    qualitySource: 'Good',
    source: Math.round(Math.random() * 5),
    valueMetering: Math.round(Math.random() * 500),
  }));
}

export function mockPointChannels(): ChannelContributionDto[] {
  return mockChannels.map((c, idx) => ({
    channelId: c.id,
    channelName: c.name,
    eventCode: idx === 0 ? '9099' : '1001',
    count: Math.round(50 + Math.random() * 100),
  }));
}

export function mockHistoryList(): any[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return Array.from({ length: 3 }, (_, i) => ({
    id: `mock-job-${i}`,
    startDate: new Date(now - (i + 8) * dayMs).toISOString(),
    endDate: new Date(now - (i + 1) * dayMs).toISOString(),
    channelId: null,
    granularity: 'Hour',
    status: 'Completed',
    createdAt: new Date(now - (i + 8) * dayMs).toISOString(),
    completedAt: new Date(now - (i + 8) * dayMs + 5 * 60 * 1000).toISOString(),
  }));
}

export const mockDatabases: string[] = ['MockDB'];
export const mockSchemas: Record<string, string[]> = {
  MockDB: ['dbo', 'em_protocol'],
};
export const mockTables: string[] = ['METERINGS', 'Records'];
export const mockColumns: { name: string; isTimeColumn: boolean }[] = [
  { name: 'Id', isTimeColumn: false },
  { name: 'TIME_INSERT', isTimeColumn: true },
  { name: 'Value', isTimeColumn: false },
];
