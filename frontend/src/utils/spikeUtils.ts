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
  if (series.length === 0) {
    return {
      totalPoints: 0,
      totalCalls: 0,
      average: 0,
      max: 0,
      min: 0,
      spikesCount: 0,
      criticalSpikes: 0,
    };
  }

  let totalCalls = 0;
  let max = series[0].value;
  let min = series[0].value;
  let spikesCount = 0;
  let criticalSpikes = 0;

  for (const point of series) {
    totalCalls += point.value;
    if (point.value > max) max = point.value;
    if (point.value < min) min = point.value;
    if (point.isSpike) {
      spikesCount += 1;
      if (point.pValue < 0.01) criticalSpikes += 1;
    }
  }

  return {
    totalPoints: series.length,
    totalCalls,
    average: totalCalls / series.length,
    max,
    min,
    spikesCount,
    criticalSpikes,
  };
};
