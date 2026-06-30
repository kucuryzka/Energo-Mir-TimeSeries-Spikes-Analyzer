export type TimeGranularity = 'Minute' | 'Hour' | 'Day' | 'Week' | 'Custom';

export interface DataSourceDto {
  id: string;
  name: string;
  supportedDistributions?: string[];
}

export interface DistributionItemDto {
  category: string;
  count: number;
}

export interface DetectSpikesRequest {
  sourceId: string;
  channelId?: number | null;
  granularity: TimeGranularity;
  customMinutes?: number | null;
  confidence: number;
  windowSize: number;
  startDate: string; // ISO формат
  endDate: string;   // ISO формат
}

export interface ChannelDto {
  id: number;
  name: string;
}

export interface AnomalyResultDto {
  timestamp: string;
  value: number;
  isSpike: boolean;
  pValue: number;
  channelBreakdown?: ChannelContributionDto[];
}

export interface ChannelContributionDto {
  channelId: number;
  channelName: string;
  count: number;
}

export interface SpikeResponse {
  series: AnomalyResultDto[];
}

export interface SpikePoint extends AnomalyResultDto {
  severity: 'critical' | 'warning' | 'info' | 'normal';
  confidencePercent: number;
}
