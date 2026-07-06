import { apiClient } from './index';
import type { DetectSpikesRequest, SpikeResponse, ChannelDto, DataSourceDto, DistributionItemDto, ChannelContributionDto } from '../types/analytics.types';
import { apiCache } from '../store/apiCache';
import { pollAnalysisJob, type AnalysisJobApi } from '../utils/jobPolling';

const USE_MOCK = false;

async function pollJobResult(
  api: AnalysisJobApi,
  jobId: string,
  onProgress?: (progress: number) => void,
  onPartialResult?: (result: SpikeResponse) => void,
): Promise<SpikeResponse> {
  return pollAnalysisJob(jobId, api, { onProgress, onPartialResult });
}

export const analyticsApi = {
  getSources: async (): Promise<DataSourceDto[]> => {
    if (USE_MOCK) return [{ id: 'mock', name: 'Мок источник', supportedDistributions: ['MockCategory'] }];
    const response = await apiClient.get<DataSourceDto[]>('/sources');
    return response.data;
  },

  emProtocol: {
    getDistribution: async (database: string, startDate: string, endDate: string, categoryName: string): Promise<DistributionItemDto[]> => {
      const response = await apiClient.get<DistributionItemDto[]>('/em-protocol/distribution', {
        params: { database, startDate, endDate, categoryName }
      });
      return response.data;
    },
    getChannels: async (database: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      const response = await apiClient.get<ChannelDto[]>('/em-protocol/channels', {
        params: { database, search, page, pageSize }
      });
      return response.data;
    },
    enqueueAnalysis: async (request: DetectSpikesRequest): Promise<{ jobId: string }> => {
      const response = await apiClient.post<{ jobId: string }>('/em-protocol/enqueue', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    runAnalysis: async (
      request: DetectSpikesRequest,
      onProgress?: (progress: number) => void,
      onPartialResult?: (result: SpikeResponse) => void,
    ): Promise<SpikeResponse> => {
      const { jobId } = await analyticsApi.emProtocol.enqueueAnalysis(request);
      return pollJobResult(
        {
          getJobStatus: analyticsApi.emProtocol.getJobStatus,
          getJobResult: analyticsApi.emProtocol.getJobResult,
          getJobPartialResult: analyticsApi.emProtocol.getJobPartialResult,
        },
        jobId,
        onProgress,
        onPartialResult,
      );
    },
    getJobStatus: async (jobId: string): Promise<any> => {
      const response = await apiClient.get<any>(`/em-protocol/status/${jobId}`);
      return response.data;
    },
    getJobResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/em-protocol/result/${jobId}`);
      return response.data;
    },
    getJobPartialResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/em-protocol/partial-result/${jobId}`);
      return response.data;
    },
    getHistory: async (database: string): Promise<any[]> => {
      const response = await apiClient.get<any[]>('/em-protocol/history', { params: { database } });
      return response.data;
    },
    deleteHistoryItem: async (jobId: string): Promise<void> => {
      await apiClient.delete(`/em-protocol/history/${jobId}`);
    },
    getTablePreview: async (database: string, limit = 15): Promise<any> => {
      const response = await apiClient.get('/em-protocol/preview', { params: { database, limit } });
      return response.data;
    },
    getPointChannels: async (
      database: string,
      timestamp: string,
      granularity: string,
      customMinutes?: number,
      channelId?: number
    ): Promise<ChannelContributionDto[]> => {
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const response = await apiClient.get<ChannelContributionDto[]>('/em-protocol/point-channels', { params });
      return response.data;
    }
  },

  dbo: {
    enqueueAnalysis: async (request: DetectSpikesRequest): Promise<{ jobId: string }> => {
      const response = await apiClient.post<{ jobId: string }>('/dbo/enqueue', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    runAnalysis: async (
      request: DetectSpikesRequest,
      onProgress?: (progress: number) => void,
      onPartialResult?: (result: SpikeResponse) => void,
    ): Promise<SpikeResponse> => {
      const { jobId } = await analyticsApi.dbo.enqueueAnalysis(request);
      return pollJobResult(
        {
          getJobStatus: analyticsApi.dbo.getJobStatus,
          getJobResult: analyticsApi.dbo.getJobResult,
          getJobPartialResult: analyticsApi.dbo.getJobPartialResult,
        },
        jobId,
        onProgress,
        onPartialResult,
      );
    },
    getJobStatus: async (jobId: string): Promise<any> => {
      const response = await apiClient.get<any>(`/dbo/status/${jobId}`);
      return response.data;
    },
    getJobResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/dbo/result/${jobId}`);
      return response.data;
    },
    getJobPartialResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/dbo/partial-result/${jobId}`);
      return response.data;
    },
    getHistory: async (database: string): Promise<any[]> => {
      const response = await apiClient.get<any[]>('/dbo/history', { params: { database } });
      return response.data;
    },
    deleteHistoryItem: async (jobId: string): Promise<void> => {
      await apiClient.delete(`/dbo/history/${jobId}`);
    },
    getObjects: async (database: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      const response = await apiClient.get<ChannelDto[]>('/dbo/objects', {
        params: { database, search, page, pageSize }
      });
      return response.data;
    },
    getTablePreview: async (database: string, limit = 15): Promise<any> => {
      const response = await apiClient.get('/dbo/preview', { params: { database, limit } });
      return response.data;
    },
    getPointDetails: async (database: string, timestamp: string, granularity: string, customMinutes?: number, channelId?: number): Promise<any[]> => {
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const cached = apiCache.get('/dbo/point-details', params, undefined);
      if (cached) return cached;
      const response = await apiClient.get<any[]>('/dbo/point-details', { params });
      apiCache.set('/dbo/point-details', params, undefined, response.data);
      return response.data;
    },
    getPointChannels: async (
      database: string,
      timestamp: string,
      granularity: string,
      customMinutes?: number,
      channelId?: number
    ): Promise<ChannelContributionDto[]> => {
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const response = await apiClient.get<ChannelContributionDto[]>('/dbo/point-channels', { params });
      return response.data;
    }
  }
};
