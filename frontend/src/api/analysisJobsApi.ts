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
  completedAt?: string | null;
  timeColumn: string;
  customMinutes?: number | null;
  channelId?: string | null;
  queuePosition?: number | null;
  hasPartialResult: boolean;
  hasResult: boolean;
}

export interface AnalysisJobsOverview {
  active: AnalysisJobQueueItem[];
  recent: AnalysisJobQueueItem[];
}

export const analysisJobsApi = {
  getOverview: async (database?: string, recentLimit = 50): Promise<AnalysisJobsOverview> => {
    const response = await apiClient.get<AnalysisJobsOverview>('/analysis-jobs/overview', {
      params: {
        ...(database ? { database } : {}),
        recentLimit,
      },
    });
    return response.data;
  },

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
