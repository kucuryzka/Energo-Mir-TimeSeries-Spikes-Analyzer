import { analyticsApi } from '../api/analyticsApi';
import type { AnalysisJobQueueItem } from '../api/analysisJobsApi';
import { genericAnalysisApi } from '../api/explorerApi';
import type { SpikeResponse, TimeGranularity } from '../types/analytics.types';
import type { AnalysisJobApi } from './jobPolling';

export interface PendingAnalysisJobOpen {
  id: string;
  status: string;
  progress: number;
  database: string;
  schema: string;
  table: string;
  timeColumn: string;
  sourceKind: string;
  startDate: string;
  endDate: string;
  granularity: TimeGranularity;
  customMinutes?: number | null;
  channelId?: string | null;
  hasPartialResult: boolean;
  hasResult: boolean;
}

export function toPendingAnalysisJobOpen(job: AnalysisJobQueueItem): PendingAnalysisJobOpen {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    database: job.database,
    schema: job.schema,
    table: job.table,
    timeColumn: job.timeColumn,
    sourceKind: job.sourceKind,
    startDate: job.startDate,
    endDate: job.endDate,
    granularity: job.granularity,
    customMinutes: job.customMinutes,
    channelId: job.channelId,
    hasPartialResult: job.hasPartialResult,
    hasResult: job.hasResult,
  };
}

export function getAnalysisJobApi(sourceKind: string): AnalysisJobApi {
  switch (sourceKind) {
    case 'dbo':
      return {
        getJobStatus: analyticsApi.dbo.getJobStatus,
        getJobResult: analyticsApi.dbo.getJobResult,
        getJobPartialResult: analyticsApi.dbo.getJobPartialResult,
      };
    case 'em_protocol':
      return {
        getJobStatus: analyticsApi.emProtocol.getJobStatus,
        getJobResult: analyticsApi.emProtocol.getJobResult,
        getJobPartialResult: analyticsApi.emProtocol.getJobPartialResult,
      };
    default:
      return {
        getJobStatus: genericAnalysisApi.getJobStatus,
        getJobResult: genericAnalysisApi.getJobResult,
        getJobPartialResult: genericAnalysisApi.getJobPartialResult,
      };
  }
}

export function canOpenAnalysisJob(job: Pick<AnalysisJobQueueItem, 'status' | 'hasResult' | 'hasPartialResult'>): boolean {
  if (job.status === 'Completed') return job.hasResult;
  if (job.status === 'Cancelled') return job.hasPartialResult;
  if (job.status === 'Running') return job.hasPartialResult;
  return false;
}

export async function loadAnalysisJobResult(
  job: PendingAnalysisJobOpen,
): Promise<{ result: SpikeResponse | null; isPartial: boolean }> {
  const api = getAnalysisJobApi(job.sourceKind);

  if (job.status === 'Completed') {
    const result = await api.getJobResult(job.id);
    return { result, isPartial: false };
  }

  if (job.status === 'Cancelled' && job.hasPartialResult && api.getJobPartialResult) {
    const result = await api.getJobPartialResult(job.id);
    return { result, isPartial: true };
  }

  if ((job.status === 'Running' || job.status === 'Pending') && api.getJobPartialResult) {
    try {
      const result = await api.getJobPartialResult(job.id);
      if (result?.series?.length) {
        return { result, isPartial: true };
      }
    } catch {
    }
  }

  return { result: null, isPartial: false };
}
