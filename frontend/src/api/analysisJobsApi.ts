import { apiClient } from './index';
import type { TimeGranularity } from '../types/analytics.types';
import { downloadBlob, resolveDownloadFileName } from '../utils/downloadBlob';

export interface AnalysisJobQueueItem {
  id: string;
  queueJobKind?: string;
  parentJobId?: string | null;
  supplementLabel?: string | null;
  status: string;
  progress: number;
  database: string;
  connectionHint?: string | null;
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
  canResume?: boolean;
  canRetry?: boolean;
  errorMessage?: string | null;
  completedBatchCount?: number;
  totalBatchCount?: number;
  avgBatchDurationMs?: number | null;
  lastBatchDurationMs?: number | null;
  postProcessDurationMs?: number | null;
  activeDurationMs?: number | null;
  runningStartedAt?: string | null;
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

  resume: async (jobId: string): Promise<void> => {
    await apiClient.post(`/analysis-jobs/${jobId}/resume`);
  },

  retry: async (jobId: string): Promise<void> => {
    await apiClient.post(`/analysis-jobs/${jobId}/retry`);
  },

  enqueueDistribution: async (parentJobId: string): Promise<{ supplementJobId: string }> => {
    const response = await apiClient.post<{ supplementJobId: string }>(
      `/analysis-jobs/${parentJobId}/distribution/enqueue`,
    );
    return response.data;
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

      if (!(response.data instanceof Blob) || response.data.size === 0) {
        throw new Error('Сервер вернул пустой файл Excel');
      }

      const fallbackName = `spike-analysis-${jobId}.xlsx`;
      const fileName = resolveDownloadFileName(
        response.headers['content-disposition'],
        fallbackName,
      );
      downloadBlob(response.data, fileName);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number; data?: Blob } };
        const status = axiosError.response?.status;
        const blob = axiosError.response?.data;
        if (blob instanceof Blob) {
          const text = await blob.text();
          const trimmed = text.trim();
          if (trimmed.length === 0) {
            if (status === 404) {
              throw new Error('Экспорт недоступен на сервере — перезапустите API');
            }
            if (status === 401) {
              throw new Error('Сессия истекла — войдите заново');
            }
            throw new Error(`Не удалось скачать Excel (HTTP ${status ?? '?'})`);
          }

          try {
            const payload = JSON.parse(trimmed) as { message?: string };
            if (payload?.message) {
              throw new Error(payload.message);
            }
          } catch {
            // Сервер мог вернуть не JSON (например HTML/пусто). Не валимся на JSON.parse.
            const preview = trimmed.length > 250 ? `${trimmed.slice(0, 250)}…` : trimmed;
            throw new Error(preview || 'Не удалось скачать Excel');
          }
        }
      }
      throw error;
    }
  },
};
