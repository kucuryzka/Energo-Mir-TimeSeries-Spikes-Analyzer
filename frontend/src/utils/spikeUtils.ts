import type { AnomalyResultDto, SpikePoint } from '../types/analytics.types';

export const getSeverity = (pValue: number): SpikePoint['severity'] => {
  if (pValue < 0.01) return 'critical';
  if (pValue < 0.05) return 'warning';
  if (pValue < 0.10) return 'info';
  return 'normal';
};

export const enrichSpikeData = (series: AnomalyResultDto[]): SpikePoint[] => {
  return series.map(point => ({
    ...point,
    severity: getSeverity(point.pValue),
    confidencePercent: (1 - point.pValue) * 100,
  }));
};

export const getSpikesOnly = (series: AnomalyResultDto[]): AnomalyResultDto[] => {
  return series.filter(point => point.isSpike);
};

export const getStatistics = (series: AnomalyResultDto[]) => {
  const values = series.map(s => s.value);
  const spikes = series.filter(s => s.isSpike);
  const criticalSpikes = spikes.filter(s => s.pValue < 0.01);
  
  return {
    totalPoints: series.length,
    totalCalls: values.reduce((a, b) => a + b, 0),
    average: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    spikesCount: spikes.length,
    criticalSpikes: criticalSpikes.length,
  };
};
