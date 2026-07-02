import { apiClient } from './index';
import type { DetectSpikesRequest, SpikeResponse, ChannelDto, DataSourceDto, DistributionItemDto } from '../types/analytics.types';
import { apiCache } from '../store/apiCache';

// 👇 Переключатель: true = используем мок-данные, false = реальный бэкенд
const USE_MOCK = false;

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
    detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
      const cached = apiCache.get('/em-protocol/detect-spikes', undefined, request);
      if (cached) return cached;
      const response = await apiClient.post<SpikeResponse>('/em-protocol/detect-spikes', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      apiCache.set('/em-protocol/detect-spikes', undefined, request, response.data);
      return response.data;
    }
  },

  dbo: {
    detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
      const cached = apiCache.get('/dbo/detect-spikes', undefined, request);
      if (cached) return cached;
      const response = await apiClient.post<SpikeResponse>('/dbo/detect-spikes', request, {
        headers: { 'Content-Type': 'application/json' }
      });
      apiCache.set('/dbo/detect-spikes', undefined, request, response.data);
      return response.data;
    },
    getObjects: async (database: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
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
