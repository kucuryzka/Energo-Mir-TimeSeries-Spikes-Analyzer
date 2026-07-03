import axios from 'axios';
import type { DetectSpikesRequest, SpikeResponse, ChannelDto, DataSourceDto, DistributionItemDto } from '../types/analytics.types';

// Используем HTTP, порт 5090 (из launchSettings.json)
const API_BASE_URL = 'http://localhost:5090';

// 👇 Переключатель: true = используем мок-данные, false = реальный бэкенд
const USE_MOCK = false;

export const analyticsApi = {
  getSources: async (): Promise<DataSourceDto[]> => {
    if (USE_MOCK) return [{ id: 'mock', name: 'Мок источник', kind: 'EmProtocol', provider: 'SqlServer', supportedDistributions: ['MockCategory'] }];
    const response = await axios.get<DataSourceDto[]>(`${API_BASE_URL}/api/sources`);
    return response.data;
  },

  emProtocol: {
    getDistribution: async (sourceId: string, startDate: string, endDate: string, categoryName: string): Promise<DistributionItemDto[]> => {
      const response = await axios.get<DistributionItemDto[]>(`${API_BASE_URL}/api/em-protocol/distribution`, {
        params: { sourceId, startDate, endDate, categoryName }
      });
      return response.data;
    },
    getChannels: async (sourceId: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      const response = await axios.get<ChannelDto[]>(`${API_BASE_URL}/api/em-protocol/channels`, {
        params: { sourceId, search, page, pageSize }
      });
      return response.data;
    },
    detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
      const response = await axios.post<SpikeResponse>(`${API_BASE_URL}/api/em-protocol/detect-spikes`, request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    }
  },

  dbo: {
    detectSpikes: async (request: DetectSpikesRequest): Promise<SpikeResponse> => {
      const response = await axios.post<SpikeResponse>(`${API_BASE_URL}/api/dbo/detect-spikes`, request, {
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    },
    getObjects: async (sourceId: string, search?: string, page: number = 1, pageSize: number = 50): Promise<ChannelDto[]> => {
      const response = await axios.get<ChannelDto[]>(`${API_BASE_URL}/api/dbo/objects`, {
        params: { sourceId, search, page, pageSize }
      });
      return response.data;
    },
    getPointDetails: async (sourceId: string, timestamp: string, granularity: string, customMinutes?: number, channelId?: number): Promise<any[]> => {
      const response = await axios.get<any[]>(`${API_BASE_URL}/api/dbo/point-details`, {
        params: { sourceId, timestamp, granularity, customMinutes, channelId }
      });
      return response.data;
    }
  }
};
