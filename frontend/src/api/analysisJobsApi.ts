import { apiClient } from './index';
import type { TimeGranularity } from '../types/analytics.types';

export interface AnalysisJobQueueItem {
  id: string;
  status: string;
  progress: number;
  database: string;
  schema: string;
  table: string;
  sourceKind: string;
  startDate: string;
  endDate: string;
  granularity: TimeGranularity;
  createdAt: string;
  queuePosition?: number | null;
  hasPartialResult: boolean;
}

export const analysisJobsApi = {
  getQueue: async (database?: string): Promise<AnalysisJobQueueItem[]> => {
    const response = await apiClient.get<AnalysisJobQueueItem[]>('/analysis-jobs/queue', {
      params: database ? { database } : undefined,
    });
    return response.data;
  },

  cancel: async (jobId: string): Promise<void> => {
    await apiClient.post(`/analysis-jobs/${jobId}/cancel`);
  },
};
