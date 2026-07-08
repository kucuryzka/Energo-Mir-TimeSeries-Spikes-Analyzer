import { apiClient } from './index';
import type { TimeGranularity } from '../types/analytics.types';
import { downloadBlob, resolveDownloadFileName } from '../utils/downloadBlob';

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
  completedBatchCount?: number;
  totalBatchCount?: number;
  avgBatchDurationMs?: number | null;
  lastBatchDurationMs?: number | null;
  postProcessDurationMs?: number | null;
}

export interface AnalysisDurationEstimate {
  estimatedDurationMs: number;
  estimatedBatchCount: number;
  avgBatchDurationMs?: number | null;
  avgPostProcessDurationMs?: number | null;
  confidence: 'high' | 'low' | 'none';
  sampleCount: number;
  batchIntervalDays: number;
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

  cancel: async (jobId: string): Promise<void> => {
    await apiClient.post(`/analysis-jobs/${jobId}/cancel`);
  },

  getEstimate: async (params: {
    database: string;
    schema: string;
    table: string;
    granularity: TimeGranularity;
    startDate: string;
    endDate: string;
  }): Promise<AnalysisDurationEstimate> => {
    const response = await apiClient.get<AnalysisDurationEstimate>('/analysis-jobs/estimate', { params });
    return response.data;
  },

  downloadExport: async (jobId: string, loadDistribution = false): Promise<void> => {
    try {
      const response = await apiClient.get(`/analysis-jobs/${jobId}/export`, {
        params: { loadDistribution },
        responseType: 'blob',
      });

      const fallbackName = `spike-analysis-${jobId}.xlsx`;
      const fileName = resolveDownloadFileName(
        response.headers['content-disposition'],
        fallbackName,
      );
      downloadBlob(response.data, fileName);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: Blob } };
        const blob = axiosError.response?.data;
        if (blob instanceof Blob) {
          const text = await blob.text();
          try {
            const payload = JSON.parse(text) as { message?: string };
            if (payload.message) {
              throw new Error(payload.message);
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== text) {
              throw parseError;
            }
          }
        }
      }
      throw error;
    }
  },
};
