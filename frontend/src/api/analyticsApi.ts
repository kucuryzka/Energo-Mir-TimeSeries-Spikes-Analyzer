import { apiClient } from './index';
import type { DetectSpikesRequest, SpikeResponse, ChannelDto, DataSourceDto, DistributionItemDto } from '../types/analytics.types';
import { apiCache } from '../store/apiCache';
import { mockSources, mockChannels, mockDistributions, generateMockSeries } from '../mocks/mockData';

// 👇 Переключатель: true = используем мок-данные, false = реальный бэкенд
const USE_MOCK = true;

const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

export const analyticsApi = {
  getSources: async (): Promise<DataSourceDto[]> => {
    if (USE_MOCK) { await delay(); return mockSources; }
    const response = await apiClient.get<DataSourceDto[]>('/sources');
    return response.data;
  },

  emProtocol: {
    getDistribution: async (database: string, startDate: string, endDate: string, categoryName: string): Promise<DistributionItemDto[]> => {
      if (USE_MOCK) { await delay(); return mockDistributions[categoryName] ?? []; }
      const response = await apiClient.get<DistributionItemDto[]>('/em-protocol/distribution', {
        params: { database, startDate, endDate, categoryName }
      });
      return response.data;
    },
    getChannels: async (database: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      if (USE_MOCK) {
        await delay();
        const filtered = search ? mockChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : mockChannels;
        return filtered;
      }
      const response = await apiClient.get<ChannelDto[]>('/em-protocol/channels', {
        params: { database, search, page, pageSize }
      });
      return response.data;
    },
    detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
      if (USE_MOCK) { await delay(500); return { series: generateMockSeries(request.startDate, request.endDate) }; }
      // Legacy synchronous call fallback if needed, but we now use enqueue.
      const response = await apiClient.post<SpikeResponse>('/em-protocol/detect-spikes', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    enqueueAnalysis: async (request: DetectSpikesRequest): Promise<{ jobId: string }> => {
      const response = await apiClient.post<{ jobId: string }>('/em-protocol/enqueue', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    getJobStatus: async (jobId: string): Promise<any> => {
      const response = await apiClient.get<any>(`/em-protocol/status/${jobId}`);
      return response.data;
    },
    getJobResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/em-protocol/result/${jobId}`);
      return response.data;
    },
    getHistory: async (database: string): Promise<any[]> => {
      const response = await apiClient.get<any[]>('/em-protocol/history', { params: { database } });
      return response.data;
    },
    deleteHistoryItem: async (jobId: string): Promise<void> => {
      await apiClient.delete(`/em-protocol/history/${jobId}`);
    }
  },

  dbo: {
    detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
      if (USE_MOCK) { await delay(500); return { series: generateMockSeries(request.startDate, request.endDate) }; }
      const response = await apiClient.post<SpikeResponse>('/dbo/detect-spikes', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    enqueueAnalysis: async (request: DetectSpikesRequest): Promise<{ jobId: string }> => {
      const response = await apiClient.post<{ jobId: string }>('/dbo/enqueue', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    getJobStatus: async (jobId: string): Promise<any> => {
      const response = await apiClient.get<any>(`/dbo/status/${jobId}`);
      return response.data;
    },
    getJobResult: async (jobId: string): Promise<SpikeResponse> => {
      const response = await apiClient.get<SpikeResponse>(`/dbo/result/${jobId}`);
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
      if (USE_MOCK) {
        await delay();
        const filtered = search ? mockChannels.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : mockChannels;
        return filtered;
      }
      const response = await apiClient.get<ChannelDto[]>('/dbo/objects', {
        params: { database, search, page, pageSize }
      });
      return response.data;
    },
    getPointDetails: async (database: string, timestamp: string, granularity: string, customMinutes?: number, channelId?: number): Promise<any[]> => {
      const params = { database, timestamp, granularity, customMinutes, channelId };
      const cached = apiCache.get('/dbo/point-details', params, undefined);
      if (cached) return cached;
      const response = await apiClient.get<any[]>('/dbo/point-details', { params });
      apiCache.set('/dbo/point-details', params, undefined, response.data);
      return response.data;
    }
  }
};
