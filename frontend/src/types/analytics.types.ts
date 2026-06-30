export type TimeGranularity = 'Minute' | 'Hour' | 'Day' | 'Week' | 'Custom';

export interface DetectSpikesRequest {
  granularity: TimeGranularity;
  customMinutes?: number | null;
  confidence: number;
  windowSize: number;
  startDate: string; // ISO формат
  endDate: string;   // ISO формат
}

export interface AnomalyResultDto {
  timestamp: string;
  value: number;
  isSpike: boolean;
  pValue: number;
}

export interface SpikeResponse {
  series: AnomalyResultDto[];
}

export interface SpikePoint extends AnomalyResultDto {
  severity: 'critical' | 'warning' | 'info' | 'normal';
  confidencePercent: number;
}
